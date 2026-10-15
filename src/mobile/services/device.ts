import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { STORAGE_KEYS } from '../constants/config';

let cachedDeviceId: string | null = null;

/**
 * Stable per-install device identity. Used as both X-Device-ID and the
 * browserInstanceId the sync API requires for change attribution.
 */
export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  let id = await SecureStore.getItemAsync(STORAGE_KEYS.DEVICE_ID);
  if (!id) {
    id = `mobile-${Crypto.randomUUID()}`;
    await SecureStore.setItemAsync(STORAGE_KEYS.DEVICE_ID, id);
  }
  cachedDeviceId = id;
  return id;
}
