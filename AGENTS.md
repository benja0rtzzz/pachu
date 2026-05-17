# AGENTS.md

> **Read this first.** Single source of truth for every Cursor session and human teammate
> working on Puzzle Forge Coach. Update inline when you finish work or lock in decisions —
> do not spread this information across more files than necessary.

---

## What this project is

A React Native + Expo app backed by a Node/TypeScript orchestrator that embeds existing
libraries (`crossword-layout-generator`, `ts-fsrs`) plus an in-house Cloze engine, all
driven by a **local LLM (Ollama, default `gemma4:e2b`)**. The user provides their own notes;
the system extracts terms, schedules them with FSRS, and generates puzzles whose register
mimics the source notes.

**Three puzzle types share one adaptive memory model:**

- **Crossword** — clues generated to match the notes' register
- **Cloze** (fill-in-the-blank) — anchored mode (verbatim from notes) for fragile cards,
  generated mode (LLM mimics the term's `styleAnchor`, with a grounding verifier) for solid cards
- **Flashcards** — direct FSRS reviews

**The single design philosophy:** *Math (FSRS) decides what to teach. The LLM decides how to
present it. The user's notes are the source of truth — the LLM never invents content.*

For the full architecture, diagrams, and rationale: **[`docs/PLAN.md`](docs/PLAN.md)**.

---

## Repo layout & ownership

```
pachu/
  app/        # React Native + Expo                       — owned by Person C (App)
  backend/    # Node 20 + TypeScript + Express + ws       — owned by Person A (Engine)
    src/
      engines/, memory/, store/, routes/, ws/             — A
      llm/                                                 — owned by Person B (LLM/Content)
  shared/     # cross-cutting TypeScript types            — A owns; B/C contribute via PR
  docs/
    PLAN.md         # full architecture doc
    demo-notes/     # seed notes for the demo            — owned by B
  AGENTS.md   # this file — everyone updates inline
```

The only true cross-team coupling is `shared/types.ts`. Touch it carefully.

---

## How to run

Prerequisites: **Bun ≥ 1.1**, **Ollama** (`ollama serve` running with a model pulled —
see `backend/.env.example` for tested options), iOS Simulator or Expo Go.

```bash
bun install
cp .env.example .env                   # at repo root; edit OLLAMA_MODEL etc.
bun run dev:backend                    # http://localhost:4000  (Express + WS at /coach)
bun run dev:app                        # press i for iOS sim, w for web
```

All LLM-related configuration (model, base URL, timeout) is read from `.env` at the
repo root. There are no hardcoded model tags in the code; missing env vars throw a
clear error. The backend's config loader walks up from its source dir to find the root
.env, so it works from any cwd.

The app's home screen pings `/health` every 5s and shows backend + LLM status. If it's red,
something's wrong before you write any code.

**Phone over LAN:** set `EXPO_PUBLIC_API_BASE_URL=http://<laptop-ip>:4000` before
`bun run dev:app`.

---

## Conventions

- **Branches**: `<area>/<feature>` — `backend/notes-ingest`, `llm/extract-prompt`,
  `app/cloze-screen`, `shared/<thing>`. Avoid working on `main` directly.
- **Commits**: short imperative subject, optional body. No emojis in code or commit messages.
- **PRs**: small, single-purpose, mergeable. Self-review before requesting review.
- **TypeScript**: strict mode is on. No `any` without a comment explaining why.
- **No comments that narrate code** (e.g. `// increment counter`). Only comments that
  explain *why* — non-obvious intent, trade-offs, constraints.
- **Anti-hallucination is sacred** — see PLAN.md "Anti-hallucination contract (two tiers)".
  Every term must have a verified `sourceSpan`. Every generated cloze must pass the
  grounding verifier. Both are enforced in code, not in prompts.
- **No personas, no difficulty knob.** Register comes from `styleAnchor` (the original
  sentence the term appeared in). Difficulty is FSRS-driven. If you're tempted to add a
  user-facing slider, push back.

---

## Live progress board

> Update inline when you start (`[ ]` → `[~]`) or finish (`[~]` → `[x]`). Keep it tight.

### Done
- [x] Monorepo scaffold (workspaces: shared, backend, app)
- [x] Backend: Express + ws skeleton, `/health` endpoint, `/coach` WS placeholder
- [x] LLM adapter interface + Ollama implementation (gemma4 sampling defaults)
- [x] Shared types: `Term`, `Puzzle` union, `HealthResponse`, `CoachEvent`
- [x] Expo app: home screen polls `/health`, shows backend + LLM status
- [x] Person B vertical complete: anti-hallucination verifiers, all four LLM prompts,
      demo notes for three registers, 25 unit tests + 5 live LLM smoke tests

### Person A — Engine / Backend
- [x] `backend/src/store/` — `bun:sqlite` schema + repos (`notes`, `terms` rows include serialized `ts-fsrs` card JSON; reviews, sessions)
- [x] `backend/src/memory/fsrs.ts` — wraps `ts-fsrs`; `getCardForTerm` / `reviewTerm` / `isDue` / `getStabilityDays`, JSON persisted on `terms`
- [x] `backend/src/memory/termPicker.ts` — pick N due/weak/new terms for a session
- [x] `backend/src/memory/stabilityRouter.ts` — per-term `anchored | generated` decision
- [x] `backend/src/memory/ratingMapper.ts` — puzzle event → FSRS rating 1..4
- [x] `backend/src/routes/notes.ts` — `POST /notes/ingest` stores raw text only (no LLM); `GET /notes/:id` (internal)
- [x] `backend/src/memory/spaceSummary.ts` — computes `SpaceSummary` (termCount, dueCount, newCount, stableCount, dueToday, playedTodayKinds, streakDays)
- [x] `backend/src/routes/spaces.ts` — `GET /spaces`, `GET /spaces/:id`, `PATCH /spaces/:id`, `DELETE /spaces/:id` (cascade via FK)
- [x] `backend/src/routes/puzzles.ts` — `POST /puzzles/generate`, `POST /puzzles/:id/finish`
- [x] `backend/src/engines/crossword.ts` — wrap `crossword-layout-generator` (+ local `.d.ts` shim; package added to `backend/package.json` deps — run `bun install`)
- [x] `backend/src/engines/cloze/` — sentence splitter, anchored, generated; reuses Person B's `clozeSentence` (verifier built in) with silent fallback

### Person B — LLM / Content
- [x] `backend/src/llm/verify/spanCheck.ts` — span verifier (anti-hallucination tier 1)
- [x] `backend/src/llm/verify/grounding.ts` — entity-extracting grounding verifier (tier 2)
- [x] `backend/src/llm/prompts/extractTerms.ts` — JSON-mode prompt + verified candidate output
- [x] `backend/src/llm/prompts/clozeSentence.ts` — styleAnchor mimicry + grounding fallback
- [x] `backend/src/llm/prompts/clueStylist.ts` — crossword clue mimicking styleAnchor
- [x] `backend/src/llm/prompts/coach.ts` — tiered hints (LLM nudge + deterministic pattern + definition)
- [x] `backend/tests/spanCheck.test.ts` — 10 unit tests, all green
- [x] `backend/tests/grounding.test.ts` — 10 unit tests, all green
- [x] `backend/tests/coach.test.ts` — 5 unit tests for the deterministic structural hint
- [x] `backend/tests/extractTerms.live.test.ts` — live LLM smoke test (opt-in via `LLM_LIVE=1`)
- [x] `backend/tests/clozeSentence.live.test.ts` — live LLM smoke test (opt-in via `LLM_LIVE=1`)
- [x] `docs/demo-notes/japanese-101.md` — casual learning register
- [x] `docs/demo-notes/calc-2.md` — formal academic register
- [x] `docs/demo-notes/cardio-clinical.md` — terse clinical register
- [x] `docs/demo-notes/history-cold-war.md` — proper-noun + date stress for grounding verifier
- [x] `docs/demo-notes/typescript-generics.md` — code blocks + jargon
- [x] `docs/demo-notes/solar-system-kids.md` — kid-simple register

### Person C — App / UX
- [ ] Theme tokens (extract from `App.tsx`) + `app/src/theme.ts`
- [ ] Navigation (Expo Router or simple state-based router)
- [ ] `app/src/screens/NotesImport.tsx` — paste textarea + file pick
- [ ] `app/src/screens/PuzzlePicker.tsx` — select notes + puzzle type
- [ ] `app/src/screens/Crossword.tsx` — Grid + ClueList components, mock data first
- [ ] `app/src/screens/Cloze.tsx` — masked sentence + answer entry
- [ ] `app/src/screens/Flashcards.tsx` — front/back + Again/Hard/Good/Easy buttons
- [ ] `app/src/components/NotesSwitcher.tsx` — the demo-cycle component
- [ ] `app/src/api/ws.ts` — coach WS client w/ reconnect

### Stretch
- [ ] Connections-style grouping puzzle (16 terms, 4 categories)
- [ ] PDF notes ingest
- [ ] Speech / listening practice (Whisper + system TTS)
- [ ] Multilingual eval harness

---

## Decisions log

> Append-only. Short. The *why*, not the what. Newest at top.

- **2026-05-16 — `puzzle.id === session.id`; puzzles are not persisted.** The
 store has no `puzzles` table; a session row created at `/puzzles/generate`
 doubles as the puzzle's identity, and the engine output is sent to the client
 and forgotten. `/puzzles/:id/finish` only needs the per-term `Review[]` the
 client sends back (FSRS state lives on the term row), so persisting the
 puzzle JSON would be dead weight. The route also requires that the body's
 `puzzleId` (when present) matches the URL `:id`, which makes regenerated /
 stale puzzles fail closed instead of silently re-applying reviews to a wrong
 session. Cross-space contamination is blocked the same way: each `Review`
 whose `termId` doesn't belong to the session's `notesFileId` is dropped from
 `acceptedCount`, not 4xx'd — clients can fire-and-forget.
- **2026-05-16 — Cloze engine never throws on verifier failure.** The contract
 from PLAN.md says generated mode falls back to anchored silently; this is
 enforced at the engine boundary (`engines/cloze/index.ts`), not at the route.
 Any failure path inside generated mode (LLM throw, missing `[MASK]`, ungrounded
 entity) builds an anchored ClozeItem for that single item. The puzzle as a
 whole always has `items.length === terms.length`, regardless of LLM weather.
- **2026-05-16 — Term picker buckets are `due | weak | stable`, ordered by
 most-overdue / weakest-stability / soonest-upcoming within each bucket.**
 Unreviewed terms land at the top of `due` (FSRS treats them as due-now). The
 weak bucket exists so a user with no overdue cards still gets stress on the
 fragile terms instead of pure repetition of stable ones. The picker truncates
 to the requested count but never pads — a space with 3 terms returns 3 picks
 even when the caller asks for 8.
- **2026-05-16 — Spaces paradigm adopted; `Space.id === notes_files.id`.**
  Driven by [`docs/SCREENS.md`](docs/SCREENS.md). The DB row is still
  `notes_files`; there is no separate `spaces` table. A `Space` is `NotesFile`
  metadata + a computed `SpaceSummary` (term counts, due counts, FSRS-derived
  stable count, today-line, streak). Summaries are computed on every read —
  staleness costs more than the microseconds we'd save by caching. Server-local
  time is used for the daily/streak fields; revisit when remote access lands.
- **2026-05-16 — Wire-contract refresh for the spaces paradigm.**
  `POST /notes/ingest` body is now `IngestRequest { title, content }` (was
  `{ title, rawText }`); response is `IngestResponse { space }` (was the raw
  `NotesFile`). `Hint` promoted out of `CoachEvent.hint` so each tier can be
  styled in the overlay. `spaceId` added to all three puzzle variants.
  `previousMode?` added to `ClozeItem` for the "Regenerated for you" badge.
  `MASK_TOKEN` constant added to `shared` so the prompt, the engine, and the
  screen all agree on the exact string. New `/spaces` CRUD (`GET`, `GET /:id`,
  `PATCH /:id`, `DELETE /:id`); the old `GET /notes` listing is superseded and
  removed. CORS preflight widened to `PATCH, DELETE`.
- **2026-05-16 — Design tokens live in `shared/src/design/palette.ts`.** Two-tier
  system: `@pachu/shared` exports raw pigment tokens (rust, ember, amber, mauve,
  stone, plum, plus derived warm-dark shades void/ink/shadow/wine/mulberry/bone,
  plus off-palette sage for `success`). `app/src/theme.ts` is now a thin
  semantic-role mapper that imports `palette` — no hex codes in app code. Add new
  colors to the palette, not inline. Backend can consume the same palette for
  future styled outputs (status reports, PDF exports).
- **2026-05-16 — `memory/fsrs.ts` is the only owner of `terms.fsrs_card_json`.**
  Nothing else in the codebase parses or constructs that blob. Serialization is plain
  `JSON.stringify(card)` (Date#toJSON gives ISO-8601), deserialization just revives `due`
  and `last_review`. This survives a future `ts-fsrs` minor that adds a numeric field
  without us editing the wrapper. `getCardForTerm` is read-only: a fresh `createEmptyCard`
  is returned for unreviewed terms but NOT written back, so the term picker can scan all
  terms cheaply without dirtying the store.
- **2026-05-16 — `POST /notes/ingest` is LLM-free.** It stores `{title, rawText}` and
  returns a `NotesFile` (no body). Extraction will be a separate call once Person B's
  `extractTerms` is wired through the orchestrator. Decoupling ingest from extraction
  means the app can ship the import screen and the engine can read notes for puzzle
  generation even when Ollama is down.
- **2026-05-16 — Prompt revamp + corpus expansion.** All four LLM prompts (extract,
  cloze, clue, coach) now include contrastive good/bad examples inline. Small models
  like `gemma4:e2b` follow contrastive demonstrations more reliably than abstract rules.
  Demo corpus grew from 3 → 6 notes (added Cold War history, TypeScript generics,
  solar-system-for-kids) to stress proper-noun density, code blocks, and the low end of
  the register spectrum. The live extract test runs all 6 parametrically; filter via
  `bun test -t <name>`.
- **2026-05-16 — All LLM config is env-first, loaded from repo root.** Model tag,
  Ollama URL, and timeout live in `<repo-root>/.env` (template in `.env.example`).
  `backend/src/env.ts` walks up to find the monorepo root and loads that .env into
  process.env regardless of cwd, so `bun test` from anywhere just works. Code has no
  hardcoded model strings; `OllamaAdapter` throws a clear error if env is missing.
- **2026-05-16 — Default LLM locked to `gemma4:e2b`** (7.2GB, 128K context, Effective 2B).
  After live testing both e4b and qwen3.5:9b, e2b proved fast enough for the live demo
  loop and the prompt-engineering work compensates for the smaller model's lower ceiling.
  Larger gemma4 models (26b MoE) produced empty content under `format: 'json'` and were
  too slow on M4 Pro for live demo (~86s/call).
- **2026-05-16 — Drop Ollama's `format: 'json'` constraint.** Forcing strict JSON mode
  on gemma4 conflicts with its channel/thinking tokens and causes empty responses. We
  ask for JSON in the prompt and our parsers handle fenced or raw JSON output.
- **2026-05-16 — Sampling defaults follow gemma4 spec** (temperature=1.0, top_p=0.95,
  top_k=64). Lower temperatures empirically cause gemma4 to collapse to empty output.
- **2026-05-16 — Bun, not npm.** Native TS, faster install, `bun:sqlite` is built-in
  (no `better-sqlite3` native build). Replaces both runtime and package manager.
- **2026-05-16 — No personas, no difficulty knob.** Register inherited from notes via
  `styleAnchor` (source-mimicry). Difficulty entirely FSRS-driven. Persona switcher was
  theatrical; the honest demo arc is *swap notes file → watch puzzles adapt*.
- **2026-05-16 — Cloze hybrid mode.** Anchored (verbatim) for stability < 7d, generated
  (LLM-styled, grounded + verified) for stability ≥ 7d. Falls back to anchored on
  verifier failure. Stops the "memorize the sentence shape" failure mode.
- **2026-05-16 — Drop word search.** Measures visual scanning agility, not knowledge —
  would pollute FSRS ratings. Replaced by Cloze, which is knowledge-pure and uses notes
  as source of truth. (Word search may return as an FSRS-read-only warmup mode, stretch.)
- **2026-05-16 — FSRS only, not full Anki backend.** `ts-fsrs` is the algorithm without
  the Anki ecosystem (no decks, no sync, no .apkg). Local, no account.
- **2026-05-16 — Two-tier anti-hallucination contract.** Tier 1: terms must have a literal
  `sourceSpan` substring of the notes. Tier 2: generated cloze sentences must not introduce
  proper nouns / dates / numbers absent from the source chunk. Both enforced in code, not
  in prompts. PLAN.md has the full contract.

---

## Things NOT to do

- Don't add a difficulty toggle or persona selector to the UI. We deliberately removed them.
- Don't bypass the source-span check when extracting terms. The "user's notes are the source
  of truth" guarantee is the project's whole credibility.
- Don't bypass the grounding verifier on generated cloze sentences. Silent fallback to
  anchored mode is correct; surfacing a hallucinated sentence is not.
- Don't add a cloud LLM call path before we ship the local one. Stretch only.
- Don't reach for `npm` or `pnpm`. We use `bun`.
- Don't commit anything from `data/` (SQLite files), `.env`, or pulled `node_modules/`.
- Don't make the LLM choose terms or pick which cards are "due". That's FSRS's job.

---

## Quick links

- Architecture & rationale: [`docs/PLAN.md`](docs/PLAN.md)
- Backend API surface (wire shapes): [`docs/API.md`](docs/API.md)
- GitHub: https://github.com/benja0rtzzz/pachu
- Local LLM endpoint: `http://localhost:11434/api/chat` (Ollama)
- Backend: `http://localhost:4000`
- WS coach: `ws://localhost:4000/coach`
