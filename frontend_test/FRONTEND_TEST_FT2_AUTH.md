# NovaCare Frontend Test — FT2: Auth & Onboarding Screens
> Paste FRONTEND_TEST_MASTER.md first, then this file.
> Dependency: FT1 must pass (all files exist, deps installed).

---

## What This Tests
- Welcome screen renders with correct buttons
- Signup screen: both roles (patient/doctor), all fields, form validation
- Signin screen: email/password, error handling
- authStore: initialize, setUser, signOut, profile fetch
- Patient onboarding: all 5 steps, data saves to Supabase
- Doctor onboarding: specialty + registration form
- Navigation flow: auth → onboarding → app

---

## Instructions for Agent

### Step 1 — Check welcome.tsx

```bash
cd apps/mobile
echo "=== welcome.tsx checks ==="

checks=(
  "Get Started"
  "Already have an account"
  "router.push"
  "auth/signup"
  "auth/signin"
  "NovaCare"
  "StyleSheet"
)
for c in "${checks[@]}"; do
  grep -q "$c" app/\(auth\)/welcome.tsx 2>/dev/null \
    && echo "  ✅ has: $c" \
    || echo "  ❌ MISSING: $c"
done
```

### Step 2 — Check signup.tsx

```bash
cd apps/mobile
echo "=== signup.tsx checks ==="

checks=(
  "patient"
  "doctor"
  "email"
  "password"
  "fullName"
  "api.post"
  "auth/signup"
  "supabase.auth.signInWithPassword"
  "onboarding"
  "Alert"
  "loading"
  "role"
)
for c in "${checks[@]}"; do
  grep -q "$c" app/\(auth\)/signup.tsx 2>/dev/null \
    && echo "  ✅ has: $c" \
    || echo "  ❌ MISSING: $c"
done
```

### Step 3 — Check signin.tsx

```bash
cd apps/mobile
echo "=== signin.tsx checks ==="

checks=(
  "supabase.auth.signInWithPassword"
  "useAuthStore"
  "setUser"
  "router.replace"
  "app"
  "Alert"
  "loading"
  "email"
  "password"
)
for c in "${checks[@]}"; do
  grep -q "$c" app/\(auth\)/signin.tsx 2>/dev/null \
    && echo "  ✅ has: $c" \
    || echo "  ❌ MISSING: $c"
done
```

### Step 4 — Check authStore.ts

```bash
cd apps/mobile
echo "=== authStore.ts checks ==="

checks=(
  "create"
  "supabase"
  "user"
  "profile"
  "loading"
  "setUser"
  "setProfile"
  "signOut"
  "initialize"
  "getSession"
  "onAuthStateChange"
  "onboarding_complete"
  "role"
)
for c in "${checks[@]}"; do
  grep -q "$c" store/authStore.ts 2>/dev/null \
    && echo "  ✅ has: $c" \
    || echo "  ❌ MISSING: $c"
done
```

### Step 5 — Check patient onboarding (5 steps)

```bash
cd apps/mobile
echo "=== (onboarding)/patient.tsx checks ==="

checks=(
  "step"
  "setStep"
  "totalSteps"
  "5"
  "dateOfBirth"
  "gender"
  "bloodGroup"
  "heightCm"
  "weightKg"
  "chronic_conditions"
  "allergies"
  "emergencyName"
  "supabase"
  "patient_profiles"
  "onboarding_complete"
  "progressBar"
  "Skip"
)
for c in "${checks[@]}"; do
  grep -q "$c" app/\(onboarding\)/patient.tsx 2>/dev/null \
    && echo "  ✅ has: $c" \
    || echo "  ❌ MISSING: $c"
done
```

### Step 6 — Check doctor onboarding exists

```bash
cd apps/mobile
if [ -f "app/(onboarding)/doctor.tsx" ]; then
  echo "  ✅ doctor onboarding file exists"
  grep -q "specialty" app/\(onboarding\)/doctor.tsx && echo "  ✅ has specialty field" || echo "  ❌ missing specialty"
  grep -q "registration" app/\(onboarding\)/doctor.tsx && echo "  ✅ has registration field" || echo "  ❌ missing registration"
else
  echo "  ❌ app/(onboarding)/doctor.tsx MISSING — creating it now"
fi
```

### Step 7 — If doctor onboarding is missing, create it

If the file doesn't exist, write this to `apps/mobile/app/(onboarding)/doctor.tsx`:

