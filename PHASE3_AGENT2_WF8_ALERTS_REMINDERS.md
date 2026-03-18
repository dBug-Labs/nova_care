# NovaCare — Phase 3 | Agent 2
## Workflows: WF8 — Medicine Management, Stock Alerts & Push Notifications
> Paste NOVACARE_MASTER.md into context first, then this file.
> Branch: `phase3/alerts-reminders`
> Model: Claude Opus
> Dependency: Phase 2 merged. Patient tracking (WF7) running in parallel.

---

## Goal
Build the complete medicine management system: add medicines, set schedules, track intake, manage stock, send push notifications (water, walk, medicine, appointment). This is what patients use every single day.

---

## WF8 Part A — Backend Medicine & Reminder Routes

### Medicine Router
`services/api/routers/reminders.py`:
```python
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime, timedelta
from dependencies import get_current_user, supabase

router = APIRouter()


class MedicineCreate(BaseModel):
    name: str
    dosage: str
    frequency: str
    schedule_times: List[str]   # ["08:00", "20:00"]
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    stock_count: int = 0
    stock_unit: str = "tablets"
    refill_alert_at: int = 5
    notes: Optional[str] = None


class MedicineIntakeLog(BaseModel):
    medicine_id: str
    status: str   # taken | missed | snoozed
    scheduled_time: str


class ReminderCreate(BaseModel):
    type: str         # water | walk | medicine | appointment | vitals | custom
    title: str
    message: Optional[str] = None
    schedule_time: str          # "HH:MM"
    days_of_week: List[int] = [1,2,3,4,5,6,7]
    expo_push_token: Optional[str] = None


class StockUpdate(BaseModel):
    medicine_id: str
    new_count: int


@router.post("/medicines")
async def add_medicine(req: MedicineCreate, user=Depends(get_current_user)):
    data = req.dict()
    data["patient_id"] = user.id
    data["start_date"] = data.get("start_date") or str(date.today())
    res = supabase.table("medicines").insert(data).execute()

    # Generate today's medicine log entries
    today = str(date.today())
    logs = []
    for t in req.schedule_times:
        logs.append({
            "medicine_id": res.data[0]["id"],
            "patient_id": user.id,
            "scheduled_time": f"{today}T{t}:00",
            "status": "missed",
        })
    if logs:
        supabase.table("medicine_logs").insert(logs).execute()

    return {"success": True, "data": res.data[0], "error": None}


@router.get("/medicines")
async def get_medicines(user=Depends(get_current_user)):
    res = supabase.table("medicines")\
        .select("*").eq("patient_id", user.id).eq("active", True)\
        .order("created_at").execute()

    medicines = res.data or []
    # Flag low stock
    for m in medicines:
        m["low_stock"] = m.get("stock_count", 0) <= m.get("refill_alert_at", 5)

    return {"success": True, "data": medicines, "error": None}


@router.post("/medicines/log-intake")
async def log_intake(req: MedicineIntakeLog, user=Depends(get_current_user)):
    """Mark a medicine as taken, missed, or snoozed."""
    res = supabase.table("medicine_logs").update({
        "status": req.status,
        "taken_at": datetime.utcnow().isoformat() if req.status == "taken" else None,
    }).eq("medicine_id", req.medicine_id)\
      .eq("scheduled_time", req.scheduled_time).execute()

    # If taken, deduct from stock
    if req.status == "taken":
        med = supabase.table("medicines").select("stock_count,refill_alert_at,name")\
            .eq("id", req.medicine_id).single().execute().data
        if med and med.get("stock_count", 0) > 0:
            new_count = med["stock_count"] - 1
            supabase.table("medicines").update({"stock_count": new_count}).eq("id", req.medicine_id).execute()
            # Send low stock alert if threshold reached
            if new_count <= med.get("refill_alert_at", 5):
                await send_push_notification(
                    user.id,
                    "💊 Medicine Running Low",
                    f"{med['name']} — only {new_count} {med.get('stock_unit','tablets')} left. Time to refill!",
                )

    return {"success": True, "data": {"status": req.status}, "error": None}


@router.patch("/medicines/stock")
async def update_stock(req: StockUpdate, user=Depends(get_current_user)):
    """Manually update medicine stock count after refill."""
    res = supabase.table("medicines")\
        .update({"stock_count": req.new_count})\
        .eq("id", req.medicine_id).eq("patient_id", user.id).execute()
    return {"success": True, "data": res.data[0] if res.data else None, "error": None}


@router.get("/medicines/today")
async def today_medicines(user=Depends(get_current_user)):
    """Get today's medicine schedule with intake status."""
    today = str(date.today())
    logs = supabase.table("medicine_logs")\
        .select("*, medicines(name, dosage, stock_count, refill_alert_at)")\
        .eq("patient_id", user.id)\
        .gte("scheduled_time", f"{today}T00:00:00")\
        .lte("scheduled_time", f"{today}T23:59:59")\
        .order("scheduled_time").execute().data or []

    return {"success": True, "data": logs, "error": None}


# ─── REMINDERS ───────────────────────────────

@router.post("/reminders")
async def create_reminder(req: ReminderCreate, user=Depends(get_current_user)):
    data = req.dict()
    data["patient_id"] = user.id
    res = supabase.table("reminders").insert(data).execute()
    return {"success": True, "data": res.data[0], "error": None}


@router.get("/reminders")
async def get_reminders(user=Depends(get_current_user)):
    res = supabase.table("reminders")\
        .select("*").eq("patient_id", user.id).eq("active", True)\
        .order("schedule_time").execute()
    return {"success": True, "data": res.data or [], "error": None}


@router.delete("/reminders/{reminder_id}")
async def delete_reminder(reminder_id: str, user=Depends(get_current_user)):
    supabase.table("reminders").update({"active": False})\
        .eq("id", reminder_id).eq("patient_id", user.id).execute()
    return {"success": True, "data": None, "error": None}


@router.post("/push-token")
async def save_push_token(token: str, user=Depends(get_current_user)):
    """Save Expo push token for notifications."""
    supabase.table("profiles").update({"expo_push_token": token}).eq("id", user.id).execute()
    return {"success": True, "data": None, "error": None}


# ─── PUSH NOTIFICATION HELPER ─────────────────

async def send_push_notification(user_id: str, title: str, body: str, data: dict = {}):
    """Send Expo push notification to a user."""
    import httpx
    profile = supabase.table("profiles").select("expo_push_token").eq("id", user_id).single().execute().data
    token = profile.get("expo_push_token") if profile else None
    if not token:
        return

    payload = {"to": token, "title": title, "body": body, "data": data, "sound": "default"}
    async with httpx.AsyncClient() as client:
        await client.post("https://exp.host/--/api/v2/push/send", json=payload)
```

