import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { Colors } from '../../constants/colors';

const FLAG_COLORS: Record<string, string> = {
  normal: Colors.success, high: Colors.accent,
  low: Colors.warning, critical: Colors.danger, unknown: Colors.textMuted,
};

export default function ReportDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: report, isLoading } = useQuery({
    queryKey: ['lab-report', id],
    queryFn: () => api.get(`/labs/${id}`).then((r: any) => r.data),
  });

  if (isLoading) return <ActivityIndicator style={{ flex: 1 }} color={Colors.primary} />;
  if (!report) return <Text>Report not found</Text>;

  const flags: any[] = report.ai_flags || [];

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      {/* Summary card */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Nova's Analysis</Text>
        <Text style={styles.summaryText}>{report.ai_summary || 'Analysis in progress...'}</Text>
      </View>

      {/* Flagged values */}
      {flags.length > 0 && (
        <View>
          <Text style={styles.sectionTitle}>Values to Note</Text>
          {flags.map((flag: any, i: number) => (
            <View key={i} style={styles.flagCard}>
              <View style={styles.flagHeader}>
                <Text style={styles.flagParam}>{flag.parameter}</Text>
                <View style={[styles.flagBadge, { backgroundColor: `${FLAG_COLORS[flag.status] || Colors.textMuted}20` }]}>
                  <Text style={[styles.flagStatus, { color: FLAG_COLORS[flag.status] || Colors.textMuted }]}>
                    {flag.status?.toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text style={styles.flagValue}>{flag.value}</Text>
              <Text style={styles.flagExplanation}>{flag.explanation}</Text>
              {flag.suggestion && (
                <View style={styles.suggestionBox}>
                  <Text style={styles.suggestionText}>💡 {flag.suggestion}</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Parsed values table */}
      {report.parsed_values && Object.keys(report.parsed_values).length > 0 && (
        <View>
          <Text style={styles.sectionTitle}>All Values</Text>
          <View style={styles.valuesTable}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 2 }]}>Parameter</Text>
              <Text style={[styles.tableCell, styles.tableHeaderText]}>Value</Text>
              <Text style={[styles.tableCell, styles.tableHeaderText]}>Normal Range</Text>
              <Text style={[styles.tableCell, styles.tableHeaderText]}>Status</Text>
            </View>
            {Object.entries(report.parsed_values).map(([key, val]: any) => (
              <View key={key} style={styles.tableRow}>
                <Text style={[styles.tableCell, { flex: 2, textTransform: 'capitalize' }]}>
                  {key.replace(/_/g, ' ')}
                </Text>
                <Text style={styles.tableCell}>{val.value} {val.unit}</Text>
                <Text style={styles.tableCell}>{val.normal_range}</Text>
                <Text style={[styles.tableCell, { color: FLAG_COLORS[val.status] || Colors.text, fontWeight: '600' }]}>
                  {val.status}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.background },
  container: { padding: 20, paddingTop: 32, paddingBottom: 48 },
  summaryCard: { backgroundColor: `${Colors.primary}12`, borderRadius: 16, padding: 20, marginBottom: 24, borderWidth: 1, borderColor: `${Colors.primary}30` },
  summaryTitle: { fontSize: 14, fontWeight: '700', color: Colors.primary, marginBottom: 10 },
  summaryText: { fontSize: 14, color: Colors.text, lineHeight: 22 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, marginBottom: 12 },
  flagCard: { backgroundColor: Colors.card, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.border },
  flagHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  flagParam: { fontSize: 14, fontWeight: '700', color: Colors.text, textTransform: 'capitalize' },
  flagBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  flagStatus: { fontSize: 11, fontWeight: '700' },
  flagValue: { fontSize: 18, fontWeight: '700', color: Colors.primary, marginBottom: 6 },
  flagExplanation: { fontSize: 13, color: Colors.textMuted, lineHeight: 20 },
  suggestionBox: { backgroundColor: `${Colors.gold}15`, borderRadius: 8, padding: 10, marginTop: 8 },
  suggestionText: { fontSize: 12, color: Colors.text, lineHeight: 18 },
  valuesTable: { backgroundColor: Colors.card, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  tableHeader: { flexDirection: 'row', backgroundColor: Colors.primary, padding: 12 },
  tableHeaderText: { color: '#fff', fontWeight: '700', fontSize: 11 },
  tableRow: { flexDirection: 'row', padding: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  tableCell: { flex: 1, fontSize: 11, color: Colors.text },
});
