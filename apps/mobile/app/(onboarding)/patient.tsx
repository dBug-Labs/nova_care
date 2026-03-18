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
    currentMeds: '',
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
            multiline value={data.currentMeds} onChangeText={v => update('currentMeds', v)}
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
