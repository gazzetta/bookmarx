export const API_BASE_URL = __DEV__ 
  ? 'http://localhost:3005/api/v1' 
  : 'https://bookmarx.gasdigital.co.uk/api/v1';

export const STORAGE_KEYS = {
  AUTH_TOKEN: 'auth_token',
  USER_DATA: 'user_data',
  DEVICE_ID: 'device_id',
} as const;
