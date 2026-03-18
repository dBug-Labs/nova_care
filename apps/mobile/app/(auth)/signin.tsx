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
