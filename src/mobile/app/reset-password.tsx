import { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../services/api';
import { Atmosphere } from '../components/Atmosphere';
import { Card, Field, IconButton, PrimaryButton, Reveal, Wordmark } from '../components/ui';
import { colors, spacing, type as ty } from '../constants/theme';

/**
 * Completes a password reset inside the app when a reset token is supplied
 * (e.g. a bookmarx://reset-password?token=… deep link). The emailed link still
 * opens the website's reset page; this screen is a native equivalent.
 */
export default function ResetPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ token?: string }>();
  const [token, setToken] = useState(params.token ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (!token.trim()) {
      setError('A reset token is required — use the link from your email.');
      return;
    }
    if (password.length < 8) {
      setError('Choose a password of at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setIsSaving(true);
    const response = await api.resetPassword(token.trim(), password);
    setIsSaving(false);
    if (response.success) {
      setDone(true);
    } else {
      setError(response.error?.message || 'Could not reset the password. Request a new link.');
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
            {done ? (
              <Card style={styles.card}>
                <Text style={styles.title}>Password updated</Text>
                <Text style={styles.body}>Your password has been reset. Sign in with your new password.</Text>
                <PrimaryButton label="Sign in" onPress={() => router.replace('/login')} style={styles.submit} />
              </Card>
            ) : (
              <Card style={styles.card}>
                <Text style={styles.title}>Choose a new password</Text>
                {!params.token ? (
                  <Field
                    label="Reset token"
                    placeholder="Paste the token from your reset link"
                    value={token}
                    onChangeText={setToken}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                ) : null}
                <Field
                  label="New password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />
                <Field
                  label="Confirm password"
                  placeholder="Repeat the new password"
                  value={confirm}
                  onChangeText={setConfirm}
                  secureTextEntry
                />
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <PrimaryButton label="Reset password" onPress={submit} loading={isSaving} style={styles.submit} />
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
