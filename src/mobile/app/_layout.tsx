import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: '#3B82F6',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'BookMarx' }} />
        <Stack.Screen name="login" options={{ title: 'Login', headerShown: false }} />
        <Stack.Screen name="register" options={{ title: 'Register', headerShown: false }} />
        <Stack.Screen name="folder/[id]" options={{ title: 'Folder' }} />
        <Stack.Screen name="upgrade" options={{ title: 'Upgrade', headerShown: false }} />
        <Stack.Screen name="sessions/index" options={{ title: 'Sync History', headerShown: false }} />
        <Stack.Screen name="sessions/[id]" options={{ title: 'Session Details', headerShown: false }} />
      </Stack>
    </>
  );
}
