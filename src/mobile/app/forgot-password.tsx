import { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../services/api';
import { Atmosphere } from '../components/Atmosphere';
import { Card, Field, IconButton, PrimaryButton, Reveal, Wordmark } from '../components/ui';
import { colors, spacing, type as ty } from '../constants/theme';

/**
 * Sends the existing website password-reset email. The response is generic on
 * purpose — the backend never reveals whether an account exists.
 */
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (!email.trim()) {
      setError('Enter your email address');
      return;
    }
    setIsSending(true);
    const response = await api.forgotPassword(email.trim());
    setIsSending(false);
    if (response.success) {
      setSent(true);
    } else {
      setError(response.error?.message || 'Could not process the request. Please try again.');
    }
  };

  return (
    <View style={styles.container}>
      <Atmosphere />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={[styles.header, { paddingTop: insets.top }]}>
            <IconButton name="arrow-back" onPress={() => router.back()} />
          </View>
          <Reveal style={styles.hero}>
            <Wordmark size={40} />
          </Reveal>

          <Reveal delay={140}>
            {sent ? (
              <Card style={styles.card}>
                <Text style={styles.title}>Check your email</Text>
                <Text style={styles.body}>
                  If an account with that email exists, a password reset link has been sent.
                  The link opens a BookMarx page and expires after 1 hour.
                </Text>
                <PrimaryButton label="Back to sign in" onPress={() => router.replace('/login')} style={styles.submit} />
              </Card>
            ) : (
              <Card style={styles.card}>
                <Text style={styles.title}>Forgot password</Text>
                <Text style={styles.body}>
                  Enter your account email and we'll send you a reset link.
                </Text>
                <Field
                  label="Email"
                  placeholder="you@example.com"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <PrimaryButton label="Send reset link" onPress={submit} loading={isSending} style={styles.submit} />
              </Card>
            )}
          </Reveal>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    padding: spacing.xl,
  },
  header: {
    alignItems: 'flex-start',
    marginBottom: spacing.xl,
  },
  hero: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  card: {
    padding: spacing.xl,
    gap: spacing.lg,
  },
  title: {
    ...ty.heading,
    textAlign: 'center',
  },
  body: {
    ...ty.small,
    color: colors.inkMuted,
    textAlign: 'center',
    lineHeight: 21,
  },
  error: {
    ...ty.smallMedium,
    color: colors.danger,
    textAlign: 'center',
  },
  submit: {
    marginTop: spacing.xs,
  },
});
