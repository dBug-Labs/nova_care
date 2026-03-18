import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { registerForPushNotifications, setupNotificationListeners } from '../lib/notifications';

const queryClient = new QueryClient();

export default function RootLayout() {
  const initialize = useAuthStore(s => s.initialize);

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
