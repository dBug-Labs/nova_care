import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAuthStore } from '../../store/authStore';
import { Colors } from '../../constants/colors';

export default function ProfileScreen() {
  const profile = useAuthStore(s => s.profile);
  const signOut = useAuthStore(s => s.signOut);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile 👤</Text>

      <View style={styles.card}>
        <Text style={styles.name}>{profile?.full_name || 'User'}</Text>
        <Text style={styles.role}>{profile?.role === 'doctor' ? '🩺 Doctor' : '🧑‍⚕️ Patient'}</Text>
      </View>

      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>Profile editing coming soon</Text>
      </View>

      <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
        <Text style={styles.signOutTxt}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: 20, paddingTop: 56 },
  title: { fontSize: 24, fontWeight: '700', color: Colors.text, marginBottom: 20 },
  card: { backgroundColor: Colors.card, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: Colors.border, marginBottom: 16 },
  name: { fontSize: 20, fontWeight: '700', color: Colors.text },
  role: { fontSize: 14, color: Colors.textMuted, marginTop: 4 },
  placeholder: { flex: 1, backgroundColor: Colors.card, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  placeholderText: { color: Colors.textMuted, fontSize: 14 },
  signOutBtn: { backgroundColor: Colors.danger, borderRadius: 14, padding: 18, alignItems: 'center', marginTop: 16 },
  signOutTxt: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
