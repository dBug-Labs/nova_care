# NovaCare — Phase 4 | Agent 1
## Workflows: WF9 — Doctor Dashboard
> Paste NOVACARE_MASTER.md into context first, then this file.
> Branch: `phase4/doctor-dashboard`
> Model: Claude Opus
> Dependency: All Phase 1–3 workflows merged into `develop`.

---

## Goal
Build the complete doctor-facing experience. Doctors see all their patients in one live dashboard — vitals, flags, reports, mood, medicine adherence. They can add notes, respond to critical alerts, and review AI nurse chat logs.

---

## WF9 Part A — Backend Doctor Routes

`services/api/routers/doctors.py`:
```python
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import date, timedelta
from dependencies import get_current_user, supabase

router = APIRouter()


def require_doctor(user):
    profile = supabase.table("profiles").select("role").eq("id", user.id).single().execute().data
    if not profile or profile.get("role") != "doctor":
        raise HTTPException(status_code=403, detail="Doctor access required")
    return user


class PatientLinkRequest(BaseModel):
    patient_identifier: str   # email or patient_id
    specialty: str


class DoctorNote(BaseModel):
    patient_id: str
    note: str
    note_type: str = "general"   # general | critical | follow_up


@router.get("/patients")
async def get_patients(user=Depends(get_current_user)):
    """Get all patients linked to this doctor with their latest status."""
    require_doctor(user)

    links = supabase.table("doctor_patient_links")\
        .select("patient_id, specialty")\
        .eq("doctor_id", user.id).eq("active", True).execute().data or []

    patient_ids = [l["patient_id"] for l in links]
    if not patient_ids:
        return {"success": True, "data": [], "error": None}

    # Build patient summary for each
    patients = []
    for pid in patient_ids:
        try:
            # Profile
            profile = supabase.table("patient_profiles")\
                .select("*, profiles(full_name, date_of_birth, gender)")\
                .eq("id", pid).single().execute().data or {}

            # Latest vitals
            vitals = supabase.table("vitals_logs")\
                .select("systolic_bp,diastolic_bp,blood_sugar_fasting,heart_rate,spo2,risk_level,flagged,logged_at")\
                .eq("patient_id", pid)\
                .order("logged_at", desc=True).limit(1).execute().data
            latest_vitals = vitals[0] if vitals else {}

            # Mood trend (7 days)
            seven_days_ago = str((date.today() - timedelta(days=7)).isoformat())
            mood_data = supabase.table("wellness_logs")\
                .select("mood_score, log_date")\
                .eq("patient_id", pid)\
                .gte("log_date", seven_days_ago)\
                .order("log_date").execute().data or []
            avg_mood = sum(m["mood_score"] for m in mood_data) / len(mood_data) if mood_data else None

            # Medicine adherence (7 days)
            med_logs = supabase.table("medicine_logs")\
                .select("status")\
                .eq("patient_id", pid)\
                .gte("created_at", f"{seven_days_ago}T00:00:00").execute().data or []
            taken = sum(1 for m in med_logs if m["status"] == "taken")
            adherence = round(taken / len(med_logs) * 100) if med_logs else None

            # Lab reports count
            lab_count = supabase.table("lab_reports")\
                .select("id", count="exact").eq("patient_id", pid).execute().count or 0

            # Active flags
            flags = supabase.table("vitals_logs")\
                .select("id").eq("patient_id", pid)\
                .eq("flagged", True)\
                .gte("logged_at", f"{seven_days_ago}T00:00:00").execute().data or []

            # Calculate age
            dob = profile.get("profiles", {}).get("date_of_birth")
            age = None
            if dob:
                from datetime import date as dt
                birth = dt.fromisoformat(dob)
                age = (dt.today() - birth).days // 365

            patients.append({
                "id": pid,
                "name": profile.get("profiles", {}).get("full_name", "Unknown"),
                "age": age,
                "gender": profile.get("profiles", {}).get("gender"),
                "conditions": profile.get("chronic_conditions", []),
                "latest_bp": f"{latest_vitals.get('systolic_bp')}/{latest_vitals.get('diastolic_bp')}" if latest_vitals.get("systolic_bp") else None,
                "latest_sugar": latest_vitals.get("blood_sugar_fasting"),
                "latest_spo2": latest_vitals.get("spo2"),
                "risk_level": latest_vitals.get("risk_level", "unknown"),
                "vitals_updated": latest_vitals.get("logged_at"),
                "avg_mood_7d": round(avg_mood, 1) if avg_mood else None,
                "medicine_adherence": adherence,
                "lab_report_count": lab_count,
                "active_flags": len(flags),
                "specialty": next((l["specialty"] for l in links if l["patient_id"] == pid), None),
            })
        except Exception as e:
            print(f"[DOCTOR] Error fetching patient {pid}: {e}")

    # Sort: critical first, then warning, then normal
    priority = {"critical": 0, "warning": 1, "watch": 2, "normal": 3, "unknown": 4}
    patients.sort(key=lambda p: priority.get(p["risk_level"], 4))

    return {"success": True, "data": patients, "error": None}


@router.get("/patients/{patient_id}")
async def get_patient_detail(patient_id: str, user=Depends(get_current_user)):
    """Full patient detail for doctor view."""
    require_doctor(user)

    # Verify link
    link = supabase.table("doctor_patient_links")\
        .select("id").eq("doctor_id", user.id)\
        .eq("patient_id", patient_id).eq("active", True).execute().data
    if not link:
        raise HTTPException(status_code=403, detail="Patient not in your list")

    # Full profile
    profile = supabase.table("patient_profiles")\
        .select("*, profiles(*)")\
        .eq("id", patient_id).single().execute().data

    # Vitals history (30 days)
    vitals = supabase.table("vitals_logs")\
        .select("*").eq("patient_id", patient_id)\
        .gte("logged_at", str((date.today() - timedelta(days=30)).isoformat()))\
        .order("logged_at").execute().data or []

    # Wellness history (30 days)
    wellness = supabase.table("wellness_logs")\
        .select("*").eq("patient_id", patient_id)\
        .gte("log_date", str((date.today() - timedelta(days=30)).isoformat()))\
        .order("log_date").execute().data or []

    # Lab reports
    labs = supabase.table("lab_reports")\
        .select("id,report_type,overall_status,ai_summary,ai_flags,created_at")\
        .eq("patient_id", patient_id)\
        .order("created_at", desc=True).limit(10).execute().data or []

    # Recent AI conversations (summaries only)
    chats = supabase.table("chat_sessions")\
        .select("id,title,summary,mood_detected,health_flags,started_at")\
        .eq("patient_id", patient_id)\
        .order("started_at", desc=True).limit(10).execute().data or []

    # Active medicines
    medicines = supabase.table("medicines")\
        .select("name,dosage,frequency,stock_count")\
        .eq("patient_id", patient_id).eq("active", True).execute().data or []

    return {
        "success": True,
        "data": {
            "profile": profile,
            "vitals": vitals,
            "wellness": wellness,
            "labs": labs,
            "chats": chats,
            "medicines": medicines,
        },
        "error": None,
    }


@router.post("/notes")
async def add_note(req: DoctorNote, user=Depends(get_current_user)):
    """Doctor adds a note to a patient's record."""
    require_doctor(user)
    # Store as a chat message in a special doctor session
    session = supabase.table("chat_sessions").insert({
        "patient_id": req.patient_id,
        "session_type": "general",
        "title": f"Doctor Note ({req.note_type})",
    }).execute().data[0]

    supabase.table("chat_messages").insert({
        "session_id": session["id"],
        "role": "system",
        "content": f"[DOCTOR NOTE - {req.note_type.upper()}]: {req.note}",
    }).execute()

    return {"success": True, "data": {"note_saved": True}, "error": None}


@router.post("/link-patient")
async def link_patient(req: PatientLinkRequest, user=Depends(get_current_user)):
    """Link a patient to this doctor by email."""
    require_doctor(user)

    # Find patient by email
    auth_users = supabase.auth.admin.list_users()
    patient_user = next((u for u in auth_users.users if u.email == req.patient_identifier), None)
    if not patient_user:
        raise HTTPException(status_code=404, detail="Patient not found")

    # Check they are a patient
    profile = supabase.table("profiles").select("role").eq("id", patient_user.id).single().execute().data
    if not profile or profile["role"] != "patient":
        raise HTTPException(status_code=400, detail="That account is not a patient")

    # Create link
    supabase.table("doctor_patient_links").upsert({
        "doctor_id": user.id,
        "patient_id": patient_user.id,
        "specialty": req.specialty,
        "active": True,
    }).execute()

    return {"success": True, "data": {"linked": True}, "error": None}
```

