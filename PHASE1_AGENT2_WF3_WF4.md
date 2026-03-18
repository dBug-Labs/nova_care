# NovaCare — Phase 1 | Agent 2
## Workflows: WF3 (Auth & Onboarding) + WF4 (User Profiles UI)
> Paste NOVACARE_MASTER.md into context first, then this file.
> Branch: `phase1/auth`
> Model: Claude Opus
> Dependency: WF1 must be complete (project scaffold exists)

---

## WF3: Authentication System (Backend + Frontend)

### Goal
Complete auth flow: Sign up, Sign in, Sign out, Password reset — using Supabase Auth. Two flows: Patient and Doctor.

### Backend — Auth Router
`services/api/routers/auth.py`:
```python
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from supabase import create_client
from config import settings
from typing import Optional

router = APIRouter()
supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)


class SignUpRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: str  # 'patient' or 'doctor'
    phone: Optional[str] = None

class SignInRequest(BaseModel):
    email: EmailStr
    password: str

class DoctorSignUpExtra(BaseModel):
    specialty: str
    registration_number: str
    hospital_name: Optional[str] = None


@router.post("/signup")
async def sign_up(req: SignUpRequest):
    try:
        # Create Supabase auth user
        res = supabase.auth.admin.create_user({
            "email": req.email,
            "password": req.password,
            "email_confirm": True,  # auto-confirm for hackathon
            "user_metadata": {"full_name": req.full_name, "role": req.role}
        })
        user_id = res.user.id

        # Create profile record
        supabase.table("profiles").insert({
            "id": user_id,
            "role": req.role,
            "full_name": req.full_name,
            "phone": req.phone,
        }).execute()

        # Create role-specific profile stub
        if req.role == "patient":
            supabase.table("patient_profiles").insert({"id": user_id}).execute()
        elif req.role == "doctor":
            supabase.table("doctor_profiles").insert({
                "id": user_id,
                "specialty": "general",
                "registration_number": "PENDING"
            }).execute()

        return {"success": True, "data": {"user_id": user_id}, "error": None}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/complete-doctor-profile")
async def complete_doctor_profile(req: DoctorSignUpExtra, user=Depends(get_current_user)):
    # Update doctor profile with full details
    supabase.table("doctor_profiles").update({
        "specialty": req.specialty,
        "registration_number": req.registration_number,
        "hospital_name": req.hospital_name,
    }).eq("id", user.id).execute()
    return {"success": True, "data": None, "error": None}
```

### Frontend — Auth Screens

`apps/mobile/app/(auth)/_layout.tsx`:
```typescript
import { Stack } from 'expo-router';
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

`apps/mobile/app/(auth)/welcome.tsx`:
```typescript
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';

export default function WelcomeScreen() {
  return (
    <View style={styles.container}>
      {/* Logo */}
      <View style={styles.logoArea}>
        <Text style={styles.appName}>NovaCare</Text>
        <Text style={styles.tagline}>Your AI Health Companion</Text>
      </View>

      {/* Illustration placeholder */}
      <View style={styles.illustrationBox} />

      {/* CTA */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => router.push('/(auth)/signup')}
        >
          <Text style={styles.primaryBtnText}>Get Started</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => router.push('/(auth)/signin')}
        >
          <Text style={styles.secondaryBtnText}>Already have an account</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.disclaimer}>
        NovaCare is a health monitoring tool, not a substitute for medical advice.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: 24, justifyContent: 'space-between' },
  logoArea: { alignItems: 'center', marginTop: 60 },
  appName: { fontSize: 42, fontWeight: '700', color: Colors.primary },
  tagline: { fontSize: 16, color: Colors.textMuted, marginTop: 8 },
  illustrationBox: { height: 220, backgroundColor: Colors.border, borderRadius: 20, marginVertical: 24 },
  actions: { gap: 12, marginBottom: 16 },
  primaryBtn: { backgroundColor: Colors.primary, borderRadius: 14, padding: 18, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryBtn: { borderWidth: 1.5, borderColor: Colors.primary, borderRadius: 14, padding: 18, alignItems: 'center' },
  secondaryBtnText: { color: Colors.primary, fontSize: 16, fontWeight: '600' },
  disclaimer: { fontSize: 10, color: Colors.textMuted, textAlign: 'center', marginBottom: 8 },
});
```

`apps/mobile/app/(auth)/signup.tsx`:
```typescript
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/colors';
import api from '../../lib/api';

