import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { Colors } from '../../constants/colors';

export default function AppLayout() {
  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: Colors.primary,
      tabBarInactiveTintColor: Colors.textMuted,
      tabBarStyle: { backgroundColor: '#fff', borderTopColor: Colors.border, height: 60 },
      headerShown: false,
    }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🏠</Text> }} />
      <Tabs.Screen name="nurse" options={{ title: 'Nurse', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>💬</Text> }} />
      <Tabs.Screen name="vitals" options={{ title: 'Vitals', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>❤️</Text> }} />
      <Tabs.Screen name="medicines" options={{ title: 'Medicines', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>💊</Text> }} />
      <Tabs.Screen name="weekly-reports" options={{ title: 'Reports', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>📊</Text> }} />
      <Tabs.Screen name="reports" options={{ title: 'Reports', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>📋</Text> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>👤</Text> }} />
    </Tabs>
  );
}
