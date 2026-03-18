# NovaCare Frontend Test — FT4: Doctor Screens + Notifications + Final Run
> Paste FRONTEND_TEST_MASTER.md first, then this file.
> Dependency: FT1, FT2, FT3 must pass.

---

## What This Tests
- Doctor tab layout has patients + alerts + profile tabs
- Doctor patient list screen: risk colors, vitals, adherence
- Doctor patient detail screen: all sections
- Push notifications setup: lib/notifications.ts
- Notifications registered in root _layout.tsx
- Expo build/start runs without crash
- Complete app flow from launch to all tabs

---

## Instructions for Agent

### Step 1 — Check doctor layout has required tabs

```bash
cd apps/mobile
echo "=== (doctor)/_layout.tsx checks ==="

if [ ! -f "app/(doctor)/_layout.tsx" ]; then
  echo "  ❌ MISSING — creating it"
else
  checks=("Tabs" "patients\|index" "alerts" "profile\|Profile")
  for c in "${checks[@]}"; do
    grep -qE "$c" "app/(doctor)/_layout.tsx" && echo "  ✅ $c" || echo "  ❌ MISSING: $c"
  done
fi
```

If `(doctor)/_layout.tsx` is missing or incomplete, write this:

```typescript
import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { Colors } from '../../constants/colors';

export default function DoctorLayout() {
  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor:   Colors.primary,
      tabBarInactiveTintColor: Colors.textMuted,
      tabBarStyle: { backgroundColor: '#fff', borderTopColor: Colors.border, height: 60 },
      headerShown: false,
    }}>
      <Tabs.Screen name="index"   options={{ title: 'Patients', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 22 }}>👥</Text> }} />
      <Tabs.Screen name="alerts"  options={{ title: 'Alerts',   tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 22 }}>🔔</Text> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile',  tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 22 }}>👤</Text> }} />
      <Tabs.Screen name="patient" options={{ href: null }} />
    </Tabs>
  );
}
```

### Step 2 — Check doctor patient list (doctor)/index.tsx

```bash
cd apps/mobile
echo "=== (doctor)/index.tsx checks ==="

checks=(
  "doctors/patients"
  "risk_level"
  "RISK_COLORS"
  "critical"
  "warning"
  "medicine_adherence"
  "avg_mood"
  "latest_bp"
  "active_flags"
  "search"
  "useQuery"
  "router.push"
  "patient"
  "refetchInterval"
)
for c in "${checks[@]}"; do
  grep -q "$c" "app/(doctor)/index.tsx" 2>/dev/null \
    && echo "  ✅ $c" \
    || echo "  ❌ MISSING: $c"
done
```

### Step 3 — Check doctor patient detail screen

```bash
cd apps/mobile
echo "=== (doctor)/patient.tsx checks ==="

if [ ! -f "app/(doctor)/patient.tsx" ]; then
  echo "  ❌ MISSING — creating it now"
else
  checks=("useLocalSearchParams" "doctors/patients" "vitals" "wellness" "labs" "medicines" "chats")
  for c in "${checks[@]}"; do
    grep -q "$c" "app/(doctor)/patient.tsx" 2>/dev/null \
      && echo "  ✅ $c" \
      || echo "  ❌ MISSING: $c"
  done
fi
```

If `(doctor)/patient.tsx` is missing, create it:

