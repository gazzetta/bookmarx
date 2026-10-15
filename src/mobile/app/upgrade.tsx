import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Linking, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../store/authStore';
import { api } from '../services/api';
import { PremiumBadge, PremiumFeatureList, UsageLimitBar } from '../components/PremiumGate';
import { Card, IconButton, PrimaryButton, SecondaryButton, SectionLabel } from '../components/ui';
import { WEBSITE_URL } from '../constants/config';
import { colors, fonts, radius, shadow, spacing, type as ty } from '../constants/theme';
import type { AppConfig } from '../types';

// App Store review: no external purchase links on iOS (guideline 3.1.1).
// iOS users see plan details only; Android keeps the web checkout link.
const CAN_LINK_TO_CHECKOUT = Platform.OS !== 'ios';

function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export default function UpgradeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, stats, isPremium } = useAuthStore();
  const [selectedPlan, setSelectedPlan] = useState('yearly');
  const [isProcessing, setIsProcessing] = useState(false);
  const [config, setConfig] = useState<AppConfig | null>(null);

  const currentTier = (user?.subscriptionTier || 'free') as 'free' | 'premium' | 'lifetime';

  useEffect(() => {
    void api.getAppConfig().then((res) => {
      if (res.success && res.data) setConfig(res.data);
    });
  }, []);

  const pricing = config?.pricing ?? { monthly: 499, yearly: 3999, lifetime: 9999, currency: 'USD' };
  const plans = [
    { id: 'monthly', name: 'Monthly', price: formatPrice(pricing.monthly, pricing.currency), period: '/month', popular: false, savings: undefined as string | undefined },
    { id: 'yearly', name: 'Yearly', price: formatPrice(pricing.yearly, pricing.currency), period: '/year', popular: true, savings: 'Best for most people' },
    { id: 'lifetime', name: 'Lifetime', price: formatPrice(pricing.lifetime, pricing.currency), period: 'one-time', popular: false, savings: 'Pay once, keep forever' },
  ];

  const handleUpgrade = async () => {
    setIsProcessing(true);
    const checkoutUrl = `${WEBSITE_URL}/checkout?plan=${selectedPlan}&email=${encodeURIComponent(user?.email || '')}`;
    try {
      const supported = await Linking.canOpenURL(checkoutUrl);
      if (supported) {
        await Linking.openURL(checkoutUrl);
      } else {
        Alert.alert('Error', 'Unable to open checkout page');
      }
    } catch {
      Alert.alert('Error', 'Failed to start checkout process');
    }
    setIsProcessing(false);
  };

  const handleManageSubscription = async () => {
    try {
      await Linking.openURL(`${WEBSITE_URL}/account/subscription`);
    } catch {
      Alert.alert('Error', 'Unable to open subscription portal');
    }
  };

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      <IconButton name="arrow-back" onPress={() => router.back()} />
      <Text style={styles.headerTitle}>{isPremium ? 'Subscription' : 'Premium'}</Text>
      <View style={{ width: 38 }} />
    </View>
  );

  if (isPremium) {
    return (
      <View style={styles.screen}>
        {header}
        <ScrollView contentContainerStyle={styles.content}>
          <Card style={styles.planCard}>
            <View style={styles.currentPlanHeader}>
              <View>
                <Text style={styles.eyebrow}>CURRENT PLAN</Text>
                <Text style={styles.currentPlanName}>
                  {currentTier === 'lifetime' ? 'Lifetime' : 'Premium'}
                </Text>
              </View>
              <PremiumBadge tier={currentTier} size="large" />
            </View>
            {user?.subscriptionEndsAt ? (
              <Text style={styles.renewalDate}>
                {currentTier === 'lifetime'
                  ? 'Lifetime access — never expires'
                  : `Renews on ${new Date(user.subscriptionEndsAt).toLocaleDateString()}`
                }
              </Text>
            ) : null}
          </Card>

          {stats && (
            <View style={styles.section}>
              <SectionLabel>Your usage</SectionLabel>
              <UsageLimitBar current={stats.bookmarkCount} max={stats.limits.maxBookmarks} label="Bookmarks" isPremium={isPremium} />
              <UsageLimitBar current={stats.browserCount} max={stats.limits.maxBrowsers} label="Connected browsers" isPremium={isPremium} />
              <UsageLimitBar current={stats.collectionCount} max={stats.limits.maxCollections} label="Collections" isPremium={isPremium} />
            </View>
          )}

          <View style={styles.section}>
            <SectionLabel>Included features</SectionLabel>
            <PremiumFeatureList currentTier={currentTier} />
          </View>

          {CAN_LINK_TO_CHECKOUT ? (
            <SecondaryButton label="Manage subscription" icon="open-outline" onPress={handleManageSubscription} />
          ) : (
            <Text style={styles.hint}>
              Manage your subscription from your account on the BookMarx website.
            </Text>
          )}

          <Text style={styles.footerText}>Thank you for supporting BookMarx.</Text>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {header}
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="star" size={26} color={colors.amber} />
          </View>
          <Text style={styles.heroTitle}>Everything,{'\n'}unlimited.</Text>
          <Text style={styles.heroSubtitle}>
            Unlimited bookmarks, sync history, rollback, and collections — on every device you own.
          </Text>
        </View>

        {stats && (
          <View style={styles.section}>
            <SectionLabel>Your current usage</SectionLabel>
            <UsageLimitBar current={stats.bookmarkCount} max={stats.limits.maxBookmarks} label="Bookmarks" isPremium={false} />
            <UsageLimitBar current={stats.browserCount} max={stats.limits.maxBrowsers} label="Connected browsers" isPremium={false} />
          </View>
        )}

        <View style={styles.section}>
          <SectionLabel>Choose a plan</SectionLabel>
          {plans.map((plan) => {
            const selected = selectedPlan === plan.id;
            return (
              <TouchableOpacity
                key={plan.id}
                style={[styles.planOption, selected && styles.planOptionSelected]}
                onPress={() => setSelectedPlan(plan.id)}
                activeOpacity={0.8}
              >
                {plan.popular && (
                  <View style={styles.popularBadge}>
                    <Text style={styles.popularBadgeText}>Most popular</Text>
                  </View>
                )}
                <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
                  {selected && <View style={styles.radioInner} />}
                </View>
                <View style={styles.planInfo}>
                  <Text style={styles.planName}>{plan.name}</Text>
                  {plan.savings ? <Text style={styles.planSavings}>{plan.savings}</Text> : null}
                </View>
                <View style={styles.planPricing}>
                  <Text style={styles.planPrice}>{plan.price}</Text>
                  <Text style={styles.planPeriod}>{plan.period}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.section}>
          <SectionLabel>What you get</SectionLabel>
          <PremiumFeatureList currentTier="free" />
        </View>

        {CAN_LINK_TO_CHECKOUT ? (
          <PrimaryButton
            label="Upgrade now"
            icon="star"
            onPress={handleUpgrade}
            loading={isProcessing}
            style={styles.cta}
          />
        ) : (
          <Text style={styles.hint}>
            Upgrades are available from your account on the BookMarx website.
          </Text>
        )}

        <Text style={styles.footerText}>Cancel anytime. 30-day money-back guarantee.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    ...ty.heading,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  hero: {
    backgroundColor: colors.ink,
    borderRadius: radius.xl,
    padding: spacing.xxl,
    marginBottom: spacing.lg,
    alignItems: 'flex-start',
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(212,160,54,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(212,160,54,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  heroTitle: {
    fontFamily: fonts.display,
    fontSize: 30,
    letterSpacing: -0.6,
    color: colors.cream,
    marginBottom: spacing.sm,
  },
  heroSubtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
    color: 'rgba(251,248,243,0.72)',
    maxWidth: 300,
  },
  section: {
    marginBottom: spacing.lg,
  },
  eyebrow: {
    ...ty.eyebrow,
  },
  planCard: {
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },
  currentPlanHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  currentPlanName: {
    ...ty.title,
    marginTop: 2,
  },
  renewalDate: {
    ...ty.small,
    color: colors.inkMuted,
  },
  planOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    ...shadow.card,
  },
  planOptionSelected: {
    borderColor: colors.terra,
    backgroundColor: colors.terraWash,
  },
  popularBadge: {
    position: 'absolute',
    top: -10,
    right: spacing.lg,
    backgroundColor: colors.terra,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  popularBadgeText: {
    color: '#fff',
    fontFamily: fonts.semibold,
    fontSize: 11,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  radioOuterSelected: {
    borderColor: colors.terra,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.terra,
  },
  planInfo: {
    flex: 1,
  },
  planName: {
    ...ty.bodySemibold,
    fontSize: 16,
  },
  planSavings: {
    ...ty.captionMedium,
    color: colors.sage,
    marginTop: 1,
  },
  planPricing: {
    alignItems: 'flex-end',
  },
  planPrice: {
    fontFamily: fonts.display,
    fontSize: 20,
    color: colors.ink,
  },
  planPeriod: {
    ...ty.caption,
  },
  cta: {
    marginTop: spacing.xs,
  },
  hint: {
    ...ty.small,
    textAlign: 'center',
    color: colors.inkMuted,
    backgroundColor: colors.creamDeep,
    borderRadius: radius.md,
    padding: spacing.lg,
    overflow: 'hidden',
  },
  footerText: {
    ...ty.caption,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});
