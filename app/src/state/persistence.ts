import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Puzzle, Space } from '@pachu/shared';

/**
 * Persistence schema for `SessionProvider`. Versioned so a contract change
 * (e.g. `Space.summary` gaining a new field) can be migrated or discarded
 * cleanly instead of crashing rehydration on stale data.
 */
const STORAGE_KEY = 'pachu/session/v1';

export interface PersistedSession {
  version: 1;
  spaces: Space[];
  activeSpaceId: string | null;
  activePuzzle: Puzzle | null;
  sessionStartedAt: string | null;
}

const EMPTY: PersistedSession = {
  version: 1,
  spaces: [],
  activeSpaceId: null,
  activePuzzle: null,
  sessionStartedAt: null,
};

/**
 * Rehydrate the persisted session. Returns `null` (not `EMPTY`) when there
 * was nothing stored or the stored blob was unreadable — `null` lets the
 * caller distinguish "first launch" from "stored but empty".
 */
export async function loadPersistedSession(): Promise<PersistedSession | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedSession>;
    if (parsed.version !== 1) return null;
    return {
      version: 1,
      spaces: Array.isArray(parsed.spaces) ? parsed.spaces : [],
      activeSpaceId:
        typeof parsed.activeSpaceId === 'string' ? parsed.activeSpaceId : null,
      activePuzzle:
        parsed.activePuzzle && typeof parsed.activePuzzle === 'object'
          ? (parsed.activePuzzle as Puzzle)
          : null,
      sessionStartedAt:
        typeof parsed.sessionStartedAt === 'string'
          ? parsed.sessionStartedAt
          : null,
    };
  } catch {
    // Storage unreachable (private mode, full disk) — fall through to first-launch.
    return null;
  }
}

/**
 * Persist the session blob. Best-effort: failures are logged in dev and
 * otherwise swallowed so a storage hiccup never crashes the app or blocks a
 * user action that succeeded in memory.
 */
export async function savePersistedSession(blob: Omit<PersistedSession, 'version'>): Promise<void> {
  try {
    const payload: PersistedSession = { version: 1, ...blob };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    if (__DEV__) {
      console.warn('[session] failed to persist:', err);
    }
  }
}

/** Wipe persisted session — used by manual reset or by future cleanup paths. */
export async function clearPersistedSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export { EMPTY as EMPTY_PERSISTED_SESSION };