```typescript
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../../lib/api';
import { Colors } from '../../constants/colors';
import { useState } from 'react';

const RISK_COLORS: Record<string, string> = {
  critical: Colors.danger, warning: Colors.warning,
  normal: Colors.success, unknown: Colors.textMuted,
};

export default function DoctorPatientDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [note, setNote] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['doctor-patient', id],
    queryFn: () => api.get(`/doctors/patients/${id}`).then((r: any) => r.data),
  });

  if (isLoading) return <ActivityIndicator style={{ flex: 1 }} color={Colors.primary} />;
  if (!data) return <Text style={{ padding: 20 }}>Patient not found</Text>;

  const { profile, vitals = [], wellness = [], labs = [], medicines = [] } = data;
  const latest = vitals[vitals.length - 1] || {};
  const riskColor = RISK_COLORS[latest.risk_level || 'unknown'];

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      {/* Header */}
      <TouchableOpacity onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backTxt}>← Back</Text>
      </TouchableOpacity>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarTxt}>{profile?.profiles?.full_name?.charAt(0) || '?'}</Text>
        </View>
        <View>
          <Text style={styles.name}>{profile?.profiles?.full_name}</Text>
          <Text style={styles.meta}>{profile?.chronic_conditions?.join(', ') || 'No conditions'}</Text>
          <View style={[styles.riskBadge, { backgroundColor: `${riskColor}20` }]}>
            <Text style={[styles.riskTxt, { color: riskColor }]}>{latest.risk_level || 'unknown'}</Text>
          </View>
        </View>
      </View>

      {/* Latest vitals */}
      <Text style={styles.sectionTitle}>Latest Vitals</Text>
      <View style={styles.statsRow}>
        {[
          { label: 'BP',     value: latest.systolic_bp ? `${latest.systolic_bp}/${latest.diastolic_bp}` : '—' },
          { label: 'Sugar',  value: latest.blood_sugar_fasting || '—' },
          { label: 'SpO2',   value: latest.spo2 ? `${latest.spo2}%` : '—' },
          { label: 'HR',     value: latest.heart_rate || '—' },
        ].map(s => (
          <View key={s.label} style={styles.statCard}>
            <Text style={styles.statVal}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Medicines */}
      <Text style={styles.sectionTitle}>Active Medicines ({medicines.length})</Text>
      {medicines.map((m: any) => (
        <View key={m.name} style={styles.medRow}>
          <Text style={styles.medName}>{m.name}</Text>
          <Text style={styles.medDose}>{m.dosage} · {m.frequency}</Text>
        </View>
      ))}

      {/* Lab reports */}
      <Text style={styles.sectionTitle}>Lab Reports ({labs.length})</Text>
      {labs.map((l: any) => (
        <View key={l.id} style={styles.labRow}>
          <Text style={styles.labName}>{l.report_type}</Text>
          <View style={[styles.labStatus, { backgroundColor: `${RISK_COLORS[l.overall_status] || Colors.textMuted}20` }]}>
            <Text style={{ fontSize: 11, color: RISK_COLORS[l.overall_status] || Colors.textMuted, fontWeight: '700' }}>
              {l.overall_status}
            </Text>
          </View>
        </View>
      ))}

      {/* Recent mood */}
      <Text style={styles.sectionTitle}>Mood (last 7 days)</Text>
      <View style={styles.moodRow}>
        {wellness.slice(-7).map((w: any) => (
          <View key={w.log_date} style={styles.moodDot}>
            <Text style={styles.moodEmoji}>{['😞','😕','😐','🙂','😊'][w.mood_score - 1] || '—'}</Text>
            <Text style={styles.moodDate}>{w.log_date?.slice(5)}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:       { flex: 1, backgroundColor: Colors.background },
  container:    { padding: 20, paddingTop: 52, paddingBottom: 48 },
  back:         { marginBottom: 16 },
  backTxt:      { color: Colors.primary, fontSize: 14, fontWeight: '600' },
  header:       { flexDirection: 'row', gap: 14, marginBottom: 24, alignItems: 'center' },
  avatar:       { width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarTxt:    { color: '#fff', fontSize: 24, fontWeight: '700' },
  name:         { fontSize: 18, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  meta:         { fontSize: 12, color: Colors.textMuted, marginBottom: 6, textTransform: 'capitalize' },
  riskBadge:    { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  riskTxt:      { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: 10, marginTop: 16 },
  statsRow:     { flexDirection: 'row', gap: 10, marginBottom: 8 },
  statCard:     { flex: 1, backgroundColor: Colors.card, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  statVal:      { fontSize: 18, fontWeight: '700', color: Colors.text },
  statLabel:    { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  medRow:       { backgroundColor: Colors.card, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  medName:      { fontSize: 13, fontWeight: '600', color: Colors.text },
  medDose:      { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  labRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.card, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  labName:      { fontSize: 13, color: Colors.text, textTransform: 'capitalize' },
  labStatus:    { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  moodRow:      { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  moodDot:      { alignItems: 'center', backgroundColor: Colors.card, borderRadius: 10, padding: 8, minWidth: 44, borderWidth: 1, borderColor: Colors.border },
  moodEmoji:    { fontSize: 20 },
  moodDate:     { fontSize: 9, color: Colors.textMuted, marginTop: 2 },
});
```

### Step 4 — Check doctor alerts screen

```bash
cd apps/mobile
if [ ! -f "app/(doctor)/alerts.tsx" ]; then
  echo "  ❌ alerts.tsx MISSING — creating stub"
else
  echo "  ✅ alerts.tsx exists"
fi
```

If missing, create `apps/mobile/app/(doctor)/alerts.tsx`:

