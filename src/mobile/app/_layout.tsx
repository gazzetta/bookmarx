import { useEffect } from 'react';
import { AppState, View, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import {
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
} from '@expo-google-fonts/outfit';
import {
  Fraunces_500Medium_Italic,
  Fraunces_600SemiBold,
  Fraunces_700Bold,
} from '@expo-google-fonts/fraunces';
import NetInfo from '@react-native-community/netinfo';
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
import { useAuthStore } from '../store/authStore';
import { useSyncQueue } from '../store/syncQueue';
import { AccessGate } from '../components/AccessGate';
import { Atmosphere } from '../components/Atmosphere';
import { LogoMark } from '../components/ui';
import { destinationFor } from '../services/access';
import { colors, fonts } from '../constants/theme';

/** Routes to /share when an incoming share intent arrives. The share screen
 * applies the access gate itself so a blocked account sees why it can't save
 * while the pending intent is kept alive. */
function ShareIntentWatcher() {
  const { hasShareIntent } = useShareIntentContext();
  const router = useRouter();
  useEffect(() => {
    if (hasShareIntent) router.push('/share');
  }, [hasShareIntent]);
  return null;
}

export default function RootLayout() {
  const router = useRouter();
  const [fontsLoaded, fontError] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
    Fraunces_500Medium_Italic,
    Fraunces_600SemiBold,
    Fraunces_700Bold,
  });

  useEffect(() => {
    void useAuthStore.getState().checkAuth();

    // Treat "unknown" connectivity as online — only definite disconnects pause sync.
    const unsubscribe = NetInfo.addEventListener((state) => {
      useSyncQueue.getState().setOnline(state.isConnected !== false && state.isInternetReachable !== false);
    });
    const foreground = AppState.addEventListener('change', state => {
      if (state === 'active' && useAuthStore.getState().isAuthenticated) {
        // Revalidate eligibility before the durable queue may transmit.
        void useAuthStore.getState().refreshStats()
          .then(() => useSyncQueue.getState().replay())
          .catch(console.error);
      }
    });
    return () => { unsubscribe(); foreground.remove(); };
  }, []);

  if (!fontsLoaded && !fontError) {
    return (
      <View style={styles.boot}>
        <Atmosphere />
        <LogoMark size={64} />
      </View>
    );
  }

  return (
    <ShareIntentProvider
      options={{
        resetOnBackground: true,
        onResetShareIntent: () => router.replace(destinationFor(useAuthStore.getState().access) ?? '/'),
      }}
    >
      <ShareIntentWatcher />
      <AccessGate />
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.cream },
          headerTintColor: colors.ink,
          headerTitleStyle: { fontFamily: fonts.display, fontSize: 19 },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Screen name="index" options={{ title: 'BookMarx', headerShown: false }} />
        <Stack.Screen name="login" options={{ title: 'Sign in', headerShown: false }} />
        <Stack.Screen name="register" options={{ title: 'Register', headerShown: false }} />
        <Stack.Screen name="verify-email" options={{ title: 'Verify email', headerShown: false }} />
        <Stack.Screen name="membership" options={{ title: 'Membership', headerShown: false }} />
        <Stack.Screen name="forgot-password" options={{ title: 'Forgot password', headerShown: false }} />
        <Stack.Screen name="reset-password" options={{ title: 'Reset password', headerShown: false }} />
        <Stack.Screen name="folder/[id]" options={{ title: 'Folder' }} />
        <Stack.Screen name="search" options={{ title: 'Search', presentation: 'modal' }} />
        <Stack.Screen name="add-bookmark" options={{ title: 'Add Bookmark', presentation: 'modal' }} />
        <Stack.Screen name="add-folder" options={{ title: 'New Folder', presentation: 'modal' }} />
        <Stack.Screen name="edit-bookmark/[id]" options={{ title: 'Edit Bookmark', presentation: 'modal' }} />
        <Stack.Screen name="edit-folder/[id]" options={{ title: 'Edit Folder', presentation: 'modal' }} />
        <Stack.Screen name="share" options={{ title: 'Save to BookMarx', presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="collections/index" options={{ title: 'Collections' }} />
        <Stack.Screen name="upgrade" options={{ title: 'Membership', headerShown: false }} />
        <Stack.Screen name="sessions/index" options={{ title: 'Sync History', headerShown: false }} />
        <Stack.Screen name="sessions/[id]" options={{ title: 'Session Details', headerShown: false }} />
      </Stack>
    </ShareIntentProvider>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
