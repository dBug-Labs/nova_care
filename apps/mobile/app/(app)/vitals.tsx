import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { Colors } from '../../constants/colors';

const VITALS_FIELDS = [
  { key: 'systolic_bp',         label: 'Systolic BP',    unit: 'mmHg', icon: '🫀', keyboardType: 'numeric', normal: '90–120' },
  { key: 'diastolic_bp',        label: 'Diastolic BP',   unit: 'mmHg', icon: '🫀', keyboardType: 'numeric', normal: '60–80' },
  { key: 'blood_sugar_fasting',  label: 'Blood Sugar (Fasting)', unit: 'mg/dL', icon: '🩸', keyboardType: 'decimal-pad', normal: '70–99' },
  { key: 'heart_rate',           label: 'Heart Rate',     unit: 'bpm',  icon: '❤️', keyboardType: 'numeric', normal: '60–100' },
  { key: 'spo2',                 label: 'SpO2',           unit: '%',    icon: '💨', keyboardType: 'numeric', normal: '95–100' },
  { key: 'weight_kg',            label: 'Weight',         unit: 'kg',   icon: '⚖️', keyboardType: 'decimal-pad', normal: '' },
  { key: 'temperature',          label: 'Temperature',    unit: '°F',   icon: '🌡️', keyboardType: 'decimal-pad', normal: '97–99' },
];