---

## WF9 Part B — Doctor Dashboard Frontend

### Doctor Home Tab
`apps/mobile/app/(doctor)/_layout.tsx`:
```typescript
import { Tabs } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Text } from 'react-native';

export default function DoctorLayout() {
  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: Colors.primary,
      tabBarInactiveTintColor: Colors.textMuted,
      tabBarStyle: { backgroundColor: '#fff', borderTopColor: Colors.border, height: 60 },
      headerShown: false,
    }}>
      <Tabs.Screen name="index"   options={{ title: 'Patients',  tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>👥</Text> }} />
      <Tabs.Screen name="alerts"  options={{ title: 'Alerts',    tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🔔</Text> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile',   tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>👤</Text> }} />
    </Tabs>
  );
}
```

### Doctor Patients List Screen
`apps/mobile/app/(doctor)/index.tsx`:
```typescript
import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, TextInput } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import api from '../../lib/api';
import { Colors } from '../../constants/colors';

const RISK_COLORS: Record<string, string> = {
  critical: Colors.danger,
  warning:  Colors.warning,
  watch:    '#F4A430',
  normal:   Colors.success,
  unknown:  Colors.textMuted,
};

const RISK_LABELS: Record<string, string> = {
  critical: '🔴 Critical',
  warning:  '⚠️ Warning',
  watch:    '👁 Watch',
  normal:   '✅ Normal',
  unknown:  '— Unknown',
};

export default function DoctorPatientsScreen() {
  const [search, setSearch] = useState('');

  const { data: patients, isLoading, refetch } = useQuery({
    queryKey: ['doctor-patients'],
    queryFn: () => api.get('/doctors/patients').then((r: any) => r.data),
    refetchInterval: 60000,
  });

  const filtered = patients?.filter((p: any) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.conditions || []).some((c: string) => c.includes(search.toLowerCase()))
  ) || [];

  const criticalCount = patients?.filter((p: any) => p.risk_level === 'critical').length || 0;
  const warningCount  = patients?.filter((p: any) => p.risk_level === 'warning').length || 0;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}>

      <Text style={styles.title}>My Patients</Text>
      <Text style={styles.sub}>{patients?.length || 0} active · {criticalCount} critical · {warningCount} warnings</Text>

      {/* Alert strip */}
      {criticalCount > 0 && (
        <View style={styles.alertStrip}>
          <Text style={styles.alertText}>🔴 {criticalCount} patient{criticalCount > 1 ? 's' : ''} need immediate attention</Text>
        </View>
      )}

      {/* Search */}
      <TextInput style={styles.search} placeholder="Search by name or condition..."
        value={search} onChangeText={setSearch} placeholderTextColor={Colors.textMuted} />

      {/* Patient cards */}
      {filtered.map((patient: any) => (
        <TouchableOpacity
          key={patient.id}
          style={[styles.patientCard, patient.risk_level === 'critical' && styles.criticalCard]}
          onPress={() => router.push(`/(doctor)/patient?id=${patient.id}`)}
        >
          {/* Header row */}
          <View style={styles.cardHeader}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{patient.name?.charAt(0)}</Text>
            </View>
            <View style={styles.nameBlock}>
              <Text style={styles.patientName}>{patient.name}</Text>
              <Text style={styles.patientMeta}>
                {patient.age ? `${patient.age} yrs` : ''}{patient.gender ? ` · ${patient.gender}` : ''}
                {patient.specialty ? ` · ${patient.specialty}` : ''}
              </Text>
            </View>
            <View style={[styles.riskBadge, { backgroundColor: `${RISK_COLORS[patient.risk_level]}20` }]}>
              <Text style={[styles.riskText, { color: RISK_COLORS[patient.risk_level] }]}>
                {RISK_LABELS[patient.risk_level]}
              </Text>
            </View>
          </View>

          {/* Conditions */}
          {patient.conditions?.length > 0 && (
            <View style={styles.conditionRow}>
              {patient.conditions.slice(0, 3).map((c: string) => (
                <View key={c} style={styles.conditionChip}>
                  <Text style={styles.conditionText}>{c.replace(/_/g, ' ')}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Vitals row */}
          <View style={styles.vitalsRow}>
            {patient.latest_bp && (
              <View style={styles.vitalItem}>
                <Text style={styles.vitalVal}>{patient.latest_bp}</Text>
                <Text style={styles.vitalLabel}>BP</Text>
              </View>
            )}
            {patient.latest_sugar && (
              <View style={styles.vitalItem}>
                <Text style={[styles.vitalVal, patient.latest_sugar > 200 && { color: Colors.danger }]}>
                  {patient.latest_sugar}
                </Text>
                <Text style={styles.vitalLabel}>Sugar</Text>
              </View>
            )}
            {patient.avg_mood_7d && (
              <View style={styles.vitalItem}>
                <Text style={styles.vitalVal}>{patient.avg_mood_7d}/5</Text>
                <Text style={styles.vitalLabel}>Mood</Text>
              </View>
            )}
            {patient.medicine_adherence != null && (
              <View style={styles.vitalItem}>
                <Text style={[styles.vitalVal, patient.medicine_adherence < 70 && { color: Colors.warning }]}>
                  {patient.medicine_adherence}%
                </Text>
                <Text style={styles.vitalLabel}>Adherence</Text>
              </View>
            )}
            {patient.active_flags > 0 && (
              <View style={[styles.vitalItem, styles.flagItem]}>
                <Text style={[styles.vitalVal, { color: Colors.danger }]}>{patient.active_flags}</Text>
                <Text style={styles.vitalLabel}>Flags</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      ))}

      {filtered.length === 0 && !isLoading && (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>👥</Text>
          <Text style={styles.emptyTitle}>No patients yet</Text>
          <Text style={styles.emptyText}>Add patients by their email address to start monitoring.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex:1, backgroundColor: Colors.background },
  container: { padding:20, paddingTop:56, paddingBottom:40 },
  title: { fontSize:26, fontWeight:'700', color:Colors.text },
  sub: { fontSize:12, color:Colors.textMuted, marginTop:3, marginBottom:20 },
  alertStrip: { backgroundColor:'#FEE2E2', borderRadius:12, padding:12, marginBottom:16 },
  alertText: { fontSize:13, color:Colors.danger, fontWeight:'600' },
  search: { backgroundColor:Colors.card, borderRadius:12, borderWidth:1, borderColor:Colors.border, padding:14, fontSize:14, color:Colors.text, marginBottom:16 },
  patientCard: { backgroundColor:Colors.card, borderRadius:16, padding:16, marginBottom:12, borderWidth:1, borderColor:Colors.border },
  criticalCard: { borderColor:Colors.danger, borderWidth:1.5 },
  cardHeader: { flexDirection:'row', alignItems:'center', gap:12, marginBottom:12 },
  avatarCircle: { width:44, height:44, borderRadius:22, backgroundColor:Colors.primary, alignItems:'center', justifyContent:'center' },
  avatarText: { color:'#fff', fontSize:18, fontWeight:'700' },
  nameBlock: { flex:1 },
  patientName: { fontSize:15, fontWeight:'700', color:Colors.text },
  patientMeta: { fontSize:11, color:Colors.textMuted, marginTop:2 },
  riskBadge: { borderRadius:8, paddingHorizontal:10, paddingVertical:5 },
  riskText: { fontSize:11, fontWeight:'700' },
  conditionRow: { flexDirection:'row', flexWrap:'wrap', gap:6, marginBottom:10 },
  conditionChip: { backgroundColor:Colors.background, borderRadius:20, paddingHorizontal:10, paddingVertical:4, borderWidth:1, borderColor:Colors.border },
  conditionText: { fontSize:10, color:Colors.textMuted, textTransform:'capitalize' },
  vitalsRow: { flexDirection:'row', gap:16, flexWrap:'wrap' },
  vitalItem: { alignItems:'center', minWidth:60 },
  vitalVal: { fontSize:16, fontWeight:'700', color:Colors.text },
  vitalLabel: { fontSize:9, color:Colors.textMuted, marginTop:1 },
  flagItem: { backgroundColor:`${Colors.danger}10`, borderRadius:6, padding:6 },
  empty: { alignItems:'center', paddingTop:60 },
  emptyIcon: { fontSize:48, marginBottom:14 },
  emptyTitle: { fontSize:18, fontWeight:'700', color:Colors.text, marginBottom:6 },
  emptyText: { fontSize:13, color:Colors.textMuted, textAlign:'center', lineHeight:20 },
});
```

---

## WF9 Done Checklist
- [ ] Backend `doctors.py` — patients list (sorted by risk), patient detail, add note, link patient
- [ ] `require_doctor()` guard on all doctor routes
- [ ] Frontend `(doctor)/_layout.tsx` — separate tab layout for doctors
- [ ] Frontend `(doctor)/index.tsx` — patient cards with risk, vitals, mood, adherence, flags
- [ ] Alert strip shows when critical patients exist
- [ ] Route to `(app)` for patients, `(doctor)` for doctors based on role in auth store
- [ ] Test: patient logs critical BP → doctor dashboard shows red card
- [ ] Test: 3-day low mood → burnout alert visible on patient card
- [ ] Test: add patient by email → appears in list

---

## PR Instructions
```bash
git add .
git commit -m "feat(phase4): doctor dashboard — patients list, detail, notes, alerts"
git push origin phase4/doctor-dashboard
# PR: phase4/doctor-dashboard → develop
# Tag: @Agent3 for final integration
```
