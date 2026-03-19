import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { Colors } from '../../constants/colors';

export default function DoctorSignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { setUser, setProfile } = useAuthStore();

  const handleSignIn = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      
      // Fetch profile to verify role
      const { data: profile, error: pError } = await supabase
        .from('profiles')
        .select('*, doctor_profiles(*)')
        .eq('id', data.user.id)
        .single();
        
      if (pError) throw pError;
      
      if (profile.role !== 'doctor') {
        await supabase.auth.signOut();
        Alert.alert('Access Denied', 'This sign-in is only for doctors. Please use the patient sign-in.');
        return;
      }

      setUser(data.user);
      setProfile(profile);
      
      if (!profile.onboarding_complete) {
        router.replace('/(onboarding)/doctor');
      } else {
        router.replace('/(doctor)');
      }
    } catch (err: any) {
      Alert.alert('Sign In Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backTxt}>← Back</Text>
      </TouchableOpacity>
      
      <Text style={styles.title}>Doctor Portal 🩺</Text>
      <Text style={styles.sub}>Sign in to your professional dashboard</Text>

      <TextInput 
        style={styles.input} 
        placeholder="Medical Email" 
        value={email}
        onChangeText={setEmail} 
        keyboardType="email-address" 
        autoCapitalize="none"
        placeholderTextColor={Colors.textMuted} 
      />
      <TextInput 
        style={styles.input} 
        placeholder="Password" 
        value={password}
        onChangeText={setPassword} 
        secureTextEntry
        placeholderTextColor={Colors.textMuted} 
      />

      <TouchableOpacity style={styles.forgotBtn} onPress={() => router.push('/(auth)/forgot-password')}>
        <Text style={styles.forgotTxt}>Forgot password?</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.btn} onPress={handleSignIn} disabled={loading}>
        <Text style={styles.btnTxt}>{loading ? 'Authenticating...' : 'Sign In as Doctor'}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push('/(auth)/signup')}>
        <Text style={styles.link}>New to NovaCare? Register here</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: 24, paddingTop: 60 },
  backBtn: { marginBottom: 20 },
  backTxt: { color: Colors.primary, fontSize: 16, fontWeight: '500' },
  title: { fontSize: 32, fontWeight: '700', color: Colors.text },
  sub: { fontSize: 16, color: Colors.textMuted, marginTop: 6, marginBottom: 32 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 16, fontSize: 15, color: Colors.text, backgroundColor: Colors.card, marginBottom: 14 },
  forgotBtn: { alignSelf: 'flex-end', marginBottom: 20 },
  forgotTxt: { color: Colors.primary, fontSize: 14 },
  btn: { backgroundColor: Colors.primary, borderRadius: 14, padding: 18, alignItems: 'center' },
  btnTxt: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { color: Colors.primary, textAlign: 'center', marginTop: 24, fontSize: 14 },
});
