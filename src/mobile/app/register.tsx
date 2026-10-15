import { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter, Link } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { useAuthStore } from '../store/authStore';
import { destinationFor } from '../services/access';
import { Card, Field, PrimaryButton, Wordmark } from '../components/ui';
import { colors, fonts, spacing, type as ty } from '../constants/theme';

export default function RegisterScreen() {
  const router = useRouter();
  const { register, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');

  const handleRegister = async () => {
    setError('');
    if (!email || !password) {
      setError('Email and password are required');
      return;
    }

    const result = await register(email, password, displayName || undefined);
    if (result.success) {
      // New accounts are unverified — the access gate lands them on /verify-email.
      const destination = destinationFor(useAuthStore.getState().access);
      router.replace(destination ?? '/');
    } else {
      setError(result.error || 'Registration failed');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Wordmark size={44} />
          <Text style={styles.tagline}>Your library starts here.</Text>
        </View>

        <Card style={styles.card}>
          <Field
            label="Display name"
            placeholder="Optional"
            value={displayName}
            onChangeText={setDisplayName}
            autoCapitalize="words"
          />
          <Field
            label="Email"
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Field
            label="Password"
            placeholder="Choose a password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <PrimaryButton label="Create account" onPress={handleRegister} loading={isLoading} style={styles.submit} />
        </Card>

        <Link href="/login" asChild>
          <Text style={styles.link}>
            Already have an account? <Text style={styles.linkAccent}>Sign in</Text>
          </Text>
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  hero: {
    alignItems: 'center',
    marginBottom: spacing.xxxl,
  },
  tagline: {
    ...ty.accent,
    fontSize: 17,
    marginTop: spacing.sm,
  },
  card: {
    padding: spacing.xl,
    gap: spacing.lg,
  },
  error: {
    ...ty.smallMedium,
    color: colors.danger,
    textAlign: 'center',
    marginTop: -spacing.sm,
  },
  submit: {
    marginTop: spacing.xs,
  },
  link: {
    ...ty.small,
    textAlign: 'center',
    marginTop: spacing.xl,
    fontFamily: fonts.body,
  },
  linkAccent: {
    fontFamily: fonts.semibold,
    color: colors.terra,
  },
});
