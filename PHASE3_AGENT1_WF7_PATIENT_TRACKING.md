# NovaCare — Phase 3 | Agent 1
## Workflows: WF7 — Daily Patient Tracking (Vitals, Mood, Activity, Diet, Water)
> Paste NOVACARE_MASTER.md into context first, then this file.
> Branch: `phase3/patient-tracking`
> Model: Claude Opus
> Dependency: Phase 2 merged into `develop`.

---

## Goal
Build the complete daily health tracking system. Patients log vitals, mood, diet, water, activity every day. AI auto-analyzes entries and flags concerning patterns. This is the data engine that powers the doctor dashboard and weekly reports.

---

## WF7 Part A — Backend Tracking Routes

### Vitals Router
`services/api/routers/vitals.py`:
```python
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime, timedelta
from dependencies import get_current_user, supabase
from services.ai.providers import ai_complete

router = APIRouter()


class VitalsEntry(BaseModel):
    systolic_bp: Optional[int] = None
    diastolic_bp: Optional[int] = None
    heart_rate: Optional[int] = None
    blood_sugar_fasting: Optional[float] = None
    blood_sugar_pp: Optional[float] = None
    spo2: Optional[int] = None
    temperature: Optional[float] = None
    weight_kg: Optional[float] = None


class WellnessEntry(BaseModel):
    mood_score: Optional[int] = None      # 1-5
    mood_note: Optional[str] = None
    sleep_hours: Optional[float] = None
    sleep_quality: Optional[int] = None   # 1-5
    steps_count: Optional[int] = None
    exercise_minutes: Optional[int] = None
    exercise_type: Optional[str] = None
    water_ml: Optional[int] = None
    meals_logged: Optional[list] = None   # [{meal, items, calories}]
    diet_score: Optional[int] = None      # 1-5


@router.post("/log")
async def log_vitals(entry: VitalsEntry, user=Depends(get_current_user)):
    """Log a vitals entry. DB trigger auto-flags critical values."""
    data = {k: v for k, v in entry.dict().items() if v is not None}
    data["patient_id"] = user.id

    # AI quick analysis
    vitals_text = ", ".join(f"{k}={v}" for k, v in data.items() if k != "patient_id")
    try:
        analysis = await ai_complete(
            "quick_analysis",
            [{"role": "user", "content": f"Briefly assess these vitals in 1 sentence (no diagnosis): {vitals_text}"}]
        )
        data["ai_analysis"] = analysis
    except Exception:
        pass

    res = supabase.table("vitals_logs").insert(data).execute()
    record = res.data[0]

    # If flagged as critical, notify doctor (real notification in Phase 4)
    if record.get("risk_level") in ("critical", "warning"):
        supabase.table("doctor_patient_links")\
            .select("doctor_id")\
            .eq("patient_id", user.id).eq("active", True)\
            .execute()
        # TODO: trigger push notification to doctor in Phase 4

    return {"success": True, "data": record, "error": None}


@router.post("/wellness")
async def log_wellness(entry: WellnessEntry, user=Depends(get_current_user)):
    """Log daily wellness (mood, sleep, activity, water, diet). One entry per day."""
    data = {k: v for k, v in entry.dict().items() if v is not None}
    data["patient_id"] = user.id
    data["log_date"] = str(date.today())

    # Check for existing entry today
    existing = supabase.table("wellness_logs")\
        .select("id").eq("patient_id", user.id).eq("log_date", data["log_date"]).execute()

    if existing.data:
        res = supabase.table("wellness_logs")\
            .update(data).eq("id", existing.data[0]["id"]).execute()
    else:
        res = supabase.table("wellness_logs").insert(data).execute()

    # Generate AI daily summary if mood + at least 2 other fields present
    record = res.data[0]
    filled = sum(1 for k in ["sleep_hours", "steps_count", "water_ml", "diet_score"] if data.get(k))
    if data.get("mood_score") and filled >= 2:
        try:
            summary_prompt = f"""In 1-2 warm, encouraging sentences, summarize this patient's day:
Mood: {data.get('mood_score')}/5 ({data.get('mood_note', 'no note')})
Sleep: {data.get('sleep_hours')}h (quality {data.get('sleep_quality')}/5)
Water: {data.get('water_ml')}ml
Steps: {data.get('steps_count')}
Exercise: {data.get('exercise_minutes')}min of {data.get('exercise_type','activity')}
Diet score: {data.get('diet_score')}/5
End with one specific tip for tomorrow."""

            summary = await ai_complete(
                "quick_analysis",
                [{"role": "user", "content": summary_prompt}]
            )
            supabase.table("wellness_logs").update({"ai_daily_summary": summary}).eq("id", record["id"]).execute()
            record["ai_daily_summary"] = summary
        except Exception:
            pass

    return {"success": True, "data": record, "error": None}


@router.get("/today")
async def get_today(user=Depends(get_current_user)):
    """Get today's vitals and wellness summary."""
    today = str(date.today())

    vitals = supabase.table("vitals_logs")\
        .select("*").eq("patient_id", user.id)\
        .order("logged_at", desc=True).limit(1).execute().data

    wellness = supabase.table("wellness_logs")\
        .select("*").eq("patient_id", user.id).eq("log_date", today).execute().data

    # Medicine adherence today
    med_logs = supabase.table("medicine_logs")\
        .select("status")\
        .eq("patient_id", user.id)\
        .gte("scheduled_time", f"{today}T00:00:00")\
        .lte("scheduled_time", f"{today}T23:59:59").execute().data or []

    taken = sum(1 for m in med_logs if m["status"] == "taken")
    total = len(med_logs)

    return {
        "success": True,
        "data": {
            "vitals": vitals[0] if vitals else None,
            "wellness": wellness[0] if wellness else None,
            "medicine_adherence": {"taken": taken, "total": total, "pct": round(taken/total*100) if total else 0},
        },
        "error": None,
    }


@router.get("/history")
async def get_history(days: int = 7, user=Depends(get_current_user)):
    """Get vitals and wellness history for past N days."""
    since = (datetime.now() - timedelta(days=days)).isoformat()

    vitals = supabase.table("vitals_logs")\
        .select("*").eq("patient_id", user.id)\
        .gte("logged_at", since)\
        .order("logged_at").execute().data or []

    wellness = supabase.table("wellness_logs")\
        .select("*").eq("patient_id", user.id)\
        .gte("log_date", (date.today() - timedelta(days=days)).isoformat())\
        .order("log_date").execute().data or []

    # Check for burnout pattern (3+ bad mood days)
    low_mood_streak = 0
    for w in sorted(wellness, key=lambda x: x["log_date"], reverse=True):
        if w.get("mood_score", 3) <= 2:
            low_mood_streak += 1
        else:
            break

    burnout_alert = low_mood_streak >= 3

    return {
        "success": True,
        "data": {"vitals": vitals, "wellness": wellness, "burnout_alert": burnout_alert},
        "error": None,
    }
```

