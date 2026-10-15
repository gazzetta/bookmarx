/** Invalidates asynchronous work immediately when the signed-in account changes. */
export interface AccountSession { userId: string | null; generation: number }

let session: AccountSession = { userId: null, generation: 0 };
const listeners = new Set<() => void>();

export const getSession = () => session;
export const isCurrentSession = (snapshot: AccountSession) => snapshot === session;

export function setSessionUser(userId: string | null) {
  if (session.userId === userId) return;
  session = { userId, generation: session.generation + 1 };
  listeners.forEach(listener => listener());
}

export function subscribeSession(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function accountKey(key: string, snapshot = getSession()): string {
  if (!snapshot.userId) throw new Error('Sign in to access your library');
  // Legacy unscoped caches/queues are deliberately not adopted: their owner is unknown.
  return `account:${encodeURIComponent(snapshot.userId)}:${key}`;
}
