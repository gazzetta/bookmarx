import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Linking, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import { PremiumBadge, PremiumFeatureList, UsageLimitBar } from '../components/PremiumGate';

const PRICING_PLANS = [
  {
    id: 'monthly',
    name: 'Monthly',
    price: '$4.99',
    period: '/month',
    popular: false,
  },
  {
    id: 'yearly',
    name: 'Yearly',
    price: '$39.99',
    period: '/year',
    savings: 'Save 33%',
    popular: true,
  },
  {
    id: 'lifetime',
    name: 'Lifetime',
    price: '$99.99',
    period: 'one-time',
    savings: 'Best Value',
    popular: false,
  },
];

export default function UpgradeScreen() {
  const router = useRouter();
  const { user, stats, isPremium, refreshStats } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState('yearly');
  const [isProcessing, setIsProcessing] = useState(false);

  const currentTier = (user?.subscriptionTier || 'free') as 'free' | 'premium' | 'lifetime';

  const handleUpgrade = async () => {
    setIsProcessing(true);
    
    // In production, this would redirect to Polar checkout
    const checkoutUrl = `https://bookmarx.io/checkout?plan=${selectedPlan}&email=${encodeURIComponent(user?.email || '')}`;
    
    try {
      const supported = await Linking.canOpenURL(checkoutUrl);
      if (supported) {
        await Linking.openURL(checkoutUrl);
      } else {
        Alert.alert('Error', 'Unable to open checkout page');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to start checkout process');
    }
    
    setIsProcessing(false);
  };

  const handleManageSubscription = async () => {
    const portalUrl = 'https://bookmarx.io/account/subscription';
    try {
      await Linking.openURL(portalUrl);
    } catch (error) {
      Alert.alert('Error', 'Unable to open subscription portal');
    }
  };

  if (isPremium) {
    // Show subscription management for premium users
    return (
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#1F2937" />
          </TouchableOpacity>
          <Text style={styles.title}>Subscription</Text>
        </View>

        <View style={styles.currentPlan}>
          <View style={styles.currentPlanHeader}>
            <Text style={styles.currentPlanLabel}>Current Plan</Text>
            <PremiumBadge tier={currentTier} size="large" />
          </View>
          
          {user?.subscriptionEndsAt && (
            <Text style={styles.renewalDate}>
              {currentTier === 'lifetime' 
                ? 'Lifetime access - never expires'
                : `Renews on ${new Date(user.subscriptionEndsAt).toLocaleDateString()}`
              }
            </Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Usage</Text>
          
          {stats && (
            <>
              <UsageLimitBar 
                current={stats.bookmarkCount} 
                max={stats.limits.maxBookmarks} 
                label="Bookmarks"
                isPremium={isPremium}
              />
              <UsageLimitBar 
                current={stats.browserCount} 
                max={stats.limits.maxBrowsers} 
                label="Connected Browsers"
                isPremium={isPremium}
              />
              <UsageLimitBar 
                current={stats.collectionCount} 
                max={stats.limits.maxCollections} 
                label="Collections"
                isPremium={isPremium}
              />
            </>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Included Features</Text>
          <PremiumFeatureList currentTier={currentTier} />
        </View>

        <TouchableOpacity 
          style={styles.manageButton}
          onPress={handleManageSubscription}
        >
          <Ionicons name="settings-outline" size={20} color="#3B82F6" />
          <Text style={styles.manageButtonText}>Manage Subscription</Text>
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Thank you for supporting BookMarx! ❤️
          </Text>
        </View>
      </ScrollView>
    );
  }

  // Show upgrade options for free users
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.title}>Upgrade to Premium</Text>
      </View>

      <View style={styles.heroSection}>
        <View style={styles.heroIcon}>
          <Ionicons name="star" size={48} color="#F59E0B" />
        </View>
        <Text style={styles.heroTitle}>Unlock Full Potential</Text>
        <Text style={styles.heroSubtitle}>
          Get unlimited bookmarks, sync history, rollback, and more.
        </Text>
      </View>

      {stats && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Current Usage</Text>
          <UsageLimitBar 
            current={stats.bookmarkCount} 
            max={stats.limits.maxBookmarks} 
            label="Bookmarks"
            isPremium={false}
          />
          <UsageLimitBar 
            current={stats.browserCount} 
            max={stats.limits.maxBrowsers} 
            label="Connected Browsers"
            isPremium={false}
          />
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Choose a Plan</Text>
        
        {PRICING_PLANS.map((plan) => (
          <TouchableOpacity
            key={plan.id}
            style={[
              styles.planCard,
              selectedPlan === plan.id && styles.planCardSelected,
              plan.popular && styles.planCardPopular,
            ]}
            onPress={() => setSelectedPlan(plan.id)}
          >
            {plan.popular && (
              <View style={styles.popularBadge}>
                <Text style={styles.popularBadgeText}>Most Popular</Text>
              </View>
            )}
            
            <View style={styles.planRadio}>
              <View style={[
                styles.radioOuter,
                selectedPlan === plan.id && styles.radioOuterSelected
              ]}>
                {selectedPlan === plan.id && <View style={styles.radioInner} />}
              </View>
            </View>
            
            <View style={styles.planInfo}>
              <Text style={styles.planName}>{plan.name}</Text>
              {plan.savings && (
                <Text style={styles.planSavings}>{plan.savings}</Text>
              )}
            </View>
            
            <View style={styles.planPricing}>
              <Text style={styles.planPrice}>{plan.price}</Text>
              <Text style={styles.planPeriod}>{plan.period}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>What You Get</Text>
        <PremiumFeatureList currentTier="free" />
      </View>

      <TouchableOpacity 
        style={[styles.upgradeButton, isProcessing && styles.upgradeButtonDisabled]}
        onPress={handleUpgrade}
        disabled={isProcessing}
      >
        {isProcessing ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="star" size={20} color="#fff" />
            <Text style={styles.upgradeButtonText}>
              Upgrade Now
            </Text>
          </>
        )}
      </TouchableOpacity>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Cancel anytime. 30-day money-back guarantee.
        </Text>
        <TouchableOpacity onPress={() => Linking.openURL('https://bookmarx.io/terms')}>
          <Text style={styles.footerLink}>Terms of Service</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    marginRight: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
  },
  heroSection: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#fff',
  },
  heroIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 16,
  },
  currentPlan: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 20,
    borderRadius: 12,
  },
  currentPlanHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  currentPlanLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  renewalDate: {
    fontSize: 14,
    color: '#374151',
  },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  planCardSelected: {
    borderColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
  },
  planCardPopular: {
    position: 'relative',
    overflow: 'visible',
  },
  popularBadge: {
    position: 'absolute',
    top: -10,
    right: 16,
    backgroundColor: '#F59E0B',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  popularBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  planRadio: {
    marginRight: 12,
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioOuterSelected: {
    borderColor: '#3B82F6',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#3B82F6',
  },
  planInfo: {
    flex: 1,
  },
  planName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  planSavings: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '500',
  },
  planPricing: {
    alignItems: 'flex-end',
  },
  planPrice: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
  },
  planPeriod: {
    fontSize: 12,
    color: '#6B7280',
  },
  upgradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F59E0B',
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 16,
    borderRadius: 12,
  },
  upgradeButtonDisabled: {
    opacity: 0.6,
  },
  upgradeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 8,
  },
  manageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  manageButtonText: {
    color: '#3B82F6',
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 8,
  },
  footer: {
    alignItems: 'center',
    padding: 16,
    paddingBottom: 32,
  },
  footerText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 8,
  },
  footerLink: {
    fontSize: 14,
    color: '#3B82F6',
  },
});
