import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';

export default function WelcomeScreen() {
  return (
    <View style={styles.container}>
      {/* Logo */}
      <View style={styles.logoArea}>
        <Text style={styles.appName}>NovaCare</Text>
        <Text style={styles.tagline}>Your AI Health Companion</Text>
      </View>

      {/* Illustration placeholder */}
      <View style={styles.illustrationBox} />

      {/* CTA */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => router.push('/(auth)/signup')}
        >
          <Text style={styles.primaryBtnText}>Get Started</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => router.push('/(auth)/signin')}
        >
          <Text style={styles.secondaryBtnText}>Already have an account</Text>
        </TouchableOpacity>

        <View style={styles.doctorSection}>
          <Text style={styles.doctorLabel}>Are you a healthcare professional?</Text>
          <View style={styles.doctorButtons}>
            <TouchableOpacity onPress={() => router.push('/(auth)/doctor-signin')}>
              <Text style={styles.doctorLinkText}>Doctor Sign In</Text>
            </TouchableOpacity>
            <Text style={styles.divider}>|</Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/signup')}>
              <Text style={styles.doctorLinkText}>Register as Doctor</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <Text style={styles.disclaimer}>
        NovaCare is a health monitoring tool, not a substitute for medical advice.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: 24, justifyContent: 'space-between' },
  logoArea: { alignItems: 'center', marginTop: 60 },
  appName: { fontSize: 42, fontWeight: '700', color: Colors.primary },
  tagline: { fontSize: 16, color: Colors.textMuted, marginTop: 8 },
  illustrationBox: { height: 220, backgroundColor: Colors.border, borderRadius: 20, marginVertical: 24 },
  actions: { gap: 12, marginBottom: 16 },
  primaryBtn: { backgroundColor: Colors.primary, borderRadius: 14, padding: 18, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryBtn: { borderWidth: 1.5, borderColor: Colors.primary, borderRadius: 14, padding: 18, alignItems: 'center' },
  secondaryBtnText: { color: Colors.primary, fontSize: 16, fontWeight: '600' },
  disclaimer: { fontSize: 10, color: Colors.textMuted, textAlign: 'center', marginBottom: 8 },
  doctorSection: { marginTop: 24, padding: 16, backgroundColor: `${Colors.primary}08`, borderRadius: 16, borderWidth: 1, borderColor: `${Colors.primary}15` },
  doctorLabel: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', marginBottom: 10, fontWeight: '500' },
  doctorButtons: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 15 },
  doctorLinkText: { color: Colors.primary, fontSize: 15, fontWeight: '700', textDecorationLine: 'underline' },
  divider: { color: Colors.border, fontSize: 16 },
});