export default function SignUpScreen() {
  const [form, setForm] = useState({ email: '', password: '', fullName: '', phone: '' });
  const [role, setRole] = useState<'patient' | 'doctor'>('patient');
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    if (!form.email || !form.password || !form.fullName) {
      Alert.alert('Error', 'Please fill all required fields');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/signup', { ...form, role });
      // Sign in immediately
      const { error } = await supabase.auth.signInWithPassword({
        email: form.email, password: form.password
      });
      if (error) throw error;
      // Route to onboarding
      router.replace(role === 'patient' ? '/(onboarding)/patient' : '/(onboarding)/doctor');
    } catch (err: any) {
      Alert.alert('Sign Up Failed', err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Create Account</Text>

      {/* Role selector */}
      <View style={styles.roleRow}>
        {(['patient', 'doctor'] as const).map(r => (
          <TouchableOpacity
            key={r}
            style={[styles.roleBtn, role === r && styles.roleBtnActive]}
            onPress={() => setRole(r)}
          >
            <Text style={[styles.roleTxt, role === r && styles.roleTxtActive]}>
              {r === 'patient' ? '🧑‍⚕️ Patient' : '👨‍⚕️ Doctor'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Form fields */}
      {[
        { key: 'fullName', placeholder: 'Full Name*', autoCapitalize: 'words' as const },
        { key: 'email', placeholder: 'Email*', keyboardType: 'email-address' as const, autoCapitalize: 'none' as const },
        { key: 'phone', placeholder: 'Phone Number' },
        { key: 'password', placeholder: 'Password*', secureTextEntry: true },
      ].map(field => (
        <TextInput
          key={field.key}
          style={styles.input}
          placeholder={field.placeholder}
          placeholderTextColor={Colors.textMuted}
          value={form[field.key as keyof typeof form]}
          onChangeText={v => setForm(f => ({ ...f, [field.key]: v }))}
          {...field}
        />
      ))}

      <TouchableOpacity style={styles.submitBtn} onPress={handleSignUp} disabled={loading}>
        <Text style={styles.submitTxt}>{loading ? 'Creating account...' : 'Create Account'}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push('/(auth)/signin')}>
        <Text style={styles.link}>Already have an account? Sign in</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.background },
  container: { padding: 24, paddingTop: 60 },
  title: { fontSize: 28, fontWeight: '700', color: Colors.text, marginBottom: 24 },
  roleRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  roleBtn: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center' },
  roleBtnActive: { borderColor: Colors.primary, backgroundColor: `${Colors.primary}15` },
  roleTxt: { fontSize: 14, color: Colors.textMuted, fontWeight: '500' },
  roleTxtActive: { color: Colors.primary },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 16, fontSize: 15, color: Colors.text, backgroundColor: Colors.card, marginBottom: 14 },
  submitBtn: { backgroundColor: Colors.primary, borderRadius: 14, padding: 18, alignItems: 'center', marginTop: 8 },
  submitTxt: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { color: Colors.primary, textAlign: 'center', marginTop: 20, fontSize: 14 },
});
```

`apps/mobile/app/(auth)/signin.tsx`:
```typescript
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { Colors } from '../../constants/colors';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const setUser = useAuthStore(s => s.setUser);

  const handleSignIn = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setUser(data.user);
      router.replace('/(app)');
    } catch (err: any) {
      Alert.alert('Sign In Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome Back</Text>
      <Text style={styles.sub}>Sign in to NovaCare</Text>

      <TextInput style={styles.input} placeholder="Email" value={email}
        onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none"
        placeholderTextColor={Colors.textMuted} />
      <TextInput style={styles.input} placeholder="Password" value={password}
        onChangeText={setPassword} secureTextEntry
        placeholderTextColor={Colors.textMuted} />

      <TouchableOpacity style={styles.forgotBtn} onPress={() => router.push('/(auth)/forgot-password')}>
        <Text style={styles.forgotTxt}>Forgot password?</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.btn} onPress={handleSignIn} disabled={loading}>
        <Text style={styles.btnTxt}>{loading ? 'Signing in...' : 'Sign In'}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push('/(auth)/signup')}>
        <Text style={styles.link}>Don't have an account? Sign up</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: 24, paddingTop: 80 },
  title: { fontSize: 32, fontWeight: '700', color: Colors.text },
  sub: { fontSize: 16, color: Colors.textMuted, marginTop: 6, marginBottom: 32 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 16, fontSize: 15, color: Colors.text, backgroundColor: Colors.card, marginBottom: 14 },
  forgotBtn: { alignSelf: 'flex-end', marginBottom: 20 },
  forgotTxt: { color: Colors.primary, fontSize: 14 },
  btn: { backgroundColor: Colors.primary, borderRadius: 14, padding: 18, alignItems: 'center' },
  btnTxt: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { color: Colors.primary, textAlign: 'center', marginTop: 24, fontSize: 14 },
});
```

### Auth State Store
`apps/mobile/store/authStore.ts`:
```typescript
import { create } from 'zustand';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthState {
  user: User | null;
  profile: any | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  setProfile: (profile: any) => void;
  signOut: () => Promise<void>;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  loading: true,

  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, profile: null });
  },

  initialize: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      set({ user: session.user });
      // Fetch profile
      const { data } = await supabase
        .from('profiles')
        .select('*, patient_profiles(*), doctor_profiles(*)')
        .eq('id', session.user.id)
        .single();
      set({ profile: data });
    }
    set({ loading: false });

    // Listen for auth changes
    supabase.auth.onAuthStateChange(async (event, session) => {
      set({ user: session?.user ?? null });
    });
  },
}));
```

---

## WF4: Patient Onboarding Flow

### Goal
Multi-step onboarding that collects all essential health data upfront. 5 screens for patient, 3 for doctor.

`apps/mobile/app/(onboarding)/patient.tsx`:
```typescript
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { Colors } from '../../constants/colors';

