import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

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
          <Ionicons name="lock-closed" size={48} color="#F59E0B" />
        </View>
        
        <Text style={styles.title}>Premium Feature</Text>
        <Text style={styles.message}>{message}</Text>
        
        <TouchableOpacity
          style={styles.upgradeButton}
          onPress={() => router.push('/upgrade')}
        >
          <Ionicons name="star" size={20} color="#fff" />
          <Text style={styles.upgradeButtonText}>Upgrade to Premium</Text>
        </TouchableOpacity>
        
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
  const sizes = {
    small: { fontSize: 10, paddingH: 6, paddingV: 2 },
    medium: { fontSize: 12, paddingH: 8, paddingV: 4 },
    large: { fontSize: 14, paddingH: 12, paddingV: 6 },
  };

  const colors = {
    free: { bg: '#E5E7EB', text: '#6B7280' },
    premium: { bg: '#FEF3C7', text: '#D97706' },
    lifetime: { bg: '#DBEAFE', text: '#2563EB' },
  };

  const config = sizes[size];
  const color = colors[tier];

  return (
    <View style={[
      styles.badge,
      { 
        backgroundColor: color.bg,
        paddingHorizontal: config.paddingH,
        paddingVertical: config.paddingV,
      }
    ]}>
      {tier !== 'free' && (
        <Ionicons name="star" size={config.fontSize} color={color.text} style={{ marginRight: 4 }} />
      )}
      <Text style={[styles.badgeText, { fontSize: config.fontSize, color: color.text }]}>
        {tier === 'lifetime' ? 'Lifetime' : tier === 'premium' ? 'Premium' : 'Free'}
      </Text>
    </View>
  );
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
    { name: 'Unlimited Bookmarks', free: false, premium: true },
    { name: 'Unlimited Browsers', free: false, premium: true },
    { name: 'Sync History (30 days)', free: false, premium: true },
    { name: 'Rollback Changes', free: false, premium: true },
    { name: 'Multiple Collections', free: false, premium: true },
    { name: 'Web Editor', free: false, premium: true },
    { name: 'Priority Support', free: false, premium: true },
    { name: 'Basic Sync', free: true, premium: true },
    { name: 'Mobile App', free: true, premium: true },
  ];

  return (
    <View style={styles.featureList}>
      {features.map((feature, index) => (
        <View key={index} style={styles.featureRow}>
          <View style={styles.featureIcon}>
            <Ionicons 
              name={feature.premium ? 'checkmark-circle' : 'close-circle'} 
              size={20} 
              color={feature.premium ? '#10B981' : '#EF4444'} 
            />
          </View>
          <Text style={[
            styles.featureText,
            !feature.free && !isPremium && styles.featureTextLocked
          ]}>
            {feature.name}
          </Text>
          {!feature.free && (
            <View style={styles.premiumTag}>
              <Ionicons name="star" size={12} color="#F59E0B" />
            </View>
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
      
      {max && (
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
      
      {!isPremium && max && (
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
  },
  previewContainer: {
    position: 'relative',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
  },
  gateContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
  },
  message: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  upgradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F59E0B',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 8,
    marginBottom: 12,
  },
  upgradeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  learnMoreButton: {
    padding: 12,
  },
  learnMoreText: {
    color: '#3B82F6',
    fontSize: 14,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
  },
  badgeText: {
    fontWeight: '600',
  },
  featureList: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  featureIcon: {
    marginRight: 12,
  },
  featureText: {
    flex: 1,
    fontSize: 15,
    color: '#374151',
  },
  featureTextLocked: {
    color: '#9CA3AF',
  },
  premiumTag: {
    marginLeft: 8,
  },
  usageContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  usageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  usageLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  usageCount: {
    fontSize: 14,
    color: '#6B7280',
  },
  usageCountWarning: {
    color: '#F59E0B',
  },
  usageCountDanger: {
    color: '#EF4444',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3B82F6',
    borderRadius: 4,
  },
  progressFillWarning: {
    backgroundColor: '#F59E0B',
  },
  progressFillDanger: {
    backgroundColor: '#EF4444',
  },
  upgradeHint: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 8,
  },
});