---

## WF7 Part B — Frontend Tracking Screens

### Vitals Log Screen
`apps/mobile/app/(app)/vitals.tsx`:
```typescript
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { Colors } from '../../constants/colors';

const VITALS_FIELDS = [
  { key: 'systolic_bp',         label: 'Systolic BP',    unit: 'mmHg', icon: '🫀', keyboardType: 'numeric', normal: '90–120' },
  { key: 'diastolic_bp',        label: 'Diastolic BP',   unit: 'mmHg', icon: '🫀', keyboardType: 'numeric', normal: '60–80' },
  { key: 'blood_sugar_fasting',  label: 'Blood Sugar (Fasting)', unit: 'mg/dL', icon: '🩸', keyboardType: 'decimal-pad', normal: '70–99' },
  { key: 'heart_rate',           label: 'Heart Rate',     unit: 'bpm',  icon: '❤️', keyboardType: 'numeric', normal: '60–100' },
  { key: 'spo2',                 label: 'SpO2',           unit: '%',    icon: '💨', keyboardType: 'numeric', normal: '95–100' },
  { key: 'weight_kg',            label: 'Weight',         unit: 'kg',   icon: '⚖️', keyboardType: 'decimal-pad', normal: '' },
  { key: 'temperature',          label: 'Temperature',    unit: '°F',   icon: '🌡️', keyboardType: 'decimal-pad', normal: '97–99' },
];

export default function VitalsScreen() {
  const [form, setForm] = useState<Record<string, string>>({});
  const qc = useQueryClient();

  const { data: todayData } = useQuery({
    queryKey: ['vitals-today'],
    queryFn: () => api.get('/vitals/today').then((r: any) => r.data),
  });

  const { data: historyData } = useQuery({
    queryKey: ['vitals-history'],
    queryFn: () => api.get('/vitals/history?days=7').then((r: any) => r.data),
  });

  const logMutation = useMutation({
    mutationFn: (data: any) => api.post('/vitals/log', data),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['vitals-today'] });
      qc.invalidateQueries({ queryKey: ['vitals-history'] });
      setForm({});
      const risk = res?.data?.risk_level;
      if (risk === 'critical') {
        Alert.alert('⚠️ Critical Reading', 'Your vitals show a critical value. Please contact your doctor immediately or call 112.');
      } else if (risk === 'warning') {
        Alert.alert('⚠️ Attention Needed', 'Some values are outside normal range. Your doctor has been notified.');
      } else {
        Alert.alert('Logged!', res?.data?.ai_analysis || 'Vitals saved successfully.');
      }
    },
    onError: () => Alert.alert('Error', 'Could not save vitals. Please try again.'),
  });

  const submit = () => {
    const payload: Record<string, number> = {};
    for (const [k, v] of Object.entries(form)) {
      if (v) payload[k] = parseFloat(v);
    }
    if (Object.keys(payload).length === 0) { Alert.alert('Empty', 'Please enter at least one vital.'); return; }
    logMutation.mutate(payload);
  };

  const burnoutAlert = historyData?.burnout_alert;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Daily Vitals</Text>

      {/* Burnout alert banner */}
      {burnoutAlert && (
        <View style={styles.burnoutBanner}>
          <Text style={styles.burnoutText}>🔔 Nova noticed your mood has been low for 3+ days. Your doctor has been notified. Tap the Nurse tab to talk.</Text>
        </View>
      )}

      {/* Today's summary */}
      {todayData?.vitals && (
        <View style={styles.todayCard}>
          <Text style={styles.todayTitle}>Latest Reading</Text>
          <View style={styles.todayGrid}>
            {todayData.vitals.systolic_bp && (
              <View style={styles.todayStat}>
                <Text style={styles.todayStatVal}>{todayData.vitals.systolic_bp}/{todayData.vitals.diastolic_bp}</Text>
                <Text style={styles.todayStatLabel}>BP (mmHg)</Text>
              </View>
            )}
            {todayData.vitals.blood_sugar_fasting && (
              <View style={styles.todayStat}>
                <Text style={[styles.todayStatVal, { color: todayData.vitals.blood_sugar_fasting > 200 ? Colors.danger : Colors.success }]}>
                  {todayData.vitals.blood_sugar_fasting}
                </Text>
                <Text style={styles.todayStatLabel}>Sugar (mg/dL)</Text>
              </View>
            )}
            {todayData.vitals.heart_rate && (
              <View style={styles.todayStat}>
                <Text style={styles.todayStatVal}>{todayData.vitals.heart_rate}</Text>
                <Text style={styles.todayStatLabel}>Heart Rate</Text>
              </View>
            )}
            {todayData.vitals.spo2 && (
              <View style={styles.todayStat}>
                <Text style={[styles.todayStatVal, { color: todayData.vitals.spo2 < 95 ? Colors.danger : Colors.success }]}>
                  {todayData.vitals.spo2}%
                </Text>
                <Text style={styles.todayStatLabel}>SpO2</Text>
              </View>
            )}
          </View>
          {todayData.vitals.ai_analysis && (
            <Text style={styles.aiNote}>💬 {todayData.vitals.ai_analysis}</Text>
          )}
        </View>
      )}

      {/* Medicine adherence strip */}
      {todayData?.medicine_adherence?.total > 0 && (
        <View style={styles.medStrip}>
          <Text style={styles.medStripText}>
            💊 Medicines today: {todayData.medicine_adherence.taken}/{todayData.medicine_adherence.total} taken
            ({todayData.medicine_adherence.pct}%)
          </Text>
        </View>
      )}

      {/* Log form */}
      <Text style={styles.sectionTitle}>Log New Reading</Text>
      {VITALS_FIELDS.map(f => (
        <View key={f.key} style={styles.fieldRow}>
          <View style={styles.fieldLabelRow}>
            <Text style={styles.fieldIcon}>{f.icon}</Text>
            <View>
              <Text style={styles.fieldLabel}>{f.label}</Text>
              {f.normal ? <Text style={styles.fieldNormal}>Normal: {f.normal} {f.unit}</Text> : null}
            </View>
          </View>
          <TextInput
            style={styles.fieldInput}
            placeholder={f.unit}
            placeholderTextColor={Colors.textMuted}
            value={form[f.key] || ''}
            onChangeText={v => setForm(prev => ({ ...prev, [f.key]: v }))}
            keyboardType={f.keyboardType as any}
          />
        </View>
      ))}

      <TouchableOpacity
        style={[styles.submitBtn, logMutation.isPending && styles.submitDisabled]}
        onPress={submit}
        disabled={logMutation.isPending}
      >
        <Text style={styles.submitText}>{logMutation.isPending ? 'Saving...' : 'Save Vitals'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.background },
  container: { padding: 20, paddingTop: 56, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '700', color: Colors.text, marginBottom: 20 },
  burnoutBanner: { backgroundColor: '#FFF3CD', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: Colors.warning },
  burnoutText: { fontSize: 13, color: '#856404', lineHeight: 20 },
  todayCard: { backgroundColor: Colors.card, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: Colors.border },
  todayTitle: { fontSize: 13, fontWeight: '700', color: Colors.textMuted, marginBottom: 12 },
  todayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  todayStat: { minWidth: 80, alignItems: 'center' },
  todayStatVal: { fontSize: 22, fontWeight: '700', color: Colors.primary },
  todayStatLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  aiNote: { fontSize: 12, color: Colors.midTxt, marginTop: 12, lineHeight: 18, fontStyle: 'italic' },
  medStrip: { backgroundColor: `${Colors.primary}12`, borderRadius: 10, padding: 12, marginBottom: 20 },
  medStripText: { fontSize: 13, color: Colors.primary },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, marginBottom: 16 },
  fieldRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.card, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.border },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fieldIcon: { fontSize: 22 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: Colors.text },
  fieldNormal: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  fieldInput: { backgroundColor: Colors.background, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, padding: 10, fontSize: 15, color: Colors.text, width: 100, textAlign: 'right' },
  submitBtn: { backgroundColor: Colors.primary, borderRadius: 14, padding: 18, alignItems: 'center', marginTop: 8 },
  submitDisabled: { opacity: 0.5 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
```