### Notification Scheduler (runs as background job)
`services/api/scheduler.py`:
```python
"""
Background scheduler — runs every minute to fire reminders.
Start with: python scheduler.py
Or integrate with Railway cron.
"""
import asyncio
from datetime import datetime, date
from supabase import create_client
from config import settings
import httpx

supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)

WEEKDAY_MAP = {0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7}  # Python weekday → our 1-7


async def send_push(token: str, title: str, body: str):
    async with httpx.AsyncClient() as client:
        await client.post("https://exp.host/--/api/v2/push/send", json={
            "to": token, "title": title, "body": body, "sound": "default"
        })


async def fire_due_reminders():
    now = datetime.utcnow()
    current_time = now.strftime("%H:%M")
    current_day = WEEKDAY_MAP[now.weekday()]

    # Fetch all active reminders due now
    reminders = supabase.table("reminders")\
        .select("*, profiles(expo_push_token)")\
        .eq("active", True)\
        .eq("schedule_time", current_time)\
        .execute().data or []

    for r in reminders:
        if current_day not in (r.get("days_of_week") or []):
            continue
        token = (r.get("profiles") or {}).get("expo_push_token")
        if token:
            await send_push(token, r["title"], r.get("message", "Time for your health routine!"))

    # Medicine reminders — check today's schedule
    today = str(date.today())
    pending_meds = supabase.table("medicine_logs")\
        .select("*, medicines(name, dosage), profiles!medicine_logs_patient_id_fkey(expo_push_token)")\
        .eq("status", "missed")\
        .eq("scheduled_time", f"{today}T{current_time}:00")\
        .execute().data or []

    for log in pending_meds:
        med = log.get("medicines", {})
        profile = log.get("profiles", {})
        token = profile.get("expo_push_token") if profile else None
        if token:
            await send_push(
                token,
                f"💊 Medicine Reminder",
                f"Time to take {med.get('name', 'your medicine')} — {med.get('dosage', '')}"
            )

    print(f"[{current_time}] Fired {len(reminders)} reminders, {len(pending_meds)} medicine alerts")


async def main():
    print("🔔 NovaCare notification scheduler started")
    while True:
        await fire_due_reminders()
        await asyncio.sleep(60)  # Check every minute

if __name__ == "__main__":
    asyncio.run(main())
```

---

## WF8 Part B — Frontend Medicine & Reminder Screens

