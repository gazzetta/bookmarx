import { Redirect } from 'expo-router';

/**
 * Legacy /upgrade deep links land on the neutral membership screen — the app
 * never shows prices, checkout links or purchase prompts.
 */
export default function UpgradeRedirect() {
  return <Redirect href="/membership" />;
}
