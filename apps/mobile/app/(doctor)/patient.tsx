import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { Colors } from '../../constants/colors';

export default function DoctorPatientDetailScreen() {
  const { id } = useLocalSearchParams();
  const [activeTab, setActiveTab] = useState('Overview');

  const { data, isLoading } = useQuery({
    queryKey: ['doctor-patient', id],
    queryFn: () => api.get(`/doctors/patients/${id}`).then((r: any) => r.data),
  });

  if (isLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!data) return <Text>Error loading patient</Text>;

  const { profile, vitals, wellness, labs, chats, medicines } = data;
  const pName = profile.profiles?.full_name || 'Patient';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backTxt}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{pName}</Text>
      </View>

      <View style={styles.tabScroll}>
        {['Overview', 'Vitals', 'Medicines', 'Labs', 'AI Nurse'].map(tab => (
          <TouchableOpacity 
            key={tab} 
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabTxt, activeTab === tab && styles.tabTxtActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.scroll}>
        {activeTab === 'Overview' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Profile Info</Text>
            {profile.chronic_conditions?.map((c: string) => (
              <Text key={c} style={styles.itemTxt}>• {c}</Text>
            ))}
          </View>
        )}
        
        {activeTab === 'Vitals' && (
          <View style={styles.section}>
            {vitals.map((v: any) => (
              <View key={v.id} style={styles.card}>
                <Text style={styles.cardHeader}>{new Date(v.logged_at).toLocaleDateString()}</Text>
                {v.systolic_bp && <Text>BP: {v.systolic_bp}/{v.diastolic_bp}</Text>}
                {v.blood_sugar_fasting && <Text>Sugar: {v.blood_sugar_fasting}</Text>}
              </View>
            ))}
          </View>
        )}

        {activeTab === 'Medicines' && (
          <View style={styles.section}>
            {medicines.map((m: any, i: number) => (
              <View key={i} style={styles.card}>
                <Text style={styles.cardHeader}>{m.name}</Text>
                <Text>{m.dosage} - {m.frequency}</Text>
              </View>
            ))}
          </View>
        )}

        {activeTab === 'Labs' && (
          <View style={styles.section}>
            {labs.map((l: any, i: number) => (
              <View key={i} style={styles.card}>
                <Text style={styles.cardHeader}>{l.report_type}</Text>
                <Text>{l.overall_status}</Text>
                <Text style={styles.summary}>{l.ai_summary}</Text>
              </View>
            ))}
          </View>
        )}

        {activeTab === 'AI Nurse' && (
          <View style={styles.section}>
            {chats.map((c: any, i: number) => (
              <View key={i} style={styles.card}>
                <Text style={styles.cardHeader}>{new Date(c.started_at).toLocaleDateString()}</Text>
                <Text style={styles.summary}>{c.summary}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingTop: 50 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 15 },
  backBtn: { padding: 5, marginRight: 15 },
  backTxt: { fontSize: 24, color: Colors.primary },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: Colors.text },
  tabScroll: { flexDirection: 'row', paddingHorizontal: 15, marginBottom: 15 },
  tab: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, marginRight: 10, backgroundColor: Colors.card },
  tabActive: { backgroundColor: Colors.primary },
  tabTxt: { color: Colors.textMuted, fontSize: 14, fontWeight: '600' },
  tabTxtActive: { color: '#fff' },
  scroll: { flex: 1, paddingHorizontal: 20 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10, color: Colors.text },
  card: { backgroundColor: Colors.card, padding: 15, borderRadius: 12, marginBottom: 15, borderWidth: 1, borderColor: Colors.border },
  cardHeader: { fontSize: 16, fontWeight: 'bold', marginBottom: 5 },
  summary: { fontSize: 14, color: Colors.textMuted, marginTop: 5 },
  itemTxt: { fontSize: 16, color: Colors.text, marginBottom: 5 },
});
