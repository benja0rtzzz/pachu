/**
 * Root-aware .env loader. Called for side effects from config.ts.
 *
 * Bun's built-in .env loading is cwd-based and inconsistent in a workspace where the
 * developer may run commands from either the repo root or a workspace directory. This
 * loader walks up from the source file's location until it finds the monorepo root
 * (the package.json that declares `workspaces`) and reads `<root>/.env` into
 * `process.env`, without overwriting variables that are already set.
 *
 * No external dependencies; implementation is intentionally tiny.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

function findMonorepoRoot(start: string): string | null {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    const pkgPath = path.join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { workspaces?: unknown };
        if (pkg.workspaces) return dir;
      } catch {
        // unreadable / invalid JSON — keep climbing
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    let value = line.slice(eq + 1).trim();
    // Strip a single pair of surrounding quotes.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadRootEnv(): void {
  const root = findMonorepoRoot(path.resolve(import.meta.dir, '..'));
  if (!root) return;
  const envPath = path.join(root, '.env');
  if (!existsSync(envPath)) return;
  const parsed = parseDotenv(readFileSync(envPath, 'utf8'));
  for (const [k, v] of Object.entries(parsed)) {
    // Don't overwrite values explicitly set by the shell — they win over .env.
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

loadRootEnv();
