import { randomUUID } from 'node:crypto';
import type { NotesFile } from '@pachu/shared';
import { getDatabase } from '../db.js';

export type NotesFileWithText = NotesFile & { rawText: string };

export function createNotesFile(input: { title: string; rawText: string }): NotesFileWithText {
  const db = getDatabase();
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const byteLength = Buffer.byteLength(input.rawText, 'utf8');

  db.run(
    `INSERT INTO notes_files (id, title, raw_text, byte_length, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, input.title, input.rawText, byteLength, createdAt],
  );

  return {
    id,
    title: input.title,
    createdAt,
    byteLength,
    rawText: input.rawText,
  };
}

export function getNotesFileWithText(id: string): NotesFileWithText | null {
  const db = getDatabase();
  const row = db
    .query('SELECT id, title, raw_text, byte_length, created_at FROM notes_files WHERE id = ?')
    .get(id) as
    | {
        id: string;
        title: string;
        raw_text: string;
        byte_length: number;
        created_at: string;
      }
    | null;

  if (!row) return null;

  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    byteLength: row.byte_length,
    rawText: row.raw_text,
  };
}

export function getNotesFile(id: string): NotesFile | null {
  const db = getDatabase();
  const row = db
    .query('SELECT id, title, byte_length, created_at FROM notes_files WHERE id = ?')
    .get(id) as
    | { id: string; title: string; byte_length: number; created_at: string }
    | null;
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    byteLength: row.byte_length,
    createdAt: row.created_at,
  };
}

export function listNotesFiles(): NotesFile[] {
  const db = getDatabase();
  const rows = db
    .query('SELECT id, title, byte_length, created_at FROM notes_files ORDER BY created_at DESC')
    .all() as Array<{
    id: string;
    title: string;
    byte_length: number;
    created_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    byteLength: row.byte_length,
    createdAt: row.created_at,
  }));
}

/** Rename a notes file (i.e. a `Space`). Returns true iff a row was updated. */
export function updateNotesFileTitle(id: string, title: string): boolean {
  const db = getDatabase();
  const res = db.run('UPDATE notes_files SET title = ? WHERE id = ?', [title, id]);
  return Number(res.changes ?? 0) > 0;
}

/**
 * Delete a notes file (i.e. a `Space`). `terms`, `sessions`, and `review_events` cascade
 * automatically via the FK clauses in schema.sql. Returns true iff a row was deleted.
 */
export function deleteNotesFile(id: string): boolean {
  const db = getDatabase();
  const res = db.run('DELETE FROM notes_files WHERE id = ?', [id]);
  return Number(res.changes ?? 0) > 0;
}
