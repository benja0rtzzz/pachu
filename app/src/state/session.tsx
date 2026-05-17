import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type {
  ClozePuzzle,
  CrosswordPuzzle,
  FlashcardsPuzzle,
  IngestRequest,
  Puzzle,
  Review,
  SessionFinishResponse,
  Space,
} from '@pachu/shared';
import {
  deleteSpace as apiDeleteSpace,
  extractSpaceTerms,
  getSpace,
  listSpaces,
  renameSpace as apiRenameSpace,
} from '../api/spaces';
import { ingestNotes } from '../api/notes';
import { finishPuzzle as apiFinishPuzzle } from '../api/puzzles';
import { loadPersistedSession, savePersistedSession } from './persistence';


interface SessionState {
  activePuzzle: Puzzle | null;
  sessionStartedAt: string | null;
  spaces: Space[];
  spacesLoading: boolean;
  spacesError: string | null;
  activeSpaceId: string | null;
}

interface SessionContextValue extends SessionState {
  activeSpace: Space | null;
  setActivePuzzle: (puzzle: Puzzle | null) => void;
  setActiveSpaceId: (id: string | null) => void;
  refreshSpaces: () => Promise<void>;
  refreshSpace: (id: string) => Promise<Space | null>;
  createSpace: (input: IngestRequest) => Promise<Space>;
  extractTerms: (id: string) => Promise<Space>;
  renameSpace: (id: string, title: string) => Promise<void>;
  deleteSpace: (id: string) => Promise<void>;
  finishActivePuzzle: (reviews: Review[]) => Promise<SessionFinishResponse | null>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [activePuzzle, setActivePuzzleState] = useState<Puzzle | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState<string | null>(null);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [spacesLoading, setSpacesLoading] = useState<boolean>(true);
  const [spacesError, setSpacesError] = useState<string | null>(null);
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);
  // Hydration: gate the first persistence write on a successful rehydrate so
  // we don't overwrite cached state with the initial empty values mid-boot.
  const [hydrated, setHydrated] = useState(false);

  // Stamp `sessionStartedAt` whenever a fresh puzzle is loaded. Used as the
  // baseline for `Review.ms` and as the `sessionStartedAt` field on the
  // finish request — both per the shared `SessionFinishRequest` contract.
  const setActivePuzzle = useCallback((puzzle: Puzzle | null) => {
    setActivePuzzleState(puzzle);
    setSessionStartedAt(puzzle ? new Date().toISOString() : null);
  }, []);

  const refreshSpaces = useCallback(async () => {
    setSpacesLoading(true);
    setSpacesError(null);
    try {
      const next = await listSpaces();
      setSpaces(next);
    } catch (err) {
      setSpacesError((err as Error).message);
    } finally {
      setSpacesLoading(false);
    }
  }, []);

  const mergeSpace = useCallback((next: Space) => {
    setSpaces((prev) => {
      const idx = prev.findIndex((s) => s.id === next.id);
      if (idx === -1) return [next, ...prev];
      const copy = prev.slice();
      copy[idx] = next;
      return copy;
    });
  }, []);

  const refreshSpace = useCallback(
    async (id: string) => {
      try {
        const space = await getSpace(id);
        mergeSpace(space);
        return space;
      } catch (err) {
        setSpacesError((err as Error).message);
        return null;
      }
    },
    [mergeSpace],
  );

  const createSpace = useCallback(
    async (input: IngestRequest) => {
      const { space } = await ingestNotes(input);
      mergeSpace(space);
      setActiveSpaceId(space.id);
      return space;
    },
    [mergeSpace],
  );

  const extractTerms = useCallback(
    async (id: string) => {
      const { space } = await extractSpaceTerms(id);
      mergeSpace(space);
      return space;
    },
    [mergeSpace],
  );

  const renameSpace = useCallback(
    async (id: string, title: string) => {
      // Optimistic update: patch the title locally so the action sheet
      // animation feels instant. On failure, fall back to the server copy
      // by `refreshSpace`.
      let previous: Space | undefined;
      setSpaces((prev) =>
        prev.map((s) => {
          if (s.id !== id) return s;
          previous = s;
          return { ...s, title };
        }),
      );
      try {
        const updated = await apiRenameSpace(id, title);
        mergeSpace(updated);
      } catch (err) {
        if (previous) mergeSpace(previous);
        throw err;
      }
    },
    [mergeSpace],
  );

  const deleteSpace = useCallback(
    async (id: string) => {
      // Optimistic remove; restore on failure.
      let removed: Space | undefined;
      setSpaces((prev) => {
        removed = prev.find((s) => s.id === id);
        return prev.filter((s) => s.id !== id);
      });
      try {
        await apiDeleteSpace(id);
        if (activeSpaceId === id) setActiveSpaceId(null);
        // Drop any in-flight puzzle for this space too, otherwise the Landing
        // "Resume" link still points at — and reopens — a deleted game.
        if (activePuzzle?.spaceId === id) setActivePuzzle(null);
      } catch (err) {
        if (removed) setSpaces((prev) => [removed!, ...prev]);
        throw err;
      }
    },
    [activeSpaceId, activePuzzle, setActivePuzzle],
  );

  const finishActivePuzzle = useCallback(
    async (reviews: Review[]) => {
      if (!activePuzzle || !sessionStartedAt) return null;
      const puzzleId = activePuzzle.id;
      const spaceId = activePuzzle.spaceId;
      try {
        const response = await apiFinishPuzzle(puzzleId, {
          puzzleId,
          reviews,
          sessionStartedAt,
        });
        if (response.space) {
          mergeSpace(response.space);
        } else {
          await refreshSpace(spaceId);
        }
        setActivePuzzle(null);
        return response;
      } catch (err) {
        // Surface as a thrown error; caller decides whether to retain the
        // active puzzle for a retry or clear it.
        throw err;
      }
    },
    [activePuzzle, sessionStartedAt, mergeSpace, refreshSpace, setActivePuzzle],
  );

  // Rehydrate persisted session on mount, then kick off a background refresh
  // so cached space summaries get reconciled with the server. Cached data
  // shows immediately; the network update is opportunistic.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cached = await loadPersistedSession();
      if (cancelled) return;
      if (cached) {
        if (cached.spaces.length > 0) setSpaces(cached.spaces);
        if (cached.activeSpaceId) setActiveSpaceId(cached.activeSpaceId);
        if (cached.activePuzzle) setActivePuzzleState(cached.activePuzzle);
        if (cached.sessionStartedAt) setSessionStartedAt(cached.sessionStartedAt);
        // Mark loading false so the UI can render cached spaces immediately;
        // refreshSpaces() flips it back to true while the fetch runs.
        setSpacesLoading(false);
      }
      setHydrated(true);
      void refreshSpaces();
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshSpaces]);

  // Persist whenever the durable slice changes. Skipped until hydration
  // completes so a fresh-boot empty state can't clobber stored data.
  useEffect(() => {
    if (!hydrated) return;
    void savePersistedSession({
      spaces,
      activeSpaceId,
      activePuzzle,
      sessionStartedAt,
    });
  }, [hydrated, spaces, activeSpaceId, activePuzzle, sessionStartedAt]);

  const activeSpace = useMemo(
    () => spaces.find((s) => s.id === activeSpaceId) ?? null,
    [spaces, activeSpaceId],
  );

  const value = useMemo<SessionContextValue>(
    () => ({
      activePuzzle,
      sessionStartedAt,
      spaces,
      spacesLoading,
      spacesError,
      activeSpaceId,
      activeSpace,
      setActivePuzzle,
      setActiveSpaceId,
      refreshSpaces,
      refreshSpace,
      createSpace,
      extractTerms,
      renameSpace,
      deleteSpace,
      finishActivePuzzle,
    }),
    [
      activePuzzle,
      sessionStartedAt,
      spaces,
      spacesLoading,
      spacesError,
      activeSpaceId,
      activeSpace,
      setActivePuzzle,
      refreshSpaces,
      refreshSpace,
      createSpace,
      extractTerms,
      renameSpace,
      deleteSpace,
      finishActivePuzzle,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}

/**
 * Spaces-flavoured slice of the session. Phase 2 screens consume this
 * instead of `useSession` directly; the spread surface here is the
 * `useSpaces()` contract called out under Cross-cutting in
 * `docs/SCREENS.md`.
 */
export function useSpaces() {
  const {
    spaces,
    spacesLoading,
    spacesError,
    activeSpaceId,
    activeSpace,
    setActiveSpaceId,
    setActivePuzzle,
    refreshSpaces,
    refreshSpace,
    createSpace,
    extractTerms,
    renameSpace,
    deleteSpace,
  } = useSession();

  return {
    spaces,
    loading: spacesLoading,
    error: spacesError,
    activeSpaceId,
    activeSpace,
    setActiveSpaceId,
    setActivePuzzle,
    refreshSpaces,
    refreshSpace,
    createSpace,
    extractTerms,
    renameSpace,
    deleteSpace,
  } as const;
}

export function isCrosswordPuzzle(p: Puzzle): p is CrosswordPuzzle {
  return p.kind === 'crossword';
}

export function isClozePuzzle(p: Puzzle): p is ClozePuzzle {
  return p.kind === 'cloze';
}

export function isFlashcardsPuzzle(p: Puzzle): p is FlashcardsPuzzle {
  return p.kind === 'flashcards';
}
