-- bun:sqlite — foreign keys are off by default; enforced at open time via PRAGMA.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS notes_files (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  byte_length INTEGER NOT NULL CHECK (byte_length >= 0),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS terms (
  id TEXT PRIMARY KEY,
  notes_file_id TEXT NOT NULL REFERENCES notes_files (id) ON DELETE CASCADE,
  term TEXT NOT NULL,
  definition TEXT NOT NULL,
  source_span TEXT NOT NULL,
  style_anchor TEXT NOT NULL,
  created_at TEXT NOT NULL,
  -- ts-fsrs Card JSON (ISO strings for dates). NULL until the memory layer first writes state.
  fsrs_card_json TEXT,
  fsrs_card_updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_terms_notes_file ON terms (notes_file_id);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  notes_file_id TEXT NOT NULL REFERENCES notes_files (id) ON DELETE CASCADE,
  puzzle_kind TEXT NOT NULL CHECK (puzzle_kind IN ('crossword', 'cloze', 'flashcards')),
  started_at TEXT NOT NULL,
  ended_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_notes_file ON sessions (notes_file_id);

CREATE TABLE IF NOT EXISTS review_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  term_id TEXT NOT NULL REFERENCES terms (id) ON DELETE CASCADE,
  session_id TEXT REFERENCES sessions (id) ON DELETE SET NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 4),
  ms INTEGER NOT NULL CHECK (ms >= 0),
  hints_used INTEGER NOT NULL CHECK (hints_used >= 0),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_review_events_term ON review_events (term_id);
CREATE INDEX IF NOT EXISTS idx_review_events_session ON review_events (session_id);

-- In-progress puzzle state. One row per session (puzzle.id === session.id).
-- `puzzle_json` freezes the generated puzzle so a resume returns the exact
-- same items in the exact same order (no runtime regeneration/reorder).
-- `progress_json` is the client's per-term state blob (answers, hint counts).
-- Cascades on session AND notes_file delete, so removing a space wipes it.
CREATE TABLE IF NOT EXISTS puzzle_progress (
  session_id TEXT PRIMARY KEY REFERENCES sessions (id) ON DELETE CASCADE,
  notes_file_id TEXT NOT NULL REFERENCES notes_files (id) ON DELETE CASCADE,
  puzzle_kind TEXT NOT NULL CHECK (puzzle_kind IN ('crossword', 'cloze', 'flashcards')),
  puzzle_json TEXT NOT NULL,
  progress_json TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_puzzle_progress_notes_file ON puzzle_progress (notes_file_id);