// Steps: 1. Personal Info, 2. Health Basics, 3. Chronic Conditions, 4. Medicines, 5. Emergency Contact

const CHRONIC_CONDITIONS = [
  { key: 'diabetes_type2', label: 'Diabetes (Type 2)' },
  { key: 'diabetes_type1', label: 'Diabetes (Type 1)' },
  { key: 'hypertension', label: 'High Blood Pressure' },
  { key: 'heart_disease', label: 'Heart Disease' },
  { key: 'thyroid', label: 'Thyroid' },
  { key: 'asthma', label: 'Asthma' },
  { key: 'arthritis', label: 'Arthritis' },
  { key: 'obesity', label: 'Obesity' },
];

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export default function PatientOnboarding() {
  const [step, setStep] = useState(1);
  const user = useAuthStore(s => s.user);
  const [data, setData] = useState({
    dateOfBirth: '',
    gender: '',
    bloodGroup: '',
    heightCm: '',
    weightKg: '',
    conditions: [] as string[],
    allergies: '',
    emergencyName: '',
    emergencyPhone: '',
  });

  const update = (key: string, val: any) => setData(d => ({ ...d, [key]: val }));
  const totalSteps = 5;

  const toggleCondition = (key: string) => {
    setData(d => ({
      ...d,
      conditions: d.conditions.includes(key)
        ? d.conditions.filter(c => c !== key)
        : [...d.conditions, key]
    }));
  };

  const complete = async () => {
    try {
      await supabase.from('patient_profiles').update({
        date_of_birth: data.dateOfBirth || null,
        blood_group: data.bloodGroup || null,
        height_cm: parseFloat(data.heightCm) || null,
        weight_kg: parseFloat(data.weightKg) || null,
        chronic_conditions: data.conditions,
        allergies: data.allergies ? data.allergies.split(',').map(s => s.trim()) : [],
        emergency_contact_name: data.emergencyName || null,
        emergency_contact_phone: data.emergencyPhone || null,
      }).eq('id', user!.id);

      await supabase.from('profiles').update({
        gender: data.gender || null,
        onboarding_complete: true,
      }).eq('id', user!.id);

      router.replace('/(app)');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      {/* Progress bar */}
      <View style={styles.progressBar}>
        <View style={[styles.progress, { width: `${(step / totalSteps) * 100}%` }]} />
      </View>
      <Text style={styles.stepLabel}>Step {step} of {totalSteps}</Text>

      {step === 1 && (
        <View>
          <Text style={styles.stepTitle}>Personal Details</Text>
          <TextInput style={styles.input} placeholder="Date of Birth (YYYY-MM-DD)"
            value={data.dateOfBirth} onChangeText={v => update('dateOfBirth', v)}
            placeholderTextColor={Colors.textMuted} />
          <Text style={styles.label}>Gender</Text>
          <View style={styles.optionRow}>
            {['male', 'female', 'other'].map(g => (
              <TouchableOpacity key={g} style={[styles.optionBtn, data.gender === g && styles.optionActive]}
                onPress={() => update('gender', g)}>
                <Text style={[styles.optionTxt, data.gender === g && styles.optionActiveTxt]}>
                  {g.charAt(0).toUpperCase() + g.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {step === 2 && (
        <View>
          <Text style={styles.stepTitle}>Health Basics</Text>
          <Text style={styles.label}>Blood Group</Text>
          <View style={styles.optionRow}>
            {BLOOD_GROUPS.map(bg => (
              <TouchableOpacity key={bg} style={[styles.chipBtn, data.bloodGroup === bg && styles.chipActive]}
                onPress={() => update('bloodGroup', bg)}>
                <Text style={[styles.chipTxt, data.bloodGroup === bg && styles.chipActiveTxt]}>{bg}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput style={styles.input} placeholder="Height (cm)" keyboardType="numeric"
            value={data.heightCm} onChangeText={v => update('heightCm', v)}
            placeholderTextColor={Colors.textMuted} />
          <TextInput style={styles.input} placeholder="Weight (kg)" keyboardType="numeric"
            value={data.weightKg} onChangeText={v => update('weightKg', v)}
            placeholderTextColor={Colors.textMuted} />
        </View>
      )}

      {step === 3 && (
        <View>
          <Text style={styles.stepTitle}>Chronic Conditions</Text>
          <Text style={styles.sub}>Select all that apply</Text>
          {CHRONIC_CONDITIONS.map(c => (
            <TouchableOpacity key={c.key}
              style={[styles.conditionRow, data.conditions.includes(c.key) && styles.conditionActive]}
              onPress={() => toggleCondition(c.key)}>
              <Text style={[styles.conditionTxt, data.conditions.includes(c.key) && styles.conditionActiveTxt]}>{c.label}</Text>
              {data.conditions.includes(c.key) && <Text style={{ color: Colors.primary }}>✓</Text>}
            </TouchableOpacity>
          ))}
          <TextInput style={[styles.input, { marginTop: 16 }]} placeholder="Allergies (comma separated)"
            value={data.allergies} onChangeText={v => update('allergies', v)}
            placeholderTextColor={Colors.textMuted} />
        </View>
      )}

      {step === 4 && (
        <View>
          <Text style={styles.stepTitle}>Current Medicines</Text>
          <Text style={styles.sub}>You can add medicines in detail after onboarding. Any current ones you want to note?</Text>
          <TextInput style={[styles.input, { height: 100 }]} placeholder="E.g. Metformin 500mg twice daily, Amlodipine 5mg morning..."
            multiline value={data.allergies} onChangeText={v => update('currentMeds', v)}
            placeholderTextColor={Colors.textMuted} />
          <Text style={styles.note}>We'll help you set up reminders in the app.</Text>
        </View>
      )}

      {step === 5 && (
        <View>
          <Text style={styles.stepTitle}>Emergency Contact</Text>
          <TextInput style={styles.input} placeholder="Contact Name"
            value={data.emergencyName} onChangeText={v => update('emergencyName', v)}
            placeholderTextColor={Colors.textMuted} />
          <TextInput style={styles.input} placeholder="Contact Phone"
            keyboardType="phone-pad" value={data.emergencyPhone}
            onChangeText={v => update('emergencyPhone', v)}
            placeholderTextColor={Colors.textMuted} />
        </View>
      )}

      {/* Navigation */}
      <View style={styles.navRow}>
        {step > 1 && (
          <TouchableOpacity style={styles.backBtn} onPress={() => setStep(s => s - 1)}>
            <Text style={styles.backTxt}>Back</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.nextBtn, { flex: step > 1 ? 1 : undefined }]}
          onPress={() => step < totalSteps ? setStep(s => s + 1) : complete()}
        >
          <Text style={styles.nextTxt}>{step === totalSteps ? 'Start My Journey 🌿' : 'Next'}</Text>
        </TouchableOpacity>
      </View>

      {step < totalSteps && (
        <TouchableOpacity onPress={() => setStep(s => s + 1)}>
          <Text style={styles.skipTxt}>Skip for now</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.background },
  container: { padding: 24, paddingTop: 48 },
  progressBar: { height: 4, backgroundColor: Colors.border, borderRadius: 2, marginBottom: 8 },
  progress: { height: 4, backgroundColor: Colors.primary, borderRadius: 2 },
  stepLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: 24 },
  stepTitle: { fontSize: 24, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  sub: { fontSize: 14, color: Colors.textMuted, marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: Colors.text, marginBottom: 8, marginTop: 4 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 16, fontSize: 15, color: Colors.text, backgroundColor: Colors.card, marginBottom: 14 },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  optionBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, borderWidth: 1.5, borderColor: Colors.border },
  optionActive: { borderColor: Colors.primary, backgroundColor: `${Colors.primary}15` },
  optionTxt: { fontSize: 14, color: Colors.textMuted },
  optionActiveTxt: { color: Colors.primary, fontWeight: '600' },
  chipBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card },
  chipActive: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  chipTxt: { fontSize: 13, color: Colors.text },
  chipActiveTxt: { color: '#fff' },
  conditionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card, marginBottom: 10 },
  conditionActive: { borderColor: Colors.primary, backgroundColor: `${Colors.primary}10` },
  conditionTxt: { fontSize: 14, color: Colors.text },
  conditionActiveTxt: { color: Colors.primary, fontWeight: '600' },
  note: { fontSize: 12, color: Colors.textMuted, marginTop: 8, fontStyle: 'italic' },
  navRow: { flexDirection: 'row', gap: 12, marginTop: 32 },
  backBtn: { paddingHorizontal: 24, paddingVertical: 16, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.border },
  backTxt: { fontSize: 15, color: Colors.text, fontWeight: '600' },
  nextBtn: { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 32, alignItems: 'center' },
  nextTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
  skipTxt: { color: Colors.textMuted, textAlign: 'center', marginTop: 16, fontSize: 13 },
});
```

### Main App Layout (post-auth)
`apps/mobile/app/(app)/_layout.tsx`:
```typescript
import { Tabs } from 'expo-router';
import { Colors } from '../../constants/colors';

export default function AppLayout() {
  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: Colors.primary,
      tabBarInactiveTintColor: Colors.textMuted,
      tabBarStyle: { backgroundColor: '#fff', borderTopColor: Colors.border, height: 60 },
      headerShown: false,
    }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🏠</Text> }} />
      <Tabs.Screen name="nurse" options={{ title: 'Nurse', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>💬</Text> }} />
      <Tabs.Screen name="vitals" options={{ title: 'Vitals', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>❤️</Text> }} />
      <Tabs.Screen name="reports" options={{ title: 'Reports', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>📋</Text> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>👤</Text> }} />
    </Tabs>
  );
}
```

### App Home Screen stub
`apps/mobile/app/(app)/index.tsx`:
```typescript
import { useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useAuthStore } from '../../store/authStore';
import { Colors } from '../../constants/colors';

export default function HomeScreen() {
  const profile = useAuthStore(s => s.profile);
  const name = profile?.full_name?.split(' ')[0] || 'there';

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.greeting}>Good morning, {name} 🌿</Text>
      <Text style={styles.sub}>How are you feeling today?</Text>
      {/* Daily mood check-in card — Phase 3 */}
      <View style={styles.placeholder}><Text style={{ color: Colors.textMuted }}>Daily check-in (Phase 3)</Text></View>
      {/* Vitals summary — Phase 3 */}
      <View style={styles.placeholder}><Text style={{ color: Colors.textMuted }}>Vitals summary (Phase 3)</Text></View>
      {/* AI nurse quick chat — Phase 2 */}
      <View style={styles.placeholder}><Text style={{ color: Colors.textMuted }}>AI Nurse chat (Phase 2)</Text></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.background },
  container: { padding: 20, paddingTop: 56 },
  greeting: { fontSize: 26, fontWeight: '700', color: Colors.text },
  sub: { fontSize: 15, color: Colors.textMuted, marginTop: 4, marginBottom: 24 },
  placeholder: { backgroundColor: Colors.card, borderRadius: 16, padding: 24, marginBottom: 16, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', height: 100, justifyContent: 'center' },
});
```

### WF3 + WF4 Done Checklist
- [ ] Backend auth router: signup, signin working via API
- [ ] Frontend: Welcome, SignUp, SignIn screens built
- [ ] Auth store (Zustand) initialized, session persists on restart
- [ ] Patient onboarding: all 5 steps, data saved to Supabase
- [ ] Doctor onboarding: 3-step specialty + registration flow
- [ ] Main app tab layout created (Home, Nurse, Vitals, Reports, Profile)
- [ ] Home screen scaffold with placeholders for future phases
- [ ] All screens: proper error handling, loading states
- [ ] Test: Create patient account → complete onboarding → land on Home
- [ ] Test: Create doctor account → complete onboarding → land on Doctor Home
- [ ] Commit to branch `phase1/auth`

---

## PR Instructions
```bash
git add .
git commit -m "feat(phase1): auth system + patient/doctor onboarding flows"
git push origin phase1/auth
# Create PR: phase1/auth → develop
# Tag: @Agent3 for review before merge
```

## Notes for Agent 3 (Reviewer)
When reviewing PRs from Agent 1 (WF1+WF2) and Agent 2 (WF3+WF4):
1. Verify Supabase migrations ran without errors
2. Test auth flow end-to-end (signup → onboarding → home)
3. Confirm all env variable names match NOVACARE_MASTER.md
4. Merge both into `develop`
5. Tag Agent 1 and Agent 2 that Phase 1 is complete → Phase 2 can begin
