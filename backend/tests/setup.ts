/**
 * Bun test preload — runs once before any test file is loaded.
 *
 * Sets PACHU_DATA_DIR to a fixed workspace path and immediately imports config so
 * that `config.dataDir` is locked to this value. Test files that set their own
 * PACHU_DATA_DIR after this (e.g. store.test.ts) will not override the already-cached
 * config object, so all test files share a single SQLite instance for the full suite.
 *
 * The DB lives in `backend/data/test/` which is covered by the repo-root .gitignore
 * (`data/` and `*.sqlite` patterns). It persists across runs; individual test files
 * call `clearAllTables()` in `beforeEach` when they need a clean slate.
 *
 * Usage — backend/package.json:
 *   "test": "bun test --preload ./tests/setup.ts --max-concurrency 1"
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const sharedTestDataDir = path.join(testsDir, '../data/test');

mkdirSync(sharedTestDataDir, { recursive: true });
process.env.PACHU_DATA_DIR = sharedTestDataDir;

// Force-import config so config.dataDir is locked to sharedTestDataDir before any
// test file runs. Subsequent process.env.PACHU_DATA_DIR assignments (e.g. in
// store.test.ts) won't affect config.dataDir — the module is already cached.
await import('../src/config.js');

// Open the DB singleton eagerly so the first test that needs it doesn't pay the
// schema-apply cost. This also ensures clozeModeForTerm / getFsrsCardJson can
// run a SELECT without needing their own openDatabase() call.
const { openDatabase } = await import('../src/store/db.js');
openDatabase();