```typescript
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { Colors } from '../../constants/colors';

const SPECIALTIES = [
  'General Medicine', 'Cardiology', 'Orthopedics', 'Gastroenterology',
  'Neurology', 'Endocrinology', 'Pulmonology', 'Urology',
  'Dermatology', 'Ophthalmology', 'ENT', 'Nephrology',
];

export default function DoctorOnboarding() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    specialty: '', registration: '', hospital: '', bio: '',
  });
  const user = useAuthStore(s => s.user);
  const up = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const complete = async () => {
    if (!form.specialty || !form.registration) {
      Alert.alert('Required', 'Please select specialty and enter registration number');
      return;
    }
    try {
      await supabase.from('doctor_profiles').update({
        specialty: form.specialty.toLowerCase().replace(/ /g, '_'),
        registration_number: form.registration,
        hospital_name: form.hospital,
        bio: form.bio,
      }).eq('id', user!.id);

      await supabase.from('profiles').update({ onboarding_complete: true }).eq('id', user!.id);
      router.replace('/(doctor)');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <View style={styles.progress}>
        <View style={[styles.bar, { width: `${(step / 3) * 100}%` }]} />
      </View>
      <Text style={styles.stepLabel}>Step {step} of 3</Text>

      {step === 1 && (
        <View>
          <Text style={styles.title}>Your Specialty</Text>
          <Text style={styles.sub}>Select your medical specialty</Text>
          {SPECIALTIES.map(sp => (
            <TouchableOpacity key={sp}
              style={[styles.optionRow, form.specialty === sp && styles.optionActive]}
              onPress={() => up('specialty', sp)}>
              <Text style={[styles.optionTxt, form.specialty === sp && styles.optionActiveTxt]}>{sp}</Text>
              {form.specialty === sp && <Text style={{ color: Colors.primary }}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {step === 2 && (
        <View>
          <Text style={styles.title}>Registration</Text>
          <TextInput style={styles.input} placeholder="Medical Registration Number *"
            value={form.registration} onChangeText={v => up('registration', v)}
            placeholderTextColor={Colors.textMuted} />
          <TextInput style={styles.input} placeholder="Hospital / Clinic Name"
            value={form.hospital} onChangeText={v => up('hospital', v)}
            placeholderTextColor={Colors.textMuted} />
        </View>
      )}

      {step === 3 && (
        <View>
          <Text style={styles.title}>About You</Text>
          <TextInput style={[styles.input, { height: 120 }]}
            placeholder="Short bio (optional) — your experience, specializations..."
            value={form.bio} onChangeText={v => up('bio', v)}
            multiline placeholderTextColor={Colors.textMuted} />
        </View>
      )}

      <View style={styles.nav}>
        {step > 1 && (
          <TouchableOpacity style={styles.backBtn} onPress={() => setStep(s => s - 1)}>
            <Text style={styles.backTxt}>Back</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.nextBtn, { flex: step > 1 ? 1 : undefined }]}
          onPress={() => step < 3 ? setStep(s => s + 1) : complete()}>
          <Text style={styles.nextTxt}>{step === 3 ? 'Start Seeing Patients 🏥' : 'Next'}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:    { flex: 1, backgroundColor: Colors.background },
  container: { padding: 24, paddingTop: 52 },
  progress:  { height: 4, backgroundColor: Colors.border, borderRadius: 2, marginBottom: 8 },
  bar:       { height: 4, backgroundColor: Colors.primary, borderRadius: 2 },
  stepLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: 24 },
  title:     { fontSize: 24, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  sub:       { fontSize: 14, color: Colors.textMuted, marginBottom: 20 },
  input:     { borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 16,
               fontSize: 15, color: Colors.text, backgroundColor: Colors.card, marginBottom: 14 },
  optionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
               padding: 16, borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
               backgroundColor: Colors.card, marginBottom: 10 },
  optionActive: { borderColor: Colors.primary, backgroundColor: `${Colors.primary}10` },
  optionTxt:    { fontSize: 14, color: Colors.text },
  optionActiveTxt: { color: Colors.primary, fontWeight: '600' },
  nav:       { flexDirection: 'row', gap: 12, marginTop: 32 },
  backBtn:   { paddingHorizontal: 24, paddingVertical: 16, borderRadius: 14,
               borderWidth: 1.5, borderColor: Colors.border },
  backTxt:   { fontSize: 15, color: Colors.text, fontWeight: '600' },
  nextBtn:   { backgroundColor: Colors.primary, borderRadius: 14,
               paddingVertical: 16, paddingHorizontal: 32, alignItems: 'center' },
  nextTxt:   { color: '#fff', fontSize: 15, fontWeight: '700' },
});
```