### Home Screen (Updated with daily check-in)
`apps/mobile/app/(app)/index.tsx`:
```typescript
import { useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import api from '../../lib/api';
import { Colors } from '../../constants/colors';

const MOOD_EMOJIS = ['😞', '😕', '😐', '🙂', '😊'];

export default function HomeScreen() {
  const profile = useAuthStore(s => s.profile);
  const name = profile?.full_name?.split(' ')[0] || 'there';

  const { data: today } = useQuery({
    queryKey: ['today'],
    queryFn: () => api.get('/vitals/today').then((r: any) => r.data),
    refetchInterval: 60000,
  });

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const logMood = async (score: number) => {
    await api.post('/vitals/wellness', { mood_score: score });
    router.push('/(app)/vitals');
  };

  const hasMoodToday = today?.wellness?.mood_score;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      {/* Greeting */}
      <Text style={styles.greeting}>{greeting}, {name} 🌿</Text>
      <Text style={styles.date}>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>

      {/* Mood check-in */}
      {!hasMoodToday ? (
        <View style={styles.moodCard}>
          <Text style={styles.moodTitle}>How are you feeling today?</Text>
          <View style={styles.moodRow}>
            {MOOD_EMOJIS.map((emoji, i) => (
              <TouchableOpacity key={i} style={styles.moodBtn} onPress={() => logMood(i + 1)}>
                <Text style={styles.moodEmoji}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : (
        <View style={styles.moodDoneCard}>
          <Text style={styles.moodDoneText}>Today's mood: {MOOD_EMOJIS[hasMoodToday - 1]} {hasMoodToday}/5</Text>
        </View>
      )}

      {/* Quick stats */}
      <Text style={styles.sectionTitle}>Today's Summary</Text>
      <View style={styles.statsGrid}>
        {[
          { label: 'BP', value: today?.vitals?.systolic_bp ? `${today.vitals.systolic_bp}/${today.vitals.diastolic_bp}` : '—', unit: 'mmHg', icon: '🫀', route: '/(app)/vitals' },
          { label: 'Sugar', value: today?.vitals?.blood_sugar_fasting || '—', unit: 'mg/dL', icon: '🩸', route: '/(app)/vitals' },
          { label: 'Water', value: today?.wellness?.water_ml ? `${today.wellness.water_ml}ml` : '—', unit: '', icon: '💧', route: '/(app)/vitals' },
          { label: 'Medicines', value: today?.medicine_adherence?.pct != null ? `${today.medicine_adherence.pct}%` : '—', unit: 'taken', icon: '💊', route: '/(app)/vitals' },
        ].map(stat => (
          <TouchableOpacity key={stat.label} style={styles.statCard} onPress={() => router.push(stat.route as any)}>
            <Text style={styles.statIcon}>{stat.icon}</Text>
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Quick actions */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.actionsGrid}>
        {[
          { icon: '💬', label: 'Talk to Nova', route: '/(app)/nurse' },
          { icon: '🧪', label: 'Upload Report', route: '/(app)/reports' },
          { icon: '💊', label: 'Log Vitals', route: '/(app)/vitals' },
          { icon: '📊', label: 'Weekly Report', route: '/(app)/reports' },
        ].map(action => (
          <TouchableOpacity key={action.label} style={styles.actionCard} onPress={() => router.push(action.route as any)}>
            <Text style={styles.actionIcon}>{action.icon}</Text>
            <Text style={styles.actionLabel}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* AI daily summary if available */}
      {today?.wellness?.ai_daily_summary && (
        <View style={styles.aiSummaryCard}>
          <Text style={styles.aiSummaryTitle}>Nova's note for you 🌿</Text>
          <Text style={styles.aiSummaryText}>{today.wellness.ai_daily_summary}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.background },
  container: { padding: 20, paddingTop: 56, paddingBottom: 40 },
  greeting: { fontSize: 26, fontWeight: '700', color: Colors.text },
  date: { fontSize: 13, color: Colors.textMuted, marginTop: 4, marginBottom: 24 },
  moodCard: { backgroundColor: Colors.card, borderRadius: 20, padding: 20, marginBottom: 24, borderWidth: 1, borderColor: Colors.border },
  moodTitle: { fontSize: 15, fontWeight: '600', color: Colors.text, marginBottom: 16, textAlign: 'center' },
  moodRow: { flexDirection: 'row', justifyContent: 'space-around' },
  moodBtn: { padding: 8 },
  moodEmoji: { fontSize: 36 },
  moodDoneCard: { backgroundColor: `${Colors.primary}12`, borderRadius: 16, padding: 14, marginBottom: 24, alignItems: 'center' },
  moodDoneText: { fontSize: 14, color: Colors.primary, fontWeight: '600' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, marginBottom: 12 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 28 },
  statCard: { flex: 1, minWidth: '45%', backgroundColor: Colors.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  statIcon: { fontSize: 24, marginBottom: 6 },
  statValue: { fontSize: 20, fontWeight: '700', color: Colors.text },
  statLabel: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  actionCard: { flex: 1, minWidth: '45%', backgroundColor: Colors.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', flexDirection: 'row', gap: 10 },
  actionIcon: { fontSize: 24 },
  actionLabel: { fontSize: 13, fontWeight: '600', color: Colors.text },
  aiSummaryCard: { backgroundColor: `${Colors.primary}10`, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: `${Colors.primary}25` },
  aiSummaryTitle: { fontSize: 13, fontWeight: '700', color: Colors.primary, marginBottom: 8 },
  aiSummaryText: { fontSize: 14, color: Colors.text, lineHeight: 22 },
});
```

---

## WF7 Done Checklist
- [ ] Backend `routers/vitals.py` — log vitals, log wellness, today summary, 7-day history
- [ ] Auto-flag critical vitals working (DB trigger from Phase 1)
- [ ] Burnout detection: 3 consecutive low-mood days → alert
- [ ] AI quick analysis on each vitals entry
- [ ] AI daily summary when mood + 2 wellness fields logged
- [ ] Frontend `vitals.tsx` — all 7 vital fields, today's reading, medicine adherence strip
- [ ] Frontend `index.tsx` — mood emoji check-in, stats grid, quick actions, AI note
- [ ] Test: BP 182/110 → verify critical alert shown + doctor flagged
- [ ] Test: log mood 1 for 3 days → verify burnout banner appears
- [ ] Commit to `phase3/patient-tracking`

---

## PR Instructions
```bash
git add .
git commit -m "feat(phase3): daily vitals + wellness tracking + burnout detection + home screen"
git push origin phase3/patient-tracking
# PR: phase3/patient-tracking → develop
# Tag: @Agent3 for review
```
