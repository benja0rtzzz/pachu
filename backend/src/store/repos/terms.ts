import { randomUUID } from 'node:crypto';
import type { Term } from '@pachu/shared';
import { getDatabase } from '../db.js';

export function insertTerms(
  notesFileId: string,
  items: Array<Omit<Term, 'id' | 'notesFileId'>>,
): Term[] {
  const db = getDatabase();
  const createdAt = new Date().toISOString();
  const inserted: Term[] = [];

  const insert = db.prepare(
    `INSERT INTO terms (id, notes_file_id, term, definition, source_span, style_anchor, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  const run = db.transaction(() => {
    for (const item of items) {
      const id = randomUUID();
      insert.run(
        id,
        notesFileId,
        item.term,
        item.definition,
        item.sourceSpan,
        item.styleAnchor,
        createdAt,
      );
      inserted.push({
        id,
        notesFileId,
        term: item.term,
        definition: item.definition,
        sourceSpan: item.sourceSpan,
        styleAnchor: item.styleAnchor,
      });
    }
  });

  run();

  return inserted;
}

export function listTermsByNotesFile(notesFileId: string): Term[] {
  const db = getDatabase();
  const rows = db
    .query(
      `SELECT id, notes_file_id, term, definition, source_span, style_anchor
       FROM terms WHERE notes_file_id = ? ORDER BY created_at ASC`,
    )
    .all(notesFileId) as Array<{
    id: string;
    notes_file_id: string;
    term: string;
    definition: string;
    source_span: string;
    style_anchor: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    notesFileId: row.notes_file_id,
    term: row.term,
    definition: row.definition,
    sourceSpan: row.source_span,
    styleAnchor: row.style_anchor,
  }));
}

export function getTermById(id: string): Term | null {
  const db = getDatabase();
  const row = db
    .query(
      `SELECT id, notes_file_id, term, definition, source_span, style_anchor
       FROM terms WHERE id = ?`,
    )
    .get(id) as {
    id: string;
    notes_file_id: string;
    term: string;
    definition: string;
    source_span: string;
    style_anchor: string;
  } | null;

  if (!row) return null;

  return {
    id: row.id,
    notesFileId: row.notes_file_id,
    term: row.term,
    definition: row.definition,
    sourceSpan: row.source_span,
    styleAnchor: row.style_anchor,
  };
}

export function getFsrsCardJson(termId: string): string | null {
  const db = getDatabase();
  const row = db
    .query('SELECT fsrs_card_json FROM terms WHERE id = ?')
    .get(termId) as { fsrs_card_json: string | null } | null | undefined;
  return row?.fsrs_card_json ?? null;
}

export function upsertFsrsCardJson(termId: string, cardJson: string): void {
  const db = getDatabase();
  const updatedAt = new Date().toISOString();
  db.run(
    'UPDATE terms SET fsrs_card_json = ?, fsrs_card_updated_at = ? WHERE id = ?',
    [cardJson, updatedAt, termId],
  );
}
