import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { Colors } from '../../constants/colors';

export default function DoctorAlertsScreen() {
  const { data: patients } = useQuery({
    queryKey: ['doctor-patients'],
    queryFn: () => api.get('/doctors/patients').then((r: any) => r.data),
    refetchInterval: 30000,
  });

  const critical = (patients || []).filter((p: any) => p.risk_level === 'critical');
  const warnings = (patients || []).filter((p: any) => p.risk_level === 'warning');

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Alerts</Text>

      {critical.length > 0 && (
        <View>
          <Text style={styles.sectionTitle}>🔴 Critical ({critical.length})</Text>
          {critical.map((p: any) => (
            <View key={p.id} style={[styles.card, styles.criticalCard]}>
              <Text style={styles.patName}>{p.name}</Text>
              <Text style={styles.patMeta}>BP: {p.latest_bp || '—'} · Sugar: {p.latest_sugar || '—'}</Text>
              <Text style={styles.patCond}>{p.conditions?.join(', ')}</Text>
            </View>
          ))}
        </View>
      )}

      {warnings.length > 0 && (
        <View>
          <Text style={styles.sectionTitle}>⚠️ Warnings ({warnings.length})</Text>
          {warnings.map((p: any) => (
            <View key={p.id} style={[styles.card, styles.warningCard]}>
              <Text style={styles.patName}>{p.name}</Text>
              <Text style={styles.patMeta}>BP: {p.latest_bp || '—'} · Sugar: {p.latest_sugar || '—'}</Text>
            </View>
          ))}
        </View>
      )}

      {critical.length === 0 && warnings.length === 0 && (
        <View style={styles.allGood}>
          <Text style={styles.allGoodIcon}>✅</Text>
          <Text style={styles.allGoodText}>All patients are stable</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:       { flex: 1, backgroundColor: Colors.background },
  container:    { padding: 20, paddingTop: 56 },
  title:        { fontSize: 26, fontWeight: '700', color: Colors.text, marginBottom: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 10 },
  card:         { borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1.5 },
  criticalCard: { backgroundColor: '#FEF2F2', borderColor: Colors.danger },
  warningCard:  { backgroundColor: '#FFFBF0', borderColor: Colors.warning },
  patName:      { fontSize: 15, fontWeight: '700', color: Colors.text },
  patMeta:      { fontSize: 13, color: Colors.textMuted, marginTop: 4 },
  patCond:      { fontSize: 12, color: Colors.textMuted, marginTop: 2, textTransform: 'capitalize' },
  allGood:      { alignItems: 'center', paddingTop: 80 },
  allGoodIcon:  { fontSize: 48, marginBottom: 14 },
  allGoodText:  { fontSize: 16, color: Colors.textMuted },
});
