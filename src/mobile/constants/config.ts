import { Platform } from 'react-native';

// Dev: Android emulator reaches host via 10.0.2.2; iOS sim / Expo Go on device
// should set EXPO_PUBLIC_API_URL to the machine's LAN address, e.g.
// EXPO_PUBLIC_API_URL=http://192.168.1.50:3005/api/v1 npx expo start
const DEV_API_URL =
  Platform.OS === 'android'
    ? 'http://10.0.2.2:3005/api/v1'
    : 'http://localhost:3005/api/v1';

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || (__DEV__ ? DEV_API_URL : 'https://www.bookmarx.cc/api/v1');

export const WEBSITE_URL = 'https://www.bookmarx.cc';

export const STORAGE_KEYS = {
  AUTH_TOKEN: 'auth_token',
  USER_DATA: 'user_data',
  DEVICE_ID: 'device_id',
  ACTIVE_COLLECTION: 'active_collection',
  COLLECTION_CACHE_PREFIX: 'collection_cache_',
  SYNC_QUEUE: 'sync_queue',
  LAST_FETCH_PREFIX: 'last_fetch_',
} as const;
