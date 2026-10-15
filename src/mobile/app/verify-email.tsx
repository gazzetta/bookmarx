import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../store/authStore';
import { api } from '../services/api';
import { destinationFor } from '../services/access';
import { Atmosphere } from '../components/Atmosphere';
import { Card, DangerButton, PrimaryButton, Reveal, SecondaryButton, Wordmark } from '../components/ui';
import { colors, radius, spacing, type as ty } from '../constants/theme';

const DEFAULT_RESEND_COOLDOWN_S = 60;

export default function VerifyEmailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, emailDeliveryFailed, revalidate, logout } = useAuthStore();
  const { token } = useLocalSearchParams<{ token?: string }>();

  const [busy, setBusy] = useState<'resend' | 'check' | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const tokenAttempted = useRef(false);

  const cooldownLeft = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [cooldownLeft > 0]);

  // A verification token can arrive by deep link; confirm it once, then refresh.
  useEffect(() => {
    if (!token || tokenAttempted.current) return;
    tokenAttempted.current = true;
    void (async () => {
      setBusy('check');
      const response = await api.verifyEmail(token);
      if (response.success) {
        setMessage('Your email is verified.');
      } else {
        setError(response.error?.message || 'This verification link is invalid or has expired. Request a new email below.');
      }
      const level = await revalidate();
      setBusy(null);
      const destination = destinationFor(level);
      if (destination && level === 'allowed') router.replace(destination);
    })();
  }, [token]);

  const resend = async () => {
    setBusy('resend');
    setError('');
    setMessage('');
    try {
      const response = await api.resendVerificationEmail();
      if (response.success && response.data?.emailVerified) {
        const level = await revalidate();
        setMessage('Your email is already verified.');
        const destination = destinationFor(level);
        if (destination && level === 'allowed') router.replace(destination);
        return;
      }
      if (response.success) {
        setCooldownUntil(Date.now() + DEFAULT_RESEND_COOLDOWN_S * 1000);
        setMessage(`Confirmation email sent to ${user?.email ?? 'your address'}. Check your inbox and junk folder.`);
        return;
      }
      if (response.error?.code === 'VERIFICATION_RATE_LIMIT') {
        const wait = response.error.retryAfter ?? DEFAULT_RESEND_COOLDOWN_S;
        setCooldownUntil(Date.now() + wait * 1000);
        setError(response.error.message || `Please wait ${wait} seconds before requesting another email.`);
        return;
      }
      // EMAIL_DELIVERY_FAILED and other failures: the account stays saved,
      // resend remains available.
      setError(response.error?.message || 'Could not send the confirmation email. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const checkVerified = async () => {
    setBusy('check');
    setError('');
    setMessage('');
    try {
      const level = await revalidate();
      if (level === 'allowed' || level === 'membership') {
        const destination = destinationFor(level);
        if (destination) router.replace(destination);
        return;
      }
      setMessage('Your email is not verified yet. Open the confirmation link in your email, then check again.');
    } catch {
      setError('Could not check your account. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const signOut = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <View style={styles.container}>
      <Atmosphere />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xxl }]}
        keyboardShouldPersistTaps="handled"
      >
        <Reveal style={styles.hero}>
          <Wordmark size={34} />
          <View style={styles.iconWrap}>
            <Ionicons name="mail-unread-outline" size={30} color={colors.terra} />
          </View>
          <Text style={styles.title}>Verify your email</Text>
        </Reveal>

        <Reveal delay={120}>
          <Text style={styles.body}>
            {emailDeliveryFailed
              ? 'Your account is saved, but the confirmation email could not be sent. Request another below.'
              : <>
                  Your account is saved. Confirm{'\n'}
                  <Text style={styles.email}>{user?.email ?? 'your email address'}</Text>
                  {'\n'}before opening your bookmark library.
                </>
            }
          </Text>
          <Text style={styles.hint}>
            Open the confirmation email and follow its link — it works once and expires after 24 hours.
            Check your junk folder if it has not arrived.
          </Text>
        </Reveal>

        <Reveal delay={220} style={styles.cardWrap}>
          <Card style={styles.card}>
            <SecondaryButton
              label={cooldownLeft > 0 ? `Resend available in ${cooldownLeft}s` : 'Resend confirmation email'}
              icon="refresh"
              onPress={resend}
              loading={busy === 'resend'}
              disabled={cooldownLeft > 0 || busy === 'check'}
            />
            <PrimaryButton
              label="I have verified my email"
              icon="checkmark-circle"
              onPress={checkVerified}
              loading={busy === 'check'}
              disabled={busy === 'resend'}
              style={styles.checkButton}
            />
            {message ? <Text style={styles.status}>{message}</Text> : null}
            {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
          </Card>
        </Reveal>

        <Reveal delay={300} style={styles.signOutWrap}>
          <DangerButton label="Sign out" icon="log-out-outline" onPress={() => void signOut()} />
        </Reveal>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  flex: { flex: 1 },
  content: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  hero: {
    alignItems: 'center',
  },
  iconWrap: {
    width: 76,
    height: 76,
    borderRadius: radius.pill,
    backgroundColor: colors.terraWash,
    borderWidth: 1,
    borderColor: colors.terraTint,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xxl,
    marginBottom: spacing.lg,
  },
  title: {
    ...ty.heading,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  body: {
    ...ty.small,
    color: colors.inkMuted,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 21,
  },
  email: {
    fontFamily: ty.bodySemibold.fontFamily,
    color: colors.ink,
  },
  hint: {
    ...ty.caption,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 19,
    marginTop: spacing.md,
  },
  cardWrap: {
    alignSelf: 'stretch',
    marginTop: spacing.xl,
  },
  card: {
    padding: spacing.xl,
    gap: spacing.md,
  },
  checkButton: {},
  status: {
    ...ty.smallMedium,
    color: colors.sage,
    textAlign: 'center',
  },
  error: {
    ...ty.smallMedium,
    color: colors.danger,
    textAlign: 'center',
  },
  signOutWrap: {
    alignSelf: 'stretch',
    marginTop: spacing.xl,
  },
});
