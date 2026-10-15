import AsyncStorage from '@react-native-async-storage/async-storage';

// Serialize writes so a slower, older snapshot cannot overwrite a newer one.
let writes: Promise<void> = Promise.resolve();
export function writeStorage(key: string, value: unknown): Promise<void> {
  const next = writes.then(() => AsyncStorage.setItem(key, JSON.stringify(value)));
  writes = next.catch(() => {});
  return next;
}