### Step 8 — Verify profile screen exists

```bash
cd apps/mobile
if [ -f "app/(app)/profile.tsx" ]; then
  echo "  ✅ profile.tsx exists"
else
  echo "  ❌ profile.tsx MISSING — creating stub"
fi
```

If `profile.tsx` is missing, create `apps/mobile/app/(app)/profile.tsx`:

```typescript
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { useAuthStore } from '../../store/authStore';
import { Colors } from '../../constants/colors';
import { router } from 'expo-router';

export default function ProfileScreen() {
  const { profile, signOut } = useAuthStore();

  const handleSignOut = async () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => {
          await signOut();
          router.replace('/(auth)/welcome');
        }
      },
    ]);
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <View style={styles.avatarCircle}>
        <Text style={styles.avatarText}>
          {profile?.full_name?.charAt(0)?.toUpperCase() || '?'}
        </Text>
      </View>
      <Text style={styles.name}>{profile?.full_name || 'Your Name'}</Text>
      <Text style={styles.role}>{profile?.role === 'doctor' ? '👨‍⚕️ Doctor' : '🧑 Patient'}</Text>

      <View style={styles.infoCard}>
        {[
          { label: 'Email',     value: profile?.email || '—' },
          { label: 'Phone',     value: profile?.phone || '—' },
          { label: 'Blood Group', value: profile?.patient_profiles?.blood_group || '—' },
          { label: 'BMI',       value: profile?.patient_profiles?.bmi?.toString() || '—' },
        ].map(item => (
          <View key={item.label} style={styles.infoRow}>
            <Text style={styles.infoLabel}>{item.label}</Text>
            <Text style={styles.infoValue}>{item.value}</Text>
          </View>
        ))}
      </View>

      <View style={styles.condCard}>
        <Text style={styles.condTitle}>Chronic Conditions</Text>
        {(profile?.patient_profiles?.chronic_conditions || []).length > 0
          ? (profile.patient_profiles.chronic_conditions as string[]).map((c: string) => (
              <Text key={c} style={styles.condItem}>• {c.replace(/_/g, ' ')}</Text>
            ))
          : <Text style={styles.condItem}>None recorded</Text>
        }
      </View>

      <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:      { flex: 1, backgroundColor: Colors.background },
  container:   { padding: 20, paddingTop: 56, alignItems: 'center' },
  avatarCircle:{ width: 88, height: 88, borderRadius: 44, backgroundColor: Colors.primary,
                 alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  avatarText:  { color: '#fff', fontSize: 36, fontWeight: '700' },
  name:        { fontSize: 22, fontWeight: '700', color: Colors.text },
  role:        { fontSize: 14, color: Colors.textMuted, marginTop: 4, marginBottom: 24 },
  infoCard:    { width: '100%', backgroundColor: Colors.card, borderRadius: 16,
                 borderWidth: 1, borderColor: Colors.border, marginBottom: 16 },
  infoRow:     { flexDirection: 'row', justifyContent: 'space-between', padding: 16,
                 borderBottomWidth: 1, borderBottomColor: Colors.border },
  infoLabel:   { fontSize: 13, color: Colors.textMuted },
  infoValue:   { fontSize: 13, color: Colors.text, fontWeight: '600' },
  condCard:    { width: '100%', backgroundColor: Colors.card, borderRadius: 16,
                 padding: 16, borderWidth: 1, borderColor: Colors.border, marginBottom: 24 },
  condTitle:   { fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 10 },
  condItem:    { fontSize: 13, color: Colors.textMuted, textTransform: 'capitalize', marginBottom: 4 },
  signOutBtn:  { backgroundColor: `${Colors.danger}15`, borderRadius: 14, padding: 16,
                 width: '100%', alignItems: 'center', borderWidth: 1, borderColor: Colors.danger },
  signOutText: { color: Colors.danger, fontSize: 15, fontWeight: '700' },
});
```

### Step 9 — Final summary for FT2

```bash
cd apps/mobile
echo ""
echo "=== FT2 Summary ==="
echo "Files checked:"
for f in "app/(auth)/welcome.tsx" "app/(auth)/signin.tsx" "app/(auth)/signup.tsx" \
         "app/(onboarding)/patient.tsx" "app/(onboarding)/doctor.tsx" \
         "app/(app)/profile.tsx" "store/authStore.ts"; do
  [ -f "$f" ] && echo "  ✅ $f" || echo "  ❌ $f"
done
```
