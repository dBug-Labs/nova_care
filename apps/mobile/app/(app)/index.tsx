import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import api from '../../lib/api';
import { Colors } from '../../constants/colors';

const MOOD_EMOJIS = ['😞', '😕', '😐', '🙂', '😊'];

export default function HomeScreen() {
  const profile = useAuthStore(s => s.profile);
  const name = profile?.full_name?.split(' ')[0] || 'there';

  const { data: today } = useQuery({
    queryKey: ['today'],
    queryFn: () => api.get('/vitals/today').then((r: any) => r.data),
    refetchInterval: 60000,
  });

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const logMood = async (score: number) => {
    await api.post('/vitals/wellness', { mood_score: score });
    router.push('/(app)/vitals');
  };

  const hasMoodToday = today?.wellness?.mood_score;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      {/* Greeting */}
      <Text style={styles.greeting}>{greeting}, {name} 🌿</Text>
      <Text style={styles.date}>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>

      {/* Mood check-in */}
      {!hasMoodToday ? (
        <View style={styles.moodCard}>
          <Text style={styles.moodTitle}>How are you feeling today?</Text>
          <View style={styles.moodRow}>
            {MOOD_EMOJIS.map((emoji, i) => (
              <TouchableOpacity key={i} style={styles.moodBtn} onPress={() => logMood(i + 1)}>
                <Text style={styles.moodEmoji}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : (
        <View style={styles.moodDoneCard}>
          <Text style={styles.moodDoneText}>Today's mood: {MOOD_EMOJIS[hasMoodToday - 1]} {hasMoodToday}/5</Text>
        </View>
      )}

      {/* Quick stats */}
      <Text style={styles.sectionTitle}>Today's Summary</Text>
      <View style={styles.statsGrid}>
        {[
          { label: 'BP', value: today?.vitals?.systolic_bp ? `${today.vitals.systolic_bp}/${today.vitals.diastolic_bp}` : '—', unit: 'mmHg', icon: '🫀', route: '/(app)/vitals' },
          { label: 'Sugar', value: today?.vitals?.blood_sugar_fasting || '—', unit: 'mg/dL', icon: '🩸', route: '/(app)/vitals' },
          { label: 'Water', value: today?.wellness?.water_ml ? `${today.wellness.water_ml}ml` : '—', unit: '', icon: '💧', route: '/(app)/vitals' },
          { label: 'Medicines', value: today?.medicine_adherence?.pct != null ? `${today.medicine_adherence.pct}%` : '—', unit: 'taken', icon: '💊', route: '/(app)/vitals' },
        ].map(stat => (
          <TouchableOpacity key={stat.label} style={styles.statCard} onPress={() => router.push(stat.route as any)}>
            <Text style={styles.statIcon}>{stat.icon}</Text>
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Quick actions */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.actionsGrid}>
        {[
          { icon: '💬', label: 'Talk to Nova', route: '/(app)/nurse' },
          { icon: '🧪', label: 'Upload Report', route: '/(app)/reports' },
          { icon: '💊', label: 'Log Vitals', route: '/(app)/vitals' },
          { icon: '📊', label: 'Weekly Report', route: '/(app)/reports' },
        ].map(action => (
          <TouchableOpacity key={action.label} style={styles.actionCard} onPress={() => router.push(action.route as any)}>
            <Text style={styles.actionIcon}>{action.icon}</Text>
            <Text style={styles.actionLabel}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* AI daily summary if available */}
      {today?.wellness?.ai_daily_summary && (
        <View style={styles.aiSummaryCard}>
          <Text style={styles.aiSummaryTitle}>Nova's note for you 🌿</Text>
          <Text style={styles.aiSummaryText}>{today.wellness.ai_daily_summary}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.background },
  container: { padding: 20, paddingTop: 56, paddingBottom: 40 },
  greeting: { fontSize: 26, fontWeight: '700', color: Colors.text },
  date: { fontSize: 13, color: Colors.textMuted, marginTop: 4, marginBottom: 24 },
  moodCard: { backgroundColor: Colors.card, borderRadius: 20, padding: 20, marginBottom: 24, borderWidth: 1, borderColor: Colors.border },
  moodTitle: { fontSize: 15, fontWeight: '600', color: Colors.text, marginBottom: 16, textAlign: 'center' },
  moodRow: { flexDirection: 'row', justifyContent: 'space-around' },
  moodBtn: { padding: 8 },
  moodEmoji: { fontSize: 36 },
  moodDoneCard: { backgroundColor: `${Colors.primary}12`, borderRadius: 16, padding: 14, marginBottom: 24, alignItems: 'center' },
  moodDoneText: { fontSize: 14, color: Colors.primary, fontWeight: '600' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, marginBottom: 12 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 28 },
  statCard: { flex: 1, minWidth: '45%', backgroundColor: Colors.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  statIcon: { fontSize: 24, marginBottom: 6 },
  statValue: { fontSize: 20, fontWeight: '700', color: Colors.text },
  statLabel: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  actionCard: { flex: 1, minWidth: '45%', backgroundColor: Colors.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', flexDirection: 'row', gap: 10 },
  actionIcon: { fontSize: 24 },
  actionLabel: { fontSize: 13, fontWeight: '600', color: Colors.text },
  aiSummaryCard: { backgroundColor: `${Colors.primary}10`, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: `${Colors.primary}25` },
  aiSummaryTitle: { fontSize: 13, fontWeight: '700', color: Colors.primary, marginBottom: 8 },
  aiSummaryText: { fontSize: 14, color: Colors.text, lineHeight: 22 },
});
