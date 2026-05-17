import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Database } from 'bun:sqlite';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db: Database | null = null;

export function openDatabase(): Database {
  if (db) return db;

  mkdirSync(config.dataDir, { recursive: true });
  const dbPath = path.join(config.dataDir, 'pachu.sqlite');

  const database = new Database(dbPath, { create: true });
  database.run('PRAGMA foreign_keys = ON');
  database.run('PRAGMA journal_mode = WAL');

  const schemaSql = readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  database.exec(schemaSql);

  migrateStore(database);

  db = database;
  return database;
}

type ColumnInfo = { name: string };

function migrateStore(database: Database): void {
  const termCols = database
    .query('PRAGMA table_info(terms)')
    .all() as ColumnInfo[];
  const names = new Set(termCols.map((c) => c.name));

  if (!names.has('fsrs_card_json')) {
    database.run('ALTER TABLE terms ADD COLUMN fsrs_card_json TEXT');
  }
  if (!names.has('fsrs_card_updated_at')) {
    database.run('ALTER TABLE terms ADD COLUMN fsrs_card_updated_at TEXT');
  }

  const legacy = database
    .query(
      "SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'term_fsrs_cards'",
    )
    .get() as { ok: number } | null;
  if (!legacy) return;

  database.run(`
    UPDATE terms
    SET
      fsrs_card_json = (SELECT card_json FROM term_fsrs_cards tfc WHERE tfc.term_id = terms.id),
      fsrs_card_updated_at = (SELECT updated_at FROM term_fsrs_cards tfc WHERE tfc.term_id = terms.id)
    WHERE EXISTS (SELECT 1 FROM term_fsrs_cards tfc WHERE tfc.term_id = terms.id)
  `);
  database.run('DROP TABLE term_fsrs_cards');
}

export function getDatabase(): Database {
  return openDatabase();
}

/** Closes the singleton handle (e.g. tests resetting the DB file on disk). */
export function closeDatabase(): void {
  if (!db) return;
  db.close(true);
  db = null;
}
