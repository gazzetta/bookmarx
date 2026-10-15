import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { STORAGE_KEYS } from '../constants/config';
import { getSession } from './session';

let cachedDeviceId: string | null = null;
let loadingDeviceId: Promise<string> | null = null;

/**
 * Stable per-install device identity, shared by simultaneous callers.
 */
export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  if (!loadingDeviceId) {
    loadingDeviceId = (async () => {
      let id = await SecureStore.getItemAsync(STORAGE_KEYS.DEVICE_ID);
      if (!id) {
        id = `mobile-${Crypto.randomUUID()}`;
        await SecureStore.setItemAsync(STORAGE_KEYS.DEVICE_ID, id);
      }
      cachedDeviceId = id;
      return id;
    })();
  }
  try { return await loadingDeviceId; }
  finally { loadingDeviceId = null; }
}

/** Browser registrations belong to one account on the server. */
export async function getBrowserInstanceId(session = getSession()): Promise<string> {
  if (!session.userId) throw new Error('Sign in to sync your library');
  return `${await getDeviceId()}.${session.userId}`;
}