### Medicine Management Screen
`apps/mobile/app/(app)/medicines.tsx`:
```typescript
import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, Switch
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { Colors } from '../../constants/colors';

const TIME_SLOTS = ['06:00','07:00','08:00','09:00','10:00','12:00','14:00','16:00','18:00','20:00','21:00','22:00'];
const FREQUENCIES = ['Once daily','Twice daily','Three times daily','With meals','As needed'];

export default function MedicinesScreen() {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    name: '', dosage: '', frequency: 'Once daily',
    scheduleTimes: ['08:00'], stockCount: '', refillAt: '5',
  });
  const qc = useQueryClient();

  const { data: medicines } = useQuery({
    queryKey: ['medicines'],
    queryFn: () => api.get('/reminders/medicines').then((r: any) => r.data),
  });

  const { data: todayMeds } = useQuery({
    queryKey: ['medicines-today'],
    queryFn: () => api.get('/reminders/medicines/today').then((r: any) => r.data),
  });

  const addMutation = useMutation({
    mutationFn: (data: any) => api.post('/reminders/medicines', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['medicines'] });
      qc.invalidateQueries({ queryKey: ['medicines-today'] });
      setShowAdd(false);
      setForm({ name:'', dosage:'', frequency:'Once daily', scheduleTimes:['08:00'], stockCount:'', refillAt:'5' });
      Alert.alert('Added!', 'Medicine added and reminders set.');
    },
  });

  const intakeMutation = useMutation({
    mutationFn: ({ medId, status, time }: any) =>
      api.post('/reminders/medicines/log-intake', { medicine_id: medId, status, scheduled_time: time }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['medicines-today'] }),
  });

  const submitAdd = () => {
    if (!form.name || !form.dosage) { Alert.alert('Missing fields', 'Name and dosage required'); return; }
    addMutation.mutate({
      name: form.name, dosage: form.dosage, frequency: form.frequency,
      schedule_times: form.scheduleTimes,
      stock_count: parseInt(form.stockCount) || 0,
      refill_alert_at: parseInt(form.refillAt) || 5,
    });
  };

  const toggleTime = (t: string) => {
    setForm(f => ({
      ...f,
      scheduleTimes: f.scheduleTimes.includes(t)
        ? f.scheduleTimes.filter(x => x !== t)
        : [...f.scheduleTimes, t].sort()
    }));
  };

  const today = new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'short' });

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Medicines</Text>
          <Text style={styles.sub}>{today}</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* Today's Schedule */}
      {todayMeds && todayMeds.length > 0 && (
        <View>
          <Text style={styles.sectionTitle}>Today's Schedule</Text>
          {todayMeds.map((log: any) => {
            const med = log.medicines || {};
            const time = new Date(log.scheduled_time).toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'});
            return (
              <View key={log.id} style={[styles.scheduleCard, log.status === 'taken' && styles.takenCard]}>
                <View style={styles.scheduleLeft}>
                  <Text style={styles.scheduleTime}>{time}</Text>
                  <View>
                    <Text style={styles.schedMedName}>{med.name}</Text>
                    <Text style={styles.schedMedDose}>{med.dosage}</Text>
                    {med.stock_count <= (med.refill_alert_at || 5) && (
                      <Text style={styles.lowStockWarn}>⚠ Only {med.stock_count} left — refill soon</Text>
                    )}
                  </View>
                </View>
                {log.status === 'taken' ? (
                  <Text style={styles.takenBadge}>✓ Taken</Text>
                ) : (
                  <View style={styles.actionBtns}>
                    <TouchableOpacity
                      style={styles.takenBtn}
                      onPress={() => intakeMutation.mutate({ medId: log.medicine_id, status: 'taken', time: log.scheduled_time })}
                    >
                      <Text style={styles.takenBtnText}>Taken</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.skipBtn}
                      onPress={() => intakeMutation.mutate({ medId: log.medicine_id, status: 'missed', time: log.scheduled_time })}
                    >
                      <Text style={styles.skipBtnText}>Skip</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* Medicine inventory */}
      <Text style={styles.sectionTitle}>My Medicines</Text>
      {medicines?.map((med: any) => (
        <View key={med.id} style={[styles.medCard, med.low_stock && styles.medCardLow]}>
          <View style={styles.medHeader}>
            <Text style={styles.medName}>{med.name}</Text>
            {med.low_stock && <Text style={styles.lowBadge}>⚠ Low Stock</Text>}
          </View>
          <Text style={styles.medDose}>{med.dosage}  ·  {med.frequency}</Text>
          <View style={styles.medFooter}>
            <Text style={styles.medStock}>📦 Stock: {med.stock_count} {med.stock_unit}</Text>
            <Text style={styles.medTimes}>⏰ {med.schedule_times?.join(', ')}</Text>
          </View>
        </View>
      ))}

      {/* Add Medicine Modal */}
      {showAdd && (
        <View style={styles.addPanel}>
          <Text style={styles.panelTitle}>Add New Medicine</Text>
          <TextInput style={styles.input} placeholder="Medicine name*" value={form.name}
            onChangeText={v => setForm(f => ({...f, name: v}))} placeholderTextColor={Colors.textMuted} />
          <TextInput style={styles.input} placeholder="Dosage (e.g. 500mg, 1 tablet)*" value={form.dosage}
            onChangeText={v => setForm(f => ({...f, dosage: v}))} placeholderTextColor={Colors.textMuted} />

          <Text style={styles.fieldLabel}>Frequency</Text>
          <View style={styles.chipRow}>
            {FREQUENCIES.map(f => (
              <TouchableOpacity key={f} style={[styles.chip, form.frequency === f && styles.chipActive]}
                onPress={() => setForm(prev => ({...prev, frequency: f}))}>
                <Text style={[styles.chipText, form.frequency === f && styles.chipActiveText]}>{f}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Schedule Times</Text>
          <View style={styles.chipRow}>
            {TIME_SLOTS.map(t => (
              <TouchableOpacity key={t} style={[styles.chip, form.scheduleTimes.includes(t) && styles.chipActive]}
                onPress={() => toggleTime(t)}>
                <Text style={[styles.chipText, form.scheduleTimes.includes(t) && styles.chipActiveText]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.stockRow}>
            <View style={{flex:1}}>
              <Text style={styles.fieldLabel}>Current Stock</Text>
              <TextInput style={styles.input} placeholder="0" keyboardType="numeric"
                value={form.stockCount} onChangeText={v => setForm(f => ({...f, stockCount: v}))}
                placeholderTextColor={Colors.textMuted} />
            </View>
            <View style={{flex:1, marginLeft: 12}}>
              <Text style={styles.fieldLabel}>Alert when below</Text>
              <TextInput style={styles.input} placeholder="5" keyboardType="numeric"
                value={form.refillAt} onChangeText={v => setForm(f => ({...f, refillAt: v}))}
                placeholderTextColor={Colors.textMuted} />
            </View>
          </View>

          <TouchableOpacity style={styles.submitBtn} onPress={submitAdd} disabled={addMutation.isPending}>
            <Text style={styles.submitText}>{addMutation.isPending ? 'Adding...' : 'Add Medicine'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowAdd(false)}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex:1, backgroundColor: Colors.background },
  container: { padding:20, paddingTop:56, paddingBottom:48 },
  headerRow: { flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24 },
  title: { fontSize:26, fontWeight:'700', color:Colors.text },
  sub: { fontSize:12, color:Colors.textMuted, marginTop:3 },
  addBtn: { backgroundColor:Colors.primary, borderRadius:10, paddingHorizontal:16, paddingVertical:10 },
  addBtnText: { color:'#fff', fontSize:14, fontWeight:'600' },
  sectionTitle: { fontSize:15, fontWeight:'700', color:Colors.text, marginBottom:12, marginTop:8 },
  scheduleCard: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', backgroundColor:Colors.card, borderRadius:14, padding:16, marginBottom:10, borderWidth:1, borderColor:Colors.border },
  takenCard: { opacity:0.6 },
  scheduleLeft: { flexDirection:'row', alignItems:'center', gap:14, flex:1 },
  scheduleTime: { fontSize:14, fontWeight:'700', color:Colors.primary, minWidth:50 },
  schedMedName: { fontSize:14, fontWeight:'600', color:Colors.text },
  schedMedDose: { fontSize:12, color:Colors.textMuted },
  lowStockWarn: { fontSize:10, color:Colors.accent, marginTop:2 },
  actionBtns: { flexDirection:'row', gap:8 },
  takenBtn: { backgroundColor:Colors.primary, borderRadius:8, paddingHorizontal:14, paddingVertical:8 },
  takenBtnText: { color:'#fff', fontSize:12, fontWeight:'700' },
  skipBtn: { borderWidth:1, borderColor:Colors.border, borderRadius:8, paddingHorizontal:14, paddingVertical:8 },
  skipBtnText: { color:Colors.textMuted, fontSize:12 },
  takenBadge: { fontSize:13, color:Colors.success, fontWeight:'700' },
  medCard: { backgroundColor:Colors.card, borderRadius:14, padding:16, marginBottom:10, borderWidth:1, borderColor:Colors.border },
  medCardLow: { borderColor:Colors.warning, backgroundColor:'#FFFBF0' },
  medHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:6 },
  medName: { fontSize:15, fontWeight:'700', color:Colors.text },
  lowBadge: { fontSize:11, color:Colors.warning, fontWeight:'700' },
  medDose: { fontSize:13, color:Colors.textMuted, marginBottom:8 },
  medFooter: { flexDirection:'row', justifyContent:'space-between' },
  medStock: { fontSize:12, color:Colors.textMuted },
  medTimes: { fontSize:12, color:Colors.textMuted },
  addPanel: { backgroundColor:Colors.card, borderRadius:20, padding:22, marginTop:20, borderWidth:1, borderColor:Colors.border },
  panelTitle: { fontSize:17, fontWeight:'700', color:Colors.text, marginBottom:18 },
  input: { borderWidth:1, borderColor:Colors.border, borderRadius:10, padding:14, fontSize:15, color:Colors.text, backgroundColor:Colors.background, marginBottom:14 },
  fieldLabel: { fontSize:13, fontWeight:'600', color:Colors.textMuted, marginBottom:8, marginTop:4 },
  chipRow: { flexDirection:'row', flexWrap:'wrap', gap:8, marginBottom:14 },
  chip: { paddingHorizontal:12, paddingVertical:7, borderRadius:20, borderWidth:1, borderColor:Colors.border, backgroundColor:Colors.background },
  chipActive: { borderColor:Colors.primary, backgroundColor:`${Colors.primary}15` },
  chipText: { fontSize:12, color:Colors.textMuted },
  chipActiveText: { color:Colors.primary, fontWeight:'600' },
  stockRow: { flexDirection:'row', gap:0 },
  submitBtn: { backgroundColor:Colors.primary, borderRadius:12, padding:16, alignItems:'center', marginTop:8 },
  submitText: { color:'#fff', fontSize:15, fontWeight:'700' },
  cancelText: { color:Colors.textMuted, textAlign:'center', marginTop:14, fontSize:13 },
});
```

