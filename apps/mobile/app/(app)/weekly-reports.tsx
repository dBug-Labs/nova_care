import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Linking, ActivityIndicator } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { Colors } from '../../constants/colors';

export default function WeeklyReportsScreen() {
  const qc = useQueryClient();

  const { data: reports, isLoading } = useQuery({
    queryKey: ['weekly-reports'],
    queryFn: () => api.get('/reports-export/weekly').then((r: any) => r.data),
  });

  const generateMutation = useMutation({
    mutationFn: () => api.post('/reports-export/generate-weekly', {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['weekly-reports'] });
      Alert.alert('Generating!', 'Your weekly report is being prepared. It will appear here in a moment.');
    },
  });

  const shareMutation = useMutation({
    mutationFn: (id: string) => api.post(`/reports-export/weekly/${id}/share-with-doctor`, {}),
    onSuccess: () => Alert.alert('Shared!', 'Your report has been shared with your doctor.'),
  });

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Weekly Reports</Text>
          <Text style={styles.sub}>Your health journey, summarized every week</Text>
        </View>
        <TouchableOpacity style={styles.genBtn} onPress={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
          <Text style={styles.genBtnText}>{generateMutation.isPending ? '...' : '+ Generate'}</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
      ) : reports?.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📊</Text>
          <Text style={styles.emptyTitle}>No reports yet</Text>
          <Text style={styles.emptyText}>Generate your first weekly health report — Nova will analyze your entire week and give you personalized insights.</Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={() => generateMutation.mutate()}>
            <Text style={styles.emptyBtnText}>Generate This Week's Report</Text>
          </TouchableOpacity>
        </View>
      ) : (
        reports?.map((report: any) => {
          const ws = new Date(report.week_start);
          const we = new Date(report.week_end);
          const weekLabel = `${ws.toLocaleDateString('en-IN', {day:'numeric',month:'short'})} – ${we.toLocaleDateString('en-IN', {day:'numeric',month:'short',year:'numeric'})}`;

          return (
            <View key={report.id} style={styles.reportCard}>
              {/* Week label */}
              <View style={styles.reportHeaderRow}>
                <View>
                  <Text style={styles.weekLabel}>{weekLabel}</Text>
                  {report.generated_at && (
                    <Text style={styles.genDate}>Generated {new Date(report.generated_at).toLocaleDateString('en-IN')}</Text>
                  )}
                </View>
                {report.shared_with_doctor && (
                  <View style={styles.sharedBadge}><Text style={styles.sharedText}>Shared ✓</Text></View>
                )}
              </View>

              {/* Stats row */}
              {report.avg_mood_score && (
                <View style={styles.statsRow}>
                  {[
                    { label:'Mood', val:`${report.avg_mood_score}/5` },
                    { label:'Sleep', val:`${report.avg_sleep_hours}h` },
                    { label:'Water', val:`${report.avg_water_ml}ml` },
                    { label:'Medicines', val:`${report.medicine_adherence_pct}%` },
                  ].map(s => (
                    <View key={s.label} style={styles.statItem}>
                      <Text style={styles.statVal}>{s.val}</Text>
                      <Text style={styles.statLabel}>{s.label}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* AI Narrative */}
              {report.ai_narrative && (
                <View style={styles.narrativeBox}>
                  <Text style={styles.narrativeLabel}>Nova's Summary</Text>
                  <Text style={styles.narrativeText}>{report.ai_narrative}</Text>
                </View>
              )}

              {/* Highlights */}
              {report.highlights?.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>✅ What Went Well</Text>
                  {report.highlights.map((h: string, i: number) => (
                    <Text key={i} style={styles.bullet}>• {h}</Text>
                  ))}
                </View>
              )}

              {/* Goals */}
              {report.goals_next_week?.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>🎯 Goals for Next Week</Text>
                  {report.goals_next_week.map((g: any, i: number) => (
                    <Text key={i} style={styles.bullet}>• {g.goal || g}</Text>
                  ))}
                </View>
              )}

              {/* Actions */}
              <View style={styles.actionRow}>
                {report.pdf_url && (
                  <TouchableOpacity style={styles.pdfBtn} onPress={() => Linking.openURL(report.pdf_url)}>
                    <Text style={styles.pdfBtnText}>📄 Download PDF</Text>
                  </TouchableOpacity>
                )}
                {!report.shared_with_doctor && (
                  <TouchableOpacity style={styles.shareBtn} onPress={() => shareMutation.mutate(report.id)}>
                    <Text style={styles.shareBtnText}>Share with Doctor</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex:1, backgroundColor:Colors.background },
  container: { padding:20, paddingTop:56, paddingBottom:48 },
  headerRow: { flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24 },
  title: { fontSize:26, fontWeight:'700', color:Colors.text },
  sub: { fontSize:12, color:Colors.textMuted, marginTop:3 },
  genBtn: { backgroundColor:Colors.primary, borderRadius:10, paddingHorizontal:16, paddingVertical:10 },
  genBtnText: { color:'#fff', fontSize:14, fontWeight:'600' },
  empty: { alignItems:'center', paddingTop:60 },
  emptyIcon: { fontSize:52, marginBottom:16 },
  emptyTitle: { fontSize:20, fontWeight:'700', color:Colors.text, marginBottom:8 },
  emptyText: { fontSize:14, color:Colors.textMuted, textAlign:'center', lineHeight:22, marginBottom:24, paddingHorizontal:20 },
  emptyBtn: { backgroundColor:Colors.primary, borderRadius:14, paddingHorizontal:24, paddingVertical:14 },
  emptyBtnText: { color:'#fff', fontSize:14, fontWeight:'700' },
  reportCard: { backgroundColor:Colors.card, borderRadius:18, padding:18, marginBottom:18, borderWidth:1, borderColor:Colors.border },
  reportHeaderRow: { flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 },
  weekLabel: { fontSize:16, fontWeight:'700', color:Colors.text },
  genDate: { fontSize:11, color:Colors.textMuted, marginTop:2 },
  sharedBadge: { backgroundColor:`${Colors.success}20`, borderRadius:8, paddingHorizontal:10, paddingVertical:4 },
  sharedText: { fontSize:11, color:Colors.success, fontWeight:'700' },
  statsRow: { flexDirection:'row', justifyContent:'space-around', backgroundColor:`${Colors.primary}08`, borderRadius:12, padding:14, marginBottom:16 },
  statItem: { alignItems:'center' },
  statVal: { fontSize:18, fontWeight:'700', color:Colors.primary },
  statLabel: { fontSize:10, color:Colors.textMuted, marginTop:2 },
  narrativeBox: { backgroundColor:`${Colors.primary}10`, borderRadius:12, padding:14, marginBottom:14 },
  narrativeLabel: { fontSize:12, fontWeight:'700', color:Colors.primary, marginBottom:6 },
  narrativeText: { fontSize:13, color:Colors.text, lineHeight:20 },
  section: { marginBottom:12 },
  sectionTitle: { fontSize:13, fontWeight:'700', color:Colors.text, marginBottom:6 },
  bullet: { fontSize:13, color:Colors.textMuted, lineHeight:22 },
  actionRow: { flexDirection:'row', gap:10, marginTop:14 },
  pdfBtn: { flex:1, backgroundColor:Colors.background, borderRadius:10, borderWidth:1, borderColor:Colors.border, padding:12, alignItems:'center' },
  pdfBtnText: { fontSize:13, color:Colors.text, fontWeight:'600' },
  shareBtn: { flex:1, backgroundColor:`${Colors.primary}15`, borderRadius:10, borderWidth:1, borderColor:`${Colors.primary}40`, padding:12, alignItems:'center' },
  shareBtnText: { fontSize:13, color:Colors.primary, fontWeight:'600' },
});
