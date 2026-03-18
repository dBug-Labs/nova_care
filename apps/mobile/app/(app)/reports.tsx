import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, RefreshControl
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { Colors } from '../../constants/colors';
import { router } from 'expo-router';

const STATUS_COLORS: Record<string, string> = {
  normal:     Colors.success,
  borderline: Colors.warning,
  abnormal:   Colors.accent,
  critical:   Colors.danger,
  pending:    Colors.textMuted,
};

const STATUS_LABELS: Record<string, string> = {
  normal: '✓ Normal', borderline: '⚠ Borderline',
  abnormal: '⚠ Abnormal', critical: '🔴 Critical', pending: '⏳ Analyzing...',
};

const REPORT_TYPES = [
  { key: 'blood_test',  label: 'Blood Test'    },
  { key: 'urine',       label: 'Urine Test'    },
  { key: 'xray',        label: 'X-Ray'         },
  { key: 'ecg',         label: 'ECG'           },
  { key: 'mri',         label: 'MRI / CT Scan' },
  { key: 'other',       label: 'Other'         },
];

export default function ReportsScreen() {
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [selectedType, setSelectedType] = useState('blood_test');
  const queryClient = useQueryClient();

  const { data: reports, isLoading, refetch } = useQuery({
    queryKey: ['lab-reports'],
    queryFn: () => api.get('/labs/').then((r: any) => r.data),
  });

  const uploadFile = async (uri: string, mimeType: string, fileName: string) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', { uri, type: mimeType, name: fileName } as any);
      formData.append('report_type', selectedType);
      formData.append('report_date', new Date().toISOString().split('T')[0]);

      await api.post('/labs/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      queryClient.invalidateQueries({ queryKey: ['lab-reports'] });
      setShowUpload(false);
      Alert.alert('Uploaded!', 'Your report is being analyzed by Nova. Check back in a moment.');
    } catch (err: any) {
      Alert.alert('Upload Failed', err.message || 'Something went wrong');
    } finally {
      setUploading(false);
    }
  };

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf' });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      await uploadFile(asset.uri, 'application/pdf', asset.name);
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow photo library access'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const ext = asset.uri.split('.').pop() || 'jpg';
      await uploadFile(asset.uri, `image/${ext}`, `report.${ext}`);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow camera access'); return; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.9 });
    if (!result.canceled && result.assets[0]) {
      await uploadFile(result.assets[0].uri, 'image/jpeg', 'lab_photo.jpg');
    }
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Lab Reports</Text>
          <Text style={styles.sub}>Upload and AI-analyze your reports</Text>
        </View>
        <TouchableOpacity style={styles.uploadBtn} onPress={() => setShowUpload(true)}>
          <Text style={styles.uploadBtnText}>+ Upload</Text>
        </TouchableOpacity>
      </View>

      {/* Upload Panel */}
      {showUpload && (
        <View style={styles.uploadPanel}>
          <Text style={styles.panelTitle}>Report Type</Text>
          <View style={styles.typeGrid}>
            {REPORT_TYPES.map(t => (
              <TouchableOpacity
                key={t.key}
                style={[styles.typeBtn, selectedType === t.key && styles.typeBtnActive]}
                onPress={() => setSelectedType(t.key)}
              >
                <Text style={[styles.typeBtnText, selectedType === t.key && styles.typeBtnTextActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.panelTitle}>Choose Source</Text>
          <View style={styles.sourceRow}>
            {[
              { label: '📄 PDF', action: pickDocument },
              { label: '🖼️ Gallery', action: pickImage },
              { label: '📷 Camera', action: takePhoto },
            ].map(src => (
              <TouchableOpacity key={src.label} style={styles.sourceBtn} onPress={src.action} disabled={uploading}>
                <Text style={styles.sourceBtnText}>{src.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {uploading && (
            <View style={styles.uploadingRow}>
              <ActivityIndicator color={Colors.primary} />
              <Text style={styles.uploadingText}>Uploading and analyzing with AI...</Text>
            </View>
          )}

          <TouchableOpacity onPress={() => setShowUpload(false)}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Reports List */}
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
      ) : reports?.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🧪</Text>
          <Text style={styles.emptyTitle}>No reports yet</Text>
          <Text style={styles.emptyText}>Upload your blood test, X-ray, or any lab report and Nova will analyze it for you.</Text>
        </View>
      ) : (
        reports?.map((report: any) => (
          <TouchableOpacity
            key={report.id}
            style={styles.reportCard}
            onPress={() => router.push(`/(app)/report-detail?id=${report.id}`)}
          >
            <View style={styles.reportHeader}>
              <View style={styles.reportLeft}>
                <Text style={styles.reportIcon}>🧪</Text>
                <View>
                  <Text style={styles.reportName}>{report.file_name}</Text>
                  <Text style={styles.reportType}>{REPORT_TYPES.find(t => t.key === report.report_type)?.label || report.report_type}</Text>
                </View>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: `${STATUS_COLORS[report.overall_status]}20` }]}>
                <Text style={[styles.statusText, { color: STATUS_COLORS[report.overall_status] }]}>
                  {STATUS_LABELS[report.overall_status]}
                </Text>
              </View>
            </View>
            {report.ai_summary && (
              <Text style={styles.reportSummary} numberOfLines={2}>{report.ai_summary}</Text>
            )}
            <Text style={styles.reportDate}>
              {new Date(report.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.background },
  container: { padding: 20, paddingTop: 56 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  title: { fontSize: 26, fontWeight: '700', color: Colors.text },
  sub: { fontSize: 13, color: Colors.textMuted, marginTop: 3 },
  uploadBtn: { backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  uploadBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  uploadPanel: { backgroundColor: Colors.card, borderRadius: 16, padding: 20, marginBottom: 24, borderWidth: 1, borderColor: Colors.border },
  panelTitle: { fontSize: 13, fontWeight: '600', color: Colors.textMuted, marginBottom: 10, marginTop: 8 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  typeBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background },
  typeBtnActive: { borderColor: Colors.primary, backgroundColor: `${Colors.primary}15` },
  typeBtnText: { fontSize: 12, color: Colors.textMuted },
  typeBtnTextActive: { color: Colors.primary, fontWeight: '600' },
  sourceRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  sourceBtn: { flex: 1, backgroundColor: Colors.background, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 14, alignItems: 'center' },
  sourceBtnText: { fontSize: 13, color: Colors.text, fontWeight: '500' },
  uploadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  uploadingText: { fontSize: 13, color: Colors.textMuted },
  cancelText: { color: Colors.textMuted, textAlign: 'center', marginTop: 16, fontSize: 13 },
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 52, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 22, paddingHorizontal: 20 },
  reportCard: { backgroundColor: Colors.card, borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: Colors.border },
  reportHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  reportLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  reportIcon: { fontSize: 28 },
  reportName: { fontSize: 14, fontWeight: '600', color: Colors.text },
  reportType: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  statusText: { fontSize: 11, fontWeight: '700' },
  reportSummary: { fontSize: 13, color: Colors.textMuted, lineHeight: 20, marginBottom: 8 },
  reportDate: { fontSize: 11, color: Colors.textMuted },
});