### Push Notifications Setup
`apps/mobile/lib/notifications.ts`:
```typescript
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import api from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  const token = (await Notifications.getExpoPushTokenAsync()).data;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  // Save token to backend
  try { await api.post(`/reminders/push-token?token=${token}`); } catch {}

  return token;
}

export function setupNotificationListeners() {
  // Foreground notification handler
  const sub1 = Notifications.addNotificationReceivedListener(notification => {
    console.log('Notification received:', notification);
  });

  // Tap handler
  const sub2 = Notifications.addNotificationResponseReceivedListener(response => {
    const data = response.notification.request.content.data;
    // Navigate based on notification type
    if (data?.type === 'medicine') {
      // router.push('/(app)/medicines');
    }
  });

  return () => { sub1.remove(); sub2.remove(); };
}
```

### Initialize notifications in root layout
Add to `apps/mobile/app/_layout.tsx`:
```typescript
// Add inside RootLayout useEffect
import { registerForPushNotifications, setupNotificationListeners } from '../lib/notifications';
useEffect(() => {
  registerForPushNotifications();
  const cleanup = setupNotificationListeners();
  return cleanup;
}, []);
```

---

## WF8 Done Checklist
- [ ] Backend `routers/reminders.py` — add medicine, today schedule, log intake, stock update, CRUD reminders, push token
- [ ] `scheduler.py` — fires reminders every minute based on schedule_time + day_of_week
- [ ] Low stock alert: auto-fires when intake reduces stock to refill threshold
- [ ] Frontend `medicines.tsx` — today's schedule (taken/skip), inventory, add form with times
- [ ] `lib/notifications.ts` — register push token, foreground + tap handlers
- [ ] Push token saved to profiles table on app launch
- [ ] Test: add medicine with stock=3, refill_at=5 → take dose → verify low stock notification
- [ ] Test: set reminder for current time → verify push notification fires in 60s
- [ ] Test: mark medicine as taken → verify stock deducts
- [ ] Expo push notification tokens working on physical device

---

## PR Instructions
```bash
git add .
git commit -m "feat(phase3): medicine management + stock alerts + push notifications + scheduler"
git push origin phase3/alerts-reminders
# PR: phase3/alerts-reminders → develop
# Tag: @Agent3 for integration with Phase 3 patient tracking
```

## Agent 3 Integration Note
After merging WF7 + WF8:
1. Home screen should show today's medicine adherence (from WF8) in the stats grid
2. Burnout detection (WF7) should trigger push notification (WF8)
3. Test full daily flow: mood check-in → vitals → medicine → Nova chat
4. Merge into develop, start Phase 4
