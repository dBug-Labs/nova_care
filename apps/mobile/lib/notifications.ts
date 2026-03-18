import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import api from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  const token = (await Notifications.getExpoPushTokenAsync()).data;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  // Save token to backend
  try { await api.post(`/reminders/push-token?token=${token}`); } catch {}

  return token;
}

export function setupNotificationListeners() {
  // Foreground notification handler
  const sub1 = Notifications.addNotificationReceivedListener(notification => {
    console.log('Notification received:', notification);
  });

  // Tap handler
  const sub2 = Notifications.addNotificationResponseReceivedListener(response => {
    const data = response.notification.request.content.data;
    // Navigate based on notification type
    if (data?.type === 'medicine') {
      // router.push('/(app)/medicines');
    }
  });

  return () => { sub1.remove(); sub2.remove(); };
}
