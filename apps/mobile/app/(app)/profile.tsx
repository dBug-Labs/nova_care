import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { useAuthStore } from '../../store/authStore';
import { Colors } from '../../constants/colors';
import { router } from 'expo-router';

export default function ProfileScreen() {
  const profile = useAuthStore(s => s.profile);
  const signOut = useAuthStore(s => s.signOut);

  const handleSignOut = async () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => {
          await signOut();
          router.replace('/(auth)/welcome');
        }
      },
    ]);
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <View style={styles.avatarCircle}>
        <Text style={styles.avatarText}>
          {profile?.full_name?.charAt(0)?.toUpperCase() || '?'}
        </Text>
      </View>
      <Text style={styles.name}>{profile?.full_name || 'Your Name'}</Text>
      <Text style={styles.role}>{profile?.role === 'doctor' ? '👨‍⚕️ Doctor' : '🧑 Patient'}</Text>

      <View style={styles.infoCard}>
        {[
          { label: 'Email',       value: profile?.email || '—' },
          { label: 'Phone',       value: profile?.phone || '—' },
          { label: 'Blood Group', value: profile?.patient_profiles?.blood_group || '—' },
          { label: 'BMI',         value: profile?.patient_profiles?.bmi?.toString() || '—' },
        ].map(item => (
          <View key={item.label} style={styles.infoRow}>
            <Text style={styles.infoLabel}>{item.label}</Text>
            <Text style={styles.infoValue}>{item.value}</Text>
          </View>
        ))}
      </View>

      <View style={styles.condCard}>
        <Text style={styles.condTitle}>Chronic Conditions</Text>
        {(profile?.patient_profiles?.chronic_conditions || []).length > 0
          ? (profile.patient_profiles.chronic_conditions as string[]).map((c: string) => (
              <Text key={c} style={styles.condItem}>• {c.replace(/_/g, ' ')}</Text>
            ))
          : <Text style={styles.condItem}>None recorded</Text>
        }
      </View>

      <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:      { flex: 1, backgroundColor: Colors.background },
  container:   { padding: 20, paddingTop: 56, alignItems: 'center' },
  avatarCircle:{ width: 88, height: 88, borderRadius: 44, backgroundColor: Colors.primary,
                 alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  avatarText:  { color: '#fff', fontSize: 36, fontWeight: '700' },
  name:        { fontSize: 22, fontWeight: '700', color: Colors.text },
  role:        { fontSize: 14, color: Colors.textMuted, marginTop: 4, marginBottom: 24 },
  infoCard:    { width: '100%', backgroundColor: Colors.card, borderRadius: 16,
                 borderWidth: 1, borderColor: Colors.border, marginBottom: 16 },
  infoRow:     { flexDirection: 'row', justifyContent: 'space-between', padding: 16,
                 borderBottomWidth: 1, borderBottomColor: Colors.border },
  infoLabel:   { fontSize: 13, color: Colors.textMuted },
  infoValue:   { fontSize: 13, color: Colors.text, fontWeight: '600' },
  condCard:    { width: '100%', backgroundColor: Colors.card, borderRadius: 16,
                 padding: 16, borderWidth: 1, borderColor: Colors.border, marginBottom: 24 },
  condTitle:   { fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 10 },
  condItem:    { fontSize: 13, color: Colors.textMuted, textTransform: 'capitalize', marginBottom: 4 },
  signOutBtn:  { backgroundColor: `${Colors.danger}15`, borderRadius: 14, padding: 16,
                 width: '100%', alignItems: 'center', borderWidth: 1, borderColor: Colors.danger },
  signOutText: { color: Colors.danger, fontSize: 15, fontWeight: '700' },
});
