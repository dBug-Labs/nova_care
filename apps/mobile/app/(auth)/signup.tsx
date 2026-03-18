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
