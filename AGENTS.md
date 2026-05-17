# AGENTS.md

> **Read this first.** Single source of truth for every Cursor session and human teammate
> working on Puzzle Forge Coach. Update inline when you finish work or lock in decisions —
> do not spread this information across more files than necessary.

---

## What this project is

A React Native + Expo app backed by a Node/TypeScript orchestrator that embeds existing
libraries (`crossword-layout-generator`, `ts-fsrs`) plus an in-house Cloze engine, all
driven by a **local LLM (Ollama, default `gemma4:26b`)**. The user provides their own notes;
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

Prerequisites: **Bun ≥ 1.1**, **Ollama** (`ollama serve` running, model pulled with
`ollama pull gemma4:26b`), iOS Simulator or Expo Go.

```bash
bun install
bun run dev:backend     # http://localhost:4000  (Express + WS at /coach)
bun run dev:app         # press i for iOS sim, w for web
```

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
- [x] LLM adapter interface + Ollama implementation (gemma4:26b sampling defaults)
- [x] Shared types: `Term`, `Puzzle` union, `HealthResponse`, `CoachEvent`
- [x] Expo app: home screen polls `/health`, shows backend + LLM status

### Person A — Engine / Backend
- [x] `backend/src/store/` — `bun:sqlite` schema + repos (`notes`, `terms` rows include serialized `ts-fsrs` card JSON; reviews, sessions)
- [ ] `backend/src/memory/fsrs.ts` — wrap `ts-fsrs`, expose `review`, `due`, `card` helpers
- [ ] `backend/src/memory/termPicker.ts` — pick N due/weak/new terms for a session
- [ ] `backend/src/memory/stabilityRouter.ts` — per-term `anchored | generated` decision
- [ ] `backend/src/memory/ratingMapper.ts` — puzzle event → FSRS rating 1..4
- [ ] `backend/src/routes/notes.ts` — `POST /notes/ingest` (store raw, no LLM yet)
- [ ] `backend/src/routes/puzzles.ts` — `POST /puzzles/generate`, `POST /puzzles/:id/finish`
- [ ] `backend/src/engines/crossword.ts` — wrap `crossword-layout-generator`
- [ ] `backend/src/engines/cloze/` — sentence splitter, anchored, generated, verifier

### Person B — LLM / Content
- [ ] `backend/src/llm/prompts/extractTerms.ts` — JSON-mode prompt + source-span verifier
- [ ] `backend/src/llm/prompts/clozeSentence.ts` — generated mode w/ styleAnchor mimicry
- [ ] `backend/src/llm/prompts/clueStylist.ts` — crossword clue, mimicking styleAnchor
- [ ] `backend/src/llm/prompts/coach.ts` — tiered hint generation
- [ ] `backend/tests/` — `bun test` fixtures: snapshot prompts, verify schema, sanity checks
- [ ] `docs/demo-notes/japanese-101.md`
- [ ] `docs/demo-notes/calc-2.md`
- [ ] `docs/demo-notes/cardio-clinical.md`

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

- **2026-05-16 — FSRS state on the `terms` row** — Serialized `ts-fsrs` `Card` is stored in `terms.fsrs_card_json` (plus `fsrs_card_updated_at`), not a separate table; one DB row per term for scheduling and content.
- **2026-05-16 — Default LLM is `gemma4:26b`** (MoE, 18GB on disk, ~3.8B active params).
  Faster than dense 31B at near-equal quality, native function calling + system prompts,
  256K context (no chunker needed for term extraction), strong multilingual.
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
- GitHub: https://github.com/benja0rtzzz/pachu
- Local LLM endpoint: `http://localhost:11434/api/chat` (Ollama)
- Backend: `http://localhost:4000`
- WS coach: `ws://localhost:4000/coach`
