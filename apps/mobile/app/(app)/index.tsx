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