export default function VitalsScreen() {
  const [form, setForm] = useState<Record<string, string>>({});
  const qc = useQueryClient();

  const { data: todayData } = useQuery({
    queryKey: ['vitals-today'],
    queryFn: () => api.get('/vitals/today').then((r: any) => r.data),
  });

  const { data: historyData } = useQuery({
    queryKey: ['vitals-history'],
    queryFn: () => api.get('/vitals/history?days=7').then((r: any) => r.data),
  });

  const logMutation = useMutation({
    mutationFn: (data: any) => api.post('/vitals/log', data),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['vitals-today'] });
      qc.invalidateQueries({ queryKey: ['vitals-history'] });
      setForm({});
      const risk = res?.data?.risk_level;
      if (risk === 'critical') {
        Alert.alert('⚠️ Critical Reading', 'Your vitals show a critical value. Please contact your doctor immediately or call 112.');
      } else if (risk === 'warning') {
        Alert.alert('⚠️ Attention Needed', 'Some values are outside normal range. Your doctor has been notified.');
      } else {
        Alert.alert('Logged!', res?.data?.ai_analysis || 'Vitals saved successfully.');
      }
    },
    onError: () => Alert.alert('Error', 'Could not save vitals. Please try again.'),
  });

  const submit = () => {
    const payload: Record<string, number> = {};
    for (const [k, v] of Object.entries(form)) {
      if (v) payload[k] = parseFloat(v);
    }
    if (Object.keys(payload).length === 0) { Alert.alert('Empty', 'Please enter at least one vital.'); return; }
    logMutation.mutate(payload);
  };

  const burnoutAlert = historyData?.burnout_alert;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Daily Vitals</Text>

      {/* Burnout alert banner */}
      {burnoutAlert && (
        <View style={styles.burnoutBanner}>
          <Text style={styles.burnoutText}>🔔 Nova noticed your mood has been low for 3+ days. Your doctor has been notified. Tap the Nurse tab to talk.</Text>
        </View>
      )}

      {/* Today's summary */}
      {todayData?.vitals && (
        <View style={styles.todayCard}>
          <Text style={styles.todayTitle}>Latest Reading</Text>
          <View style={styles.todayGrid}>
            {todayData.vitals.systolic_bp && (
              <View style={styles.todayStat}>
                <Text style={styles.todayStatVal}>{todayData.vitals.systolic_bp}/{todayData.vitals.diastolic_bp}</Text>
                <Text style={styles.todayStatLabel}>BP (mmHg)</Text>
              </View>
            )}
            {todayData.vitals.blood_sugar_fasting && (
              <View style={styles.todayStat}>
                <Text style={[styles.todayStatVal, { color: todayData.vitals.blood_sugar_fasting > 200 ? Colors.danger : Colors.success }]}>
                  {todayData.vitals.blood_sugar_fasting}
                </Text>
                <Text style={styles.todayStatLabel}>Sugar (mg/dL)</Text>
              </View>
            )}
            {todayData.vitals.heart_rate && (
              <View style={styles.todayStat}>
                <Text style={styles.todayStatVal}>{todayData.vitals.heart_rate}</Text>
                <Text style={styles.todayStatLabel}>Heart Rate</Text>
              </View>
            )}
            {todayData.vitals.spo2 && (
              <View style={styles.todayStat}>
                <Text style={[styles.todayStatVal, { color: todayData.vitals.spo2 < 95 ? Colors.danger : Colors.success }]}>
                  {todayData.vitals.spo2}%
                </Text>
                <Text style={styles.todayStatLabel}>SpO2</Text>
              </View>
            )}
          </View>
          {todayData.vitals.ai_analysis && (
            <Text style={styles.aiNote}>💬 {todayData.vitals.ai_analysis}</Text>
          )}
        </View>
      )}

      {/* Medicine adherence strip */}
      {todayData?.medicine_adherence?.total > 0 && (
        <View style={styles.medStrip}>
          <Text style={styles.medStripText}>
            💊 Medicines today: {todayData.medicine_adherence.taken}/{todayData.medicine_adherence.total} taken
            ({todayData.medicine_adherence.pct}%)
          </Text>
        </View>
      )}

      {/* Log form */}
      <Text style={styles.sectionTitle}>Log New Reading</Text>
      {VITALS_FIELDS.map(f => (
        <View key={f.key} style={styles.fieldRow}>
          <View style={styles.fieldLabelRow}>
            <Text style={styles.fieldIcon}>{f.icon}</Text>
            <View>
              <Text style={styles.fieldLabel}>{f.label}</Text>
              {f.normal ? <Text style={styles.fieldNormal}>Normal: {f.normal} {f.unit}</Text> : null}
            </View>
          </View>
          <TextInput
            style={styles.fieldInput}
            placeholder={f.unit}
            placeholderTextColor={Colors.textMuted}
            value={form[f.key] || ''}
            onChangeText={v => setForm(prev => ({ ...prev, [f.key]: v }))}
            keyboardType={f.keyboardType as any}
          />
        </View>
      ))}

      <TouchableOpacity
        style={[styles.submitBtn, logMutation.isPending && styles.submitDisabled]}
        onPress={submit}
        disabled={logMutation.isPending}
      >
        <Text style={styles.submitText}>{logMutation.isPending ? 'Saving...' : 'Save Vitals'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.background },
  container: { padding: 20, paddingTop: 56, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '700', color: Colors.text, marginBottom: 20 },
  burnoutBanner: { backgroundColor: '#FFF3CD', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: Colors.warning },
  burnoutText: { fontSize: 13, color: '#856404', lineHeight: 20 },
  todayCard: { backgroundColor: Colors.card, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: Colors.border },
  todayTitle: { fontSize: 13, fontWeight: '700', color: Colors.textMuted, marginBottom: 12 },
  todayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  todayStat: { minWidth: 80, alignItems: 'center' },
  todayStatVal: { fontSize: 22, fontWeight: '700', color: Colors.primary },
  todayStatLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  aiNote: { fontSize: 12, color: Colors.midTxt, marginTop: 12, lineHeight: 18, fontStyle: 'italic' },
  medStrip: { backgroundColor: `${Colors.primary}12`, borderRadius: 10, padding: 12, marginBottom: 20 },
  medStripText: { fontSize: 13, color: Colors.primary },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, marginBottom: 16 },
  fieldRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.card, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.border },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fieldIcon: { fontSize: 22 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: Colors.text },
  fieldNormal: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  fieldInput: { backgroundColor: Colors.background, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, padding: 10, fontSize: 15, color: Colors.text, width: 100, textAlign: 'right' },
  submitBtn: { backgroundColor: Colors.primary, borderRadius: 14, padding: 18, alignItems: 'center', marginTop: 8 },
  submitDisabled: { opacity: 0.5 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
