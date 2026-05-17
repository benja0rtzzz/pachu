import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { CrosswordPuzzle, ClozePuzzle, FlashcardsPuzzle, Puzzle } from '@pachu/shared';

export interface LocalNotes {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}

interface SessionState {
  notes: LocalNotes[];
  activeNotesId: string | null;
  activePuzzle: Puzzle | null;
}

interface SessionContextValue extends SessionState {
  activeNotes: LocalNotes | null;
  addNotes: (input: { title: string; content: string }) => LocalNotes;
  setActiveNotesId: (id: string) => void;
  setActivePuzzle: (puzzle: Puzzle | null) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function makeId(): string {
  return `notes-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [notes, setNotes] = useState<LocalNotes[]>([]);
  const [activeNotesId, setActiveNotesId] = useState<string | null>(null);
  const [activePuzzle, setActivePuzzle] = useState<Puzzle | null>(null);

  const addNotes = useCallback((input: { title: string; content: string }) => {
    const entry: LocalNotes = {
      id: makeId(),
      title: input.title.trim() || 'Untitled notes',
      content: input.content,
      createdAt: new Date().toISOString(),
    };
    setNotes((prev) => [...prev, entry]);
    setActiveNotesId(entry.id);
    return entry;
  }, []);

  const activeNotes = useMemo(
    () => notes.find((n) => n.id === activeNotesId) ?? null,
    [notes, activeNotesId],
  );

  const value = useMemo<SessionContextValue>(
    () => ({
      notes,
      activeNotesId,
      activeNotes,
      activePuzzle,
      addNotes,
      setActiveNotesId,
      setActivePuzzle,
    }),
    [notes, activeNotesId, activeNotes, activePuzzle, addNotes],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
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