```typescript
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { Colors } from '../../constants/colors';

export default function DoctorAlertsScreen() {
  const { data: patients } = useQuery({
    queryKey: ['doctor-patients'],
    queryFn: () => api.get('/doctors/patients').then((r: any) => r.data),
    refetchInterval: 30000,
  });

  const critical = (patients || []).filter((p: any) => p.risk_level === 'critical');
  const warnings = (patients || []).filter((p: any) => p.risk_level === 'warning');

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Alerts</Text>

      {critical.length > 0 && (
        <View>
          <Text style={styles.sectionTitle}>🔴 Critical ({critical.length})</Text>
          {critical.map((p: any) => (
            <View key={p.id} style={[styles.card, styles.criticalCard]}>
              <Text style={styles.patName}>{p.name}</Text>
              <Text style={styles.patMeta}>BP: {p.latest_bp || '—'} · Sugar: {p.latest_sugar || '—'}</Text>
              <Text style={styles.patCond}>{p.conditions?.join(', ')}</Text>
            </View>
          ))}
        </View>
      )}

      {warnings.length > 0 && (
        <View>
          <Text style={styles.sectionTitle}>⚠️ Warnings ({warnings.length})</Text>
          {warnings.map((p: any) => (
            <View key={p.id} style={[styles.card, styles.warningCard]}>
              <Text style={styles.patName}>{p.name}</Text>
              <Text style={styles.patMeta}>BP: {p.latest_bp || '—'} · Sugar: {p.latest_sugar || '—'}</Text>
            </View>
          ))}
        </View>
      )}

      {critical.length === 0 && warnings.length === 0 && (
        <View style={styles.allGood}>
          <Text style={styles.allGoodIcon}>✅</Text>
          <Text style={styles.allGoodText}>All patients are stable</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:       { flex: 1, backgroundColor: Colors.background },
  container:    { padding: 20, paddingTop: 56 },
  title:        { fontSize: 26, fontWeight: '700', color: Colors.text, marginBottom: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 10 },
  card:         { borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1.5 },
  criticalCard: { backgroundColor: '#FEF2F2', borderColor: Colors.danger },
  warningCard:  { backgroundColor: '#FFFBF0', borderColor: Colors.warning },
  patName:      { fontSize: 15, fontWeight: '700', color: Colors.text },
  patMeta:      { fontSize: 13, color: Colors.textMuted, marginTop: 4 },
  patCond:      { fontSize: 12, color: Colors.textMuted, marginTop: 2, textTransform: 'capitalize' },
  allGood:      { alignItems: 'center', paddingTop: 80 },
  allGoodIcon:  { fontSize: 48, marginBottom: 14 },
  allGoodText:  { fontSize: 16, color: Colors.textMuted },
});
```

### Step 5 — Check notifications (lib/notifications.ts)

```bash
cd apps/mobile
echo "=== lib/notifications.ts checks ==="

if [ ! -f "lib/notifications.ts" ]; then
  echo "  ❌ notifications.ts MISSING"
else
  checks=("registerForPushNotifications" "getPermissionsAsync" "requestPermissionsAsync"
          "getExpoPushTokenAsync" "setNotificationHandler" "addNotificationReceivedListener"
          "addNotificationResponseReceivedListener")
  for c in "${checks[@]}"; do
    grep -q "$c" "lib/notifications.ts" && echo "  ✅ $c" || echo "  ❌ MISSING: $c"
  done
fi
```

### Step 6 — Verify notifications imported in root layout

```bash
cd apps/mobile
grep -q "registerForPushNotifications\|notifications" "app/_layout.tsx" \
  && echo "  ✅ Notifications imported in root layout" \
  || echo "  ❌ Notifications NOT imported in _layout.tsx — add: import { registerForPushNotifications } from '../lib/notifications'"
```

### Step 7 — Expo compile check (dry run)

```bash
cd apps/mobile
echo "=== Expo compile check ==="
npx expo export --platform web --output-dir /tmp/expo-check 2>&1 | grep -E "ERROR|error|Bundle complete|Warning" | head -20
echo "=== compile check done ==="
```

If any ERROR lines appear, fix them before declaring FT4 passed.

### Step 8 — Final complete file count

```bash
cd apps/mobile
echo ""
echo "=== COMPLETE FRONTEND FILE AUDIT ==="

ALL_FILES=(
  "app/_layout.tsx"
  "app/(auth)/_layout.tsx"
  "app/(auth)/welcome.tsx"
  "app/(auth)/signin.tsx"
  "app/(auth)/signup.tsx"
  "app/(onboarding)/patient.tsx"
  "app/(onboarding)/doctor.tsx"
  "app/(app)/_layout.tsx"
  "app/(app)/index.tsx"
  "app/(app)/nurse.tsx"
  "app/(app)/vitals.tsx"
  "app/(app)/reports.tsx"
  "app/(app)/report-detail.tsx"
  "app/(app)/medicines.tsx"
  "app/(app)/weekly-reports.tsx"
  "app/(app)/profile.tsx"
  "app/(doctor)/_layout.tsx"
  "app/(doctor)/index.tsx"
  "app/(doctor)/patient.tsx"
  "app/(doctor)/alerts.tsx"
  "store/authStore.ts"
  "store/chatStore.ts"
  "lib/supabase.ts"
  "lib/api.ts"
  "lib/notifications.ts"
  "constants/colors.ts"
  "app.json"
  "package.json"
  ".env"
)

ok=0; fail=0
for f in "${ALL_FILES[@]}"; do
  if [ -f "$f" ] && [ -s "$f" ]; then
    echo "  ✅ $f"
    ok=$((ok+1))
  else
    echo "  ❌ $f"
    fail=$((fail+1))
  fi
done

echo ""
echo "  ✅ Present: $ok / ${#ALL_FILES[@]}"
echo "  ❌ Missing: $fail"

if [ $fail -eq 0 ]; then
  echo ""
  echo "  🎉 ALL FRONTEND FILES PRESENT!"
  echo "  ▶  Run the app: npx expo start"
  echo "  📱 Scan QR with Expo Go on your phone"
else
  echo ""
  echo "  ⚠  Fix missing files above, then run: npx expo start"
fi
```
