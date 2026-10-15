import { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter, Link } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { useAuthStore } from '../store/authStore';
import { destinationFor } from '../services/access';
import { Card, Field, PrimaryButton, Wordmark } from '../components/ui';
import { colors, fonts, spacing, type as ty } from '../constants/theme';

export default function LoginScreen() {
  const router = useRouter();
  const { login, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async () => {
    setError('');
    if (!email || !password) {
      setError('Enter your email and password');
      return;
    }

    const result = await login(email, password);
    if (result.success) {
      // Route by access level — unverified and nonmember accounts never reach the library.
      const destination = destinationFor(useAuthStore.getState().access);
      router.replace(destination ?? '/');
    } else {
      setError(result.error || 'Login failed');
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
          <Text style={styles.tagline}>Every bookmark, in one place.</Text>
        </View>

        <Card style={styles.card}>
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
            placeholder="Your password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            style={styles.field}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <PrimaryButton label="Sign in" onPress={handleLogin} loading={isLoading} style={styles.submit} />
          <Link href="/forgot-password" asChild>
            <Text style={styles.forgot}>Forgot password?</Text>
          </Link>
        </Card>

        <Link href="/register" asChild>
          <Text style={styles.link}>
            New to BookMarx? <Text style={styles.linkAccent}>Create an account</Text>
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
  field: {},
  error: {
    ...ty.smallMedium,
    color: colors.danger,
    textAlign: 'center',
    marginTop: -spacing.sm,
  },
  submit: {
    marginTop: spacing.xs,
  },
  forgot: {
    ...ty.smallMedium,
    color: colors.terra,
    textAlign: 'center',
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
