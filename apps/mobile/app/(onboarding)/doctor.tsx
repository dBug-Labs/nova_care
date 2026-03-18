import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { Colors } from '../../constants/colors';
import api from '../../lib/api';

// Steps: 1. Specialty, 2. Registration Details, 3. Hospital Info

const SPECIALTIES = [
  'General Medicine', 'Cardiology', 'Orthopedics', 'Neurology',
  'Dermatology', 'ENT', 'Ophthalmology', 'Gastroenterology',
  'Urology', 'Endocrinology', 'Pulmonology', 'Psychiatry',
];

export default function DoctorOnboarding() {
  const [step, setStep] = useState(1);
  const user = useAuthStore(s => s.user);
  const [data, setData] = useState({
    specialty: '',
    registrationNumber: '',
    hospitalName: '',
    bio: '',
    consultationFee: '',
  });

  const update = (key: string, val: string) => setData(d => ({ ...d, [key]: val }));
  const totalSteps = 3;

  const complete = async () => {
    if (!data.specialty || !data.registrationNumber) {
      Alert.alert('Error', 'Specialty and Registration Number are required.');
      return;
    }
    try {
      await api.post('/auth/complete-doctor-profile', {
        specialty: data.specialty,
        registration_number: data.registrationNumber,
        hospital_name: data.hospitalName || null,
      });
      router.replace('/(app)');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Something went wrong');
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
          <Text style={styles.stepTitle}>Your Specialty</Text>
          <Text style={styles.sub}>Select your primary area of practice</Text>
          <View style={styles.specialtyGrid}>
            {SPECIALTIES.map(s => (
              <TouchableOpacity
                key={s}
                style={[styles.specialtyBtn, data.specialty === s && styles.specialtyActive]}
                onPress={() => update('specialty', s)}
              >
                <Text style={[styles.specialtyTxt, data.specialty === s && styles.specialtyActiveTxt]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {step === 2 && (
        <View>
          <Text style={styles.stepTitle}>Registration Details</Text>
          <Text style={styles.sub}>This helps verify your credentials</Text>
          <TextInput
            style={styles.input}
            placeholder="Medical Registration Number*"
            value={data.registrationNumber}
            onChangeText={v => update('registrationNumber', v)}
            placeholderTextColor={Colors.textMuted}
          />
          <TextInput
            style={[styles.input, { height: 100 }]}
            placeholder="Brief Bio (optional)"
            value={data.bio}
            onChangeText={v => update('bio', v)}
            multiline
            placeholderTextColor={Colors.textMuted}
          />
        </View>
      )}

      {step === 3 && (
        <View>
          <Text style={styles.stepTitle}>Hospital / Clinic</Text>
          <TextInput
            style={styles.input}
            placeholder="Hospital / Clinic Name (optional)"
            value={data.hospitalName}
            onChangeText={v => update('hospitalName', v)}
            placeholderTextColor={Colors.textMuted}
          />
          <TextInput
            style={styles.input}
            placeholder="Consultation Fee (₹)"
            value={data.consultationFee}
            onChangeText={v => update('consultationFee', v)}
            keyboardType="numeric"
            placeholderTextColor={Colors.textMuted}
          />
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
          <Text style={styles.nextTxt}>
            {step === totalSteps ? 'Start Dashboard 🩺' : 'Next'}
          </Text>
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
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 16, fontSize: 15, color: Colors.text, backgroundColor: Colors.card, marginBottom: 14 },
  specialtyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  specialtyBtn: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.card },
  specialtyActive: { borderColor: Colors.primary, backgroundColor: `${Colors.primary}15` },
  specialtyTxt: { fontSize: 13, color: Colors.textMuted, fontWeight: '500' },
  specialtyActiveTxt: { color: Colors.primary, fontWeight: '600' },
  navRow: { flexDirection: 'row', gap: 12, marginTop: 32 },
  backBtn: { paddingHorizontal: 24, paddingVertical: 16, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.border },
  backTxt: { fontSize: 15, color: Colors.text, fontWeight: '600' },
  nextBtn: { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 32, alignItems: 'center' },
  nextTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
  skipTxt: { color: Colors.textMuted, textAlign: 'center', marginTop: 16, fontSize: 13 },
});
