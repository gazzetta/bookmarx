import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing, type as ty } from '../constants/theme';
import { PrimaryButton, Pill } from './ui';

interface PremiumGateProps {
  /** Whether the user has premium access */
  isPremium: boolean;
  /** The feature name to display in the gate message */
  featureName: string;
  /** Children to render if user has premium */
  children: React.ReactNode;
  /** Optional: Render a preview instead of completely blocking */
  preview?: React.ReactNode;
  /** Optional: Custom message to display */
  customMessage?: string;
}

/**
 * Component that gates premium features
 * Shows an upgrade prompt for free users, renders children for premium users
 */
export function PremiumGate({
  isPremium,
  featureName,
  children,
  preview,
  customMessage
}: PremiumGateProps) {
  const router = useRouter();

  if (isPremium) {
    return <>{children}</>;
  }

  const message = customMessage || `${featureName} is a premium feature. Upgrade to unlock unlimited access.`;

  return (
    <View style={styles.container}>
      {preview && (
        <View style={styles.previewContainer}>
          {preview}
          <View style={styles.overlay} />
        </View>
      )}

      <View style={styles.gateContent}>
        <View style={styles.iconContainer}>
          <Ionicons name="bookmark" size={30} color={colors.terra} />
        </View>

        <Text style={styles.title}>Premium feature</Text>
        <Text style={styles.message}>{message}</Text>

        <PrimaryButton
          label="Upgrade to Premium"
          icon="star"
          onPress={() => router.push('/upgrade')}
        />

        <TouchableOpacity
          style={styles.learnMoreButton}
          onPress={() => router.push('/upgrade')}
        >
          <Text style={styles.learnMoreText}>Learn more about Premium</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

interface PremiumBadgeProps {
  tier: 'free' | 'premium' | 'lifetime';
  size?: 'small' | 'medium' | 'large';
}

/**
 * Badge component to display user's subscription tier
 */
export function PremiumBadge({ tier, size = 'medium' }: PremiumBadgeProps) {
  const label = tier === 'lifetime' ? 'Lifetime' : tier === 'premium' ? 'Premium' : 'Free';
  const tone = tier === 'free' ? 'neutral' : 'premium';
  return <Pill label={label} tone={tone} />;
}

interface PremiumFeatureListProps {
  currentTier: 'free' | 'premium' | 'lifetime';
}

/**
 * Component showing feature comparison between tiers
 */
export function PremiumFeatureList({ currentTier }: PremiumFeatureListProps) {
  const isPremium = currentTier !== 'free';

  const features = [
    { name: 'Unlimited bookmarks', free: false, premium: true },
    { name: 'Unlimited browsers', free: false, premium: true },
    { name: 'Sync history (30 days)', free: false, premium: true },
    { name: 'Rollback changes', free: false, premium: true },
    { name: 'Multiple collections', free: false, premium: true },
    { name: 'Web editor', free: false, premium: true },
    { name: 'Priority support', free: false, premium: true },
    { name: 'Basic sync', free: true, premium: true },
    { name: 'Mobile app', free: true, premium: true },
  ];

  return (
    <View style={styles.featureList}>
      {features.map((feature, index) => (
        <View key={index} style={[styles.featureRow, index === features.length - 1 && styles.featureRowLast]}>
          <View style={styles.featureIcon}>
            <Ionicons
              name={feature.free || feature.premium ? 'checkmark-circle' : 'close-circle'}
              size={18}
              color={feature.free || feature.premium ? colors.sage : colors.inkFaint}
            />
          </View>
          <Text style={[
            styles.featureText,
            !feature.free && !isPremium && styles.featureTextLocked
          ]}>
            {feature.name}
          </Text>
          {!feature.free && (
            <Ionicons name="star" size={11} color={colors.amber} />
          )}
        </View>
      ))}
    </View>
  );
}

interface UsageLimitBarProps {
  current: number;
  max: number | null;
  label: string;
  isPremium: boolean;
}

/**
 * Progress bar showing usage against limits
 */
export function UsageLimitBar({ current, max, label, isPremium }: UsageLimitBarProps) {
  const hasLimit = max !== null;
  const percentage = hasLimit ? Math.min((current / max) * 100, 100) : 0;
  const isNearLimit = hasLimit && percentage >= 80;
  const isAtLimit = hasLimit && percentage >= 100;

  return (
    <View style={styles.usageContainer}>
      <View style={styles.usageHeader}>
        <Text style={styles.usageLabel}>{label}</Text>
        <Text style={[
          styles.usageCount,
          isAtLimit && styles.usageCountDanger,
          isNearLimit && !isAtLimit && styles.usageCountWarning,
        ]}>
          {current} {max ? `/ ${max}` : '(unlimited)'}
        </Text>
      </View>

      {max != null && (
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${percentage}%` },
              isAtLimit && styles.progressFillDanger,
              isNearLimit && !isAtLimit && styles.progressFillWarning,
            ]}
          />
        </View>
      )}

      {!isPremium && max != null && (
        <Text style={styles.upgradeHint}>
          Upgrade to Premium for unlimited {label.toLowerCase()}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  previewContainer: {
    position: 'relative',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(251, 248, 243, 0.8)',
  },
  gateContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxl,
  },
  iconContainer: {
    width: 76,
    height: 76,
    borderRadius: radius.pill,
    backgroundColor: colors.terraWash,
    borderWidth: 1,
    borderColor: colors.terraTint,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    ...ty.title,
    marginBottom: spacing.sm,
  },
  message: {
    ...ty.small,
    color: colors.inkMuted,
    textAlign: 'center',
    marginBottom: spacing.xxl,
    lineHeight: 22,
    maxWidth: 280,
  },
  learnMoreButton: {
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  learnMoreText: {
    ...ty.smallMedium,
    color: colors.terra,
  },
  featureList: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: spacing.lg,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    gap: spacing.md,
  },
  featureRowLast: {
    borderBottomWidth: 0,
  },
  featureIcon: {},
  featureText: {
    flex: 1,
    ...ty.body,
  },
  featureTextLocked: {
    color: colors.inkFaint,
  },
  usageContainer: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  usageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing.sm,
  },
  usageLabel: {
    ...ty.smallMedium,
    color: colors.inkSoft,
  },
  usageCount: {
    ...ty.captionMedium,
    fontFamily: fonts.semibold,
  },
  usageCountWarning: {
    color: colors.amber,
  },
  usageCountDanger: {
    color: colors.danger,
  },
  progressBar: {
    height: 6,
    backgroundColor: colors.creamDeep,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.terra,
    borderRadius: radius.pill,
  },
  progressFillWarning: {
    backgroundColor: colors.amber,
  },
  progressFillDanger: {
    backgroundColor: colors.danger,
  },
  upgradeHint: {
    ...ty.caption,
    marginTop: spacing.sm,
  },
});
