import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';

export default function VitalsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Vitals ❤️</Text>
      <Text style={styles.sub}>Track your daily health metrics</Text>
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>Vitals tracking will be available in Phase 3</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: 20, paddingTop: 56 },
  title: { fontSize: 24, fontWeight: '700', color: Colors.text },
  sub: { fontSize: 14, color: Colors.textMuted, marginTop: 4, marginBottom: 24 },
  placeholder: { flex: 1, backgroundColor: Colors.card, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  placeholderText: { color: Colors.textMuted, fontSize: 14 },
});
