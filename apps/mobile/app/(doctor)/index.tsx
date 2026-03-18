import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, TextInput } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import api from '../../lib/api';
import { Colors } from '../../constants/colors';

const RISK_COLORS: Record<string, string> = {
  critical: Colors.danger,
  warning:  Colors.warning,
  watch:    '#F4A430',
  normal:   Colors.success,
  unknown:  Colors.textMuted,
};

const RISK_LABELS: Record<string, string> = {
  critical: '🔴 Critical',
  warning:  '⚠️ Warning',
  watch:    '👁 Watch',
  normal:   '✅ Normal',
  unknown:  '— Unknown',
};

export default function DoctorPatientsScreen() {
  const [search, setSearch] = useState('');

  const { data: patients, isLoading, refetch } = useQuery({
    queryKey: ['doctor-patients'],
    queryFn: () => api.get('/doctors/patients').then((r: any) => r.data),
    refetchInterval: 60000,
  });

  const filtered = patients?.filter((p: any) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.conditions || []).some((c: string) => c.includes(search.toLowerCase()))
  ) || [];

  const criticalCount = patients?.filter((p: any) => p.risk_level === 'critical').length || 0;
  const warningCount  = patients?.filter((p: any) => p.risk_level === 'warning').length || 0;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}>

      <Text style={styles.title}>My Patients</Text>
      <Text style={styles.sub}>{patients?.length || 0} active · {criticalCount} critical · {warningCount} warnings</Text>

      {/* Alert strip */}
      {criticalCount > 0 && (
        <View style={styles.alertStrip}>
          <Text style={styles.alertText}>🔴 {criticalCount} patient{criticalCount > 1 ? 's' : ''} need immediate attention</Text>
        </View>
      )}

      {/* Search */}
      <TextInput style={styles.search} placeholder="Search by name or condition..."
        value={search} onChangeText={setSearch} placeholderTextColor={Colors.textMuted} />

      {/* Patient cards */}
      {filtered.map((patient: any) => (
        <TouchableOpacity
          key={patient.id}
          style={[styles.patientCard, patient.risk_level === 'critical' && styles.criticalCard]}
          onPress={() => router.push(`/(doctor)/patient?id=${patient.id}`)}
        >
          {/* Header row */}
          <View style={styles.cardHeader}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{patient.name?.charAt(0)}</Text>
            </View>
            <View style={styles.nameBlock}>
              <Text style={styles.patientName}>{patient.name}</Text>
              <Text style={styles.patientMeta}>
                {patient.age ? `${patient.age} yrs` : ''}{patient.gender ? ` · ${patient.gender}` : ''}
                {patient.specialty ? ` · ${patient.specialty}` : ''}
              </Text>
            </View>
            <View style={[styles.riskBadge, { backgroundColor: `${RISK_COLORS[patient.risk_level]}20` }]}>
              <Text style={[styles.riskText, { color: RISK_COLORS[patient.risk_level] }]}>
                {RISK_LABELS[patient.risk_level]}
              </Text>
            </View>
            {patient.avg_mood_7d && patient.avg_mood_7d < 3 && (
              <View style={[styles.riskBadge, { backgroundColor: '#FEE2E2', marginLeft: 8 }]}>
                <Text style={[styles.riskText, { color: Colors.danger }]}>🔥 Burnout</Text>
              </View>
            )}
          </View>

          {/* Conditions */}
          {patient.conditions?.length > 0 && (
            <View style={styles.conditionRow}>
              {patient.conditions.slice(0, 3).map((c: string) => (
                <View key={c} style={styles.conditionChip}>
                  <Text style={styles.conditionText}>{c.replace(/_/g, ' ')}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Vitals row */}
          <View style={styles.vitalsRow}>
            {patient.latest_bp && (
              <View style={styles.vitalItem}>
                <Text style={styles.vitalVal}>{patient.latest_bp}</Text>
                <Text style={styles.vitalLabel}>BP</Text>
              </View>
            )}
            {patient.latest_sugar && (
              <View style={styles.vitalItem}>
                <Text style={[styles.vitalVal, patient.latest_sugar > 200 && { color: Colors.danger }]}>
                  {patient.latest_sugar}
                </Text>
                <Text style={styles.vitalLabel}>Sugar</Text>
              </View>
            )}
            {patient.avg_mood_7d && (
              <View style={styles.vitalItem}>
                <Text style={styles.vitalVal}>{patient.avg_mood_7d}/5</Text>
                <Text style={styles.vitalLabel}>Mood</Text>
              </View>
            )}
            {patient.medicine_adherence != null && (
              <View style={styles.vitalItem}>
                <Text style={[styles.vitalVal, patient.medicine_adherence < 70 && { color: Colors.warning }]}>
                  {patient.medicine_adherence}%
                </Text>
                <Text style={styles.vitalLabel}>Adherence</Text>
              </View>
            )}
            {patient.active_flags > 0 && (
              <View style={[styles.vitalItem, styles.flagItem]}>
                <Text style={[styles.vitalVal, { color: Colors.danger }]}>{patient.active_flags}</Text>
                <Text style={styles.vitalLabel}>Flags</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      ))}

      {filtered.length === 0 && !isLoading && (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>👥</Text>
          <Text style={styles.emptyTitle}>No patients yet</Text>
          <Text style={styles.emptyText}>Add patients by their email address to start monitoring.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex:1, backgroundColor: Colors.background },
  container: { padding:20, paddingTop:56, paddingBottom:40 },
  title: { fontSize:26, fontWeight:'700', color:Colors.text },
  sub: { fontSize:12, color:Colors.textMuted, marginTop:3, marginBottom:20 },
  alertStrip: { backgroundColor:'#FEE2E2', borderRadius:12, padding:12, marginBottom:16 },
  alertText: { fontSize:13, color:Colors.danger, fontWeight:'600' },
  search: { backgroundColor:Colors.card, borderRadius:12, borderWidth:1, borderColor:Colors.border, padding:14, fontSize:14, color:Colors.text, marginBottom:16 },
  patientCard: { backgroundColor:Colors.card, borderRadius:16, padding:16, marginBottom:12, borderWidth:1, borderColor:Colors.border },
  criticalCard: { borderColor:Colors.danger, borderWidth:1.5 },
  cardHeader: { flexDirection:'row', alignItems:'center', gap:12, marginBottom:12 },
  avatarCircle: { width:44, height:44, borderRadius:22, backgroundColor:Colors.primary, alignItems:'center', justifyContent:'center' },
  avatarText: { color:'#fff', fontSize:18, fontWeight:'700' },
  nameBlock: { flex:1 },
  patientName: { fontSize:15, fontWeight:'700', color:Colors.text },
  patientMeta: { fontSize:11, color:Colors.textMuted, marginTop:2 },
  riskBadge: { borderRadius:8, paddingHorizontal:10, paddingVertical:5 },
  riskText: { fontSize:11, fontWeight:'700' },
  conditionRow: { flexDirection:'row', flexWrap:'wrap', gap:6, marginBottom:10 },
  conditionChip: { backgroundColor:Colors.background, borderRadius:20, paddingHorizontal:10, paddingVertical:4, borderWidth:1, borderColor:Colors.border },
  conditionText: { fontSize:10, color:Colors.textMuted, textTransform:'capitalize' },
  vitalsRow: { flexDirection:'row', gap:16, flexWrap:'wrap' },
  vitalItem: { alignItems:'center', minWidth:60 },
  vitalVal: { fontSize:16, fontWeight:'700', color:Colors.text },
  vitalLabel: { fontSize:9, color:Colors.textMuted, marginTop:1 },
  flagItem: { backgroundColor:`${Colors.danger}10`, borderRadius:6, padding:6 },
  empty: { alignItems:'center', paddingTop:60 },
  emptyIcon: { fontSize:48, marginBottom:14 },
  emptyTitle: { fontSize:18, fontWeight:'700', color:Colors.text, marginBottom:6 },
  emptyText: { fontSize:13, color:Colors.textMuted, textAlign:'center', lineHeight:20 },
});
