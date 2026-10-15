import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
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
 * Component that gates premium features.
 * Shows a neutral membership notice — never prices or purchase prompts —
 * for free users, renders children for premium users.
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

  const message = customMessage || `${featureName} requires a BookMarx Premium membership.`;

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

        <Text style={styles.title}>Membership required</Text>
        <Text style={styles.message}>{message}</Text>

        <PrimaryButton
          label="Check membership"
          icon="refresh"
          onPress={() => router.push('/membership')}
        />
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
 * List of capabilities included in the signed-in account's plan.
 * Informational only — no upsell copy or purchase prompts.
 */
export function PremiumFeatureList({ currentTier }: PremiumFeatureListProps) {
  const isPremium = currentTier !== 'free';

  const features = [
    { name: 'Bookmark library on this device', included: true },
    { name: 'Folders, search and collections', included: true },
    { name: 'Sync with your BookMarx account', included: true },
    { name: 'Sync history and rollback', included: isPremium },
    { name: 'Multiple collections', included: isPremium },
  ];

  return (
    <View style={styles.featureList}>
      {features.map((feature, index) => (
        <View key={index} style={[styles.featureRow, index === features.length - 1 && styles.featureRowLast]}>
          <View style={styles.featureIcon}>
            <Ionicons
              name={feature.included ? 'checkmark-circle' : 'ellipse-outline'}
              size={18}
              color={feature.included ? colors.sage : colors.inkFaint}
            />
          </View>
          <Text style={[
            styles.featureText,
            !feature.included && styles.featureTextLocked
          ]}>
            {feature.name}
          </Text>
        </View>
      ))}
    </View>
  );
}

interface UsageLimitBarProps {
  current: number;
  max: number | null;
  label: string;
}

/**
 * Progress bar showing usage against server-reported limits
 */
export function UsageLimitBar({ current, max, label }: UsageLimitBarProps) {
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
    backgroundColor: colors.scrim,
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
});
