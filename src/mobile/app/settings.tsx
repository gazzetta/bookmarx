import { ScrollView, View, Text, TouchableOpacity, StyleSheet, Alert, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useAuthStore } from '../store/authStore';
import { PremiumBadge, UsageLimitBar } from '../components/PremiumGate';
import { DangerButton, SectionLabel } from '../components/ui';
import { WEBSITE_URL } from '../constants/config';
import { colors, fonts, radius, shadow, spacing, type as ty } from '../constants/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, stats, isPremium, access, logout } = useAuthStore();
  const version = Constants.expoConfig?.version ?? '1.0.0';
  const libraryAccess = access === 'allowed';

  const confirmLogout = () => {
    Alert.alert('Sign out?', 'Your bookmarks stay synced to your account.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void logout().then(() => router.replace('/login')) },
    ]);
  };

  const tier = (user?.subscriptionTier || 'free') as 'free' | 'premium' | 'lifetime';
  const initial = (user?.displayName || user?.email || 'B').trim()[0]?.toUpperCase() ?? 'B';

  const Row = ({ icon, label, value, onPress, iconBg, iconColor, isLast }: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    value?: string;
    onPress?: () => void;
    iconBg?: string;
    iconColor?: string;
    isLast?: boolean;
  }) => (
    <TouchableOpacity style={[styles.row, !isLast && styles.rowBorder]} onPress={onPress} disabled={!onPress} activeOpacity={0.7}>
      <View style={[styles.rowIcon, { backgroundColor: iconBg ?? colors.sageTint }]}>
        <Ionicons name={icon} size={15} color={iconColor ?? colors.sage} />
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} /> : null}
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.accountCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarInitial}>{initial}</Text>
        </View>
        <View style={styles.accountInfo}>
          <Text style={styles.accountName} numberOfLines={1}>{user?.displayName || 'BookMarx user'}</Text>
          <Text style={styles.accountEmail} numberOfLines={1}>{user?.email}</Text>
        </View>
        <PremiumBadge tier={tier} size="medium" />
      </View>

      {stats ? (
        <View style={styles.section}>
          <SectionLabel>Usage</SectionLabel>
          <UsageLimitBar current={stats.bookmarkCount} max={stats.limits.maxBookmarks} label="Bookmarks" />
          <UsageLimitBar current={stats.browserCount} max={stats.limits.maxBrowsers} label="Connected browsers" />
          <UsageLimitBar current={stats.collectionCount} max={stats.limits.maxCollections} label="Collections" />
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionLabel>Account</SectionLabel>
        <View style={styles.card}>
          <Row
            icon={user?.emailVerified ? 'checkmark-circle' : 'mail'}
            label="Email verification"
            value={user?.emailVerified ? 'Verified' : 'Not verified'}
            iconBg={user?.emailVerified ? colors.sageTint : colors.amberTint}
            iconColor={user?.emailVerified ? colors.sage : colors.amberText}
            onPress={user?.emailVerified ? undefined : () => router.push('/verify-email')}
          />
          <Row
            icon="card"
            label="Membership"
            value={isPremium ? 'Premium' : 'None'}
            onPress={() => router.push('/membership')}
            isLast
          />
        </View>
      </View>

      {libraryAccess ? (
        <View style={styles.section}>
          <SectionLabel>Manage</SectionLabel>
          <View style={styles.card}>
            <Row icon="albums" label="Collections" onPress={() => router.push('/collections')} />
            <Row icon="time" label="Sync history" onPress={() => router.push('/sessions')} isLast />
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionLabel>About</SectionLabel>
        <View style={styles.card}>
          <Row icon="globe" label="Open bookmarx.cc" onPress={() => void Linking.openURL(WEBSITE_URL)} />
          <Row icon="shield-checkmark" label="Privacy policy" onPress={() => void Linking.openURL(`${WEBSITE_URL}/privacy`)} />
          <Row icon="document-text" label="Terms of service" onPress={() => void Linking.openURL(`${WEBSITE_URL}/terms`)} />
          <Row icon="information-circle" label="Version" value={version} isLast />
        </View>
      </View>

      <DangerButton label="Sign out" icon="log-out-outline" onPress={confirmLogout} style={styles.logout} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: spacing.md,
    marginBottom: spacing.lg,
    ...shadow.card,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.terraWash,
    borderWidth: 1,
    borderColor: colors.terraTint,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontFamily: fonts.displayItalic,
    fontSize: 24,
    color: colors.terra,
    marginTop: -2,
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    ...ty.bodySemibold,
    fontSize: 16,
  },
  accountEmail: {
    ...ty.caption,
    marginTop: 2,
  },
  section: {
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: 'hidden',
    ...shadow.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    flex: 1,
    ...ty.bodyMedium,
  },
  rowValue: {
    ...ty.caption,
  },
  logout: {
    marginTop: spacing.sm,
  },
});
