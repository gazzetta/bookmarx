import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Linking, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../store/authStore';
import { destinationFor } from '../services/access';
import { Atmosphere } from '../components/Atmosphere';
import { Card, PrimaryButton, Reveal, SecondaryButton, Wordmark } from '../components/ui';
import { WEBSITE_URL } from '../constants/config';
import { colors, radius, spacing, type as ty } from '../constants/theme';

/**
 * Neutral membership-required screen. Deliberately shows no prices, checkout
 * links or purchase prompts on either platform — only account status, recheck
 * and support functions.
 */
export default function MembershipScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, accessReason, revalidate, logout } = useAuthStore();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  const checkMembership = async () => {
    setChecking(true);
    setError('');
    try {
      const level = await revalidate();
      const destination = destinationFor(level);
      if (destination && level === 'allowed') {
        router.replace(destination);
        return;
      }
      if (level === 'membership') setError('No active membership was found on this account.');
      else if (level === 'verify-email') router.replace('/verify-email');
      else setError('Could not check your membership. Please try again.');
    } catch {
      setError('Could not check your membership. Please try again.');
    } finally {
      setChecking(false);
    }
  };

  const useAnotherAccount = async () => {
    await logout();
    router.replace('/login');
  };

  const LinkRow = ({ icon, label, url, isLast }: { icon: keyof typeof Ionicons.glyphMap; label: string; url: string; isLast?: boolean }) => (
    <TouchableOpacity style={[styles.linkRow, !isLast && styles.linkRowBorder]} onPress={() => void Linking.openURL(url)} activeOpacity={0.7}>
      <Ionicons name={icon} size={15} color={colors.sage} style={styles.linkIcon} />
      <Text style={styles.linkLabel}>{label}</Text>
      <Ionicons name="open-outline" size={14} color={colors.inkFaint} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Atmosphere />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xxl }]}
      >
        <Reveal style={styles.hero}>
          <Wordmark size={34} />
          <View style={styles.iconWrap}>
            <Ionicons name="bookmark-outline" size={30} color={colors.terra} />
          </View>
          <Text style={styles.title}>Membership required</Text>
        </Reveal>

        <Reveal delay={120}>
          <Text style={styles.body}>
            This app requires a BookMarx Premium membership.
          </Text>
          {accessReason === 'recheck' ? (
            <Text style={styles.hint}>We could not confirm your membership recently. Check again when you're back online.</Text>
          ) : (
            <Text style={styles.hint}>
              Signed in as {user?.email ?? 'your account'}. If your membership was renewed elsewhere, check again below.
            </Text>
          )}
        </Reveal>

        <Reveal delay={220} style={styles.cardWrap}>
          <Card style={styles.card}>
            <PrimaryButton
              label="Check membership"
              icon="refresh"
              onPress={checkMembership}
              loading={checking}
            />
            <SecondaryButton
              label="Use another account"
              icon="swap-horizontal"
              onPress={() => void useAnotherAccount()}
            />
            {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
          </Card>
        </Reveal>

        <Reveal delay={300} style={styles.cardWrap}>
          <Card style={styles.linksCard}>
            <LinkRow icon="person-circle-outline" label="Account settings" url={`${WEBSITE_URL}/settings`} />
            <LinkRow icon="shield-checkmark-outline" label="Privacy policy" url={`${WEBSITE_URL}/privacy`} />
            <LinkRow icon="document-text-outline" label="Terms of service" url={`${WEBSITE_URL}/terms`} />
            <LinkRow icon="chatbubble-ellipses-outline" label="Contact support" url={`${WEBSITE_URL}/contact`} isLast />
          </Card>
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
    paddingBottom: spacing.xxxl,
    alignItems: 'center',
  },
  hero: {
    alignItems: 'center',
  },
  cardWrap: {
    alignSelf: 'stretch',
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
    ...ty.bodyMedium,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 22,
  },
  hint: {
    ...ty.caption,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 19,
    marginTop: spacing.md,
  },
  card: {
    alignSelf: 'stretch',
    padding: spacing.xl,
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  error: {
    ...ty.smallMedium,
    color: colors.danger,
    textAlign: 'center',
  },
  linksCard: {
    alignSelf: 'stretch',
    marginTop: spacing.lg,
    overflow: 'hidden',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  linkRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  linkIcon: {
    width: 20,
  },
  linkLabel: {
    flex: 1,
    ...ty.bodyMedium,
  },
});
