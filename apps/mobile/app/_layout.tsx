import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { registerForPushNotifications, setupNotificationListeners } from '../lib/notifications';

const queryClient = new QueryClient();

export default function RootLayout() {
  const initialize = useAuthStore(s => s.initialize);
  const profile = useAuthStore(s => s.profile);
  const loading = useAuthStore(s => s.loading);

  useEffect(() => {
    if (!loading) {
      if (!profile) router.replace('/(auth)/welcome');
      else if (!profile.onboarding_complete) {
        router.replace(profile.role === 'patient' ? '/(onboarding)/patient' : '/(onboarding)/doctor');
      } else {
        router.replace(profile.role === 'doctor' ? '/(doctor)' : '/(app)');
      }
    }
  }, [profile, loading]);

  useEffect(() => {
    // Bootstrap auth session on app launch
    initialize();
    // Register for push notifications
    registerForPushNotifications();
    const cleanup = setupNotificationListeners();
    return cleanup;
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(app)" />
      </Stack>
    </QueryClientProvider>
  );
}
