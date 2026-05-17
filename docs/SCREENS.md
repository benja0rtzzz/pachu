# UI Screens — MVP tracker

> Companion to [`PLAN.md`](./PLAN.md) and [`AGENTS.md`](../AGENTS.md). One section
> per screen with a **MVP checklist** (must-have to call the screen done),
> **stretch additions** (flow/UX improvements not blocking MVP), and **contract
> gaps** (shared types or endpoints the screen depends on that don't exist yet).
>
> Update checkboxes inline as work lands. Add a dated note in the screen's
> "Decisions" subsection when you change scope.

## Domain model

The UI is organized around **spaces**. A `Space` is a persistent container
seeded from a notes file: it owns the raw notes, the extracted terms, the FSRS
state for those terms, all puzzles ever generated from them, and the review
history. Each space has its own independent due-count and progress.

The user enters the app either by **registering new notes** (creates a new
space) or by **exploring existing spaces** (picks one from a list). Inside a
space the user picks a puzzle kind and plays. There is no global "active
session" concept — state belongs to the space.

Types referenced throughout this file (to land in `shared/src/types.ts`):

```ts
export interface Space {
  id: string;                 // === notesFileId
  title: string;
  createdAt: string;
  byteLength: number;
  summary: SpaceSummary;
}

export interface SpaceSummary {
  termCount: number;
  dueCount: number;
  newCount: number;
  stableCount: number;        // terms with FSRS stability ≥ 7d
  lastReviewedAt?: string;
  lastPuzzleKind?: PuzzleKind;

  // NYT-style daily display fields (read-only; generation is still
  // tap-to-generate inside a space, not deterministic-per-day).
  dueToday: number;             // terms due on today's local date
  playedTodayKinds: PuzzleKind[]; // kinds the user has finished today
  streakDays: number;           // consecutive days with ≥ 1 finished puzzle
}
```

Routes use a `space` route with a `spaceId` param for the single-space home
(what used to be `picker`). The `spaces` route is the list. `NotesSwitcher` is
not a deliverable — navigation between spaces happens via the spaces list.

## Screens index

1. [LandingScreen](#landingscreen)
2. [NotesImportScreen](#notesimportscreen)
3. [SpacesScreen](#spacesscreen)
4. [PuzzlePickerScreen](#puzzlepickerscreen)
5. [CrosswordScreen](#crosswordscreen)
6. [ClozeScreen](#clozescreen)
7. [FlashcardsScreen](#flashcardsscreen)
8. [Cross-cutting](#cross-cutting)

---

## LandingScreen

**File:** `app/src/screens/Landing.tsx`
**Purpose:** Entry point. Two CTAs — register new notes (create a space) or
explore existing spaces.

### MVP checklist

- [ ] **Two primary CTAs.**
  - **"Register notes"** → `import` (always enabled).
  - **"Explore my spaces"** → `spaces` (disabled when `spaces.length === 0`,
    with a caption "No spaces yet").
- [ ] **Pre-flight gate** scoped to **"Register notes"** only — that path
  needs the LLM for term extraction, so read `HealthResponse.llm.reachable`
  and disable it inline ("Backend offline — start `bun run dev:backend`")
  when unhealthy. "Explore my spaces" stays enabled on cached spaces even
  when the banner is red, so the user can keep playing offline.
- [ ] **Resume affordance.** If `useSpaces().resumablePuzzle` is non-null,
  render a secondary button **"Resume {kind} in *{spaceTitle}*"** that
  routes to the matching puzzle screen so an accidental back-tap doesn't
  lose in-flight work.

### Stretch additions

- [ ] **Stat strip.** Small row showing "N spaces · M terms · K due today",
  computed client-side by reducing the `Space[]` returned from
  `GET /spaces`. Makes FSRS visible from the very first screen of the demo.

### Contract gaps blocking the above

- `Space` and `SpaceSummary` in `shared/src/types.ts` (defined in the Domain
  model preamble).
- New endpoint `GET /spaces` (Person A) — returns `{ spaces: Space[] }` with
  summaries included.
- No new endpoint required for the pre-flight gate — existing
  `HealthResponse` covers it.

### Decisions

- _2026-05-16 — Pivoted to spaces paradigm. Two CTAs (Register / Explore);
  stat strip derived client-side from `GET /spaces`. Earlier aggregated
  summary endpoint and "Get started / Continue" single-CTA logic dropped._
- _2026-05-16 — Scoped to: MVP checklist + stat strip only. Demo-arc shortcut
  and LLM model chip explicitly dropped from this screen._

---

## NotesImportScreen

**File:** `app/src/screens/NotesImport.tsx`
**Purpose:** Create a new **space** from raw notes (paste / file pick / demo
set). The space owns its terms, FSRS state, puzzles, and review history.

### MVP checklist

- [ ] **Real `POST /notes/ingest` wiring.** Replace the stub in
  `app/src/api/notes.ts` with a fetch to backend, typed against a shared
  `IngestRequest` / `IngestResponse`. The response is `{ space: Space }`;
  the screen reads `space.id` and navigates to `space` with that
  `spaceId`.
- [ ] **Error surface.** Today the `try/finally` swallows errors silently.
  Catch failures, keep the form populated, show an inline error card
  ("Couldn't create the space — try again" / "LLM extraction failed —
  try again") with a retry button. Disable Continue while the error
  banner is visible until the user resubmits.
- [ ] **Min-content guard.** Keep the existing empty-content `canContinue`
  guard and also enforce a minimum length (e.g. ≥ 40 characters). Tier-1
  span-check is meaningless on a one-word note.
- [ ] **Extraction progress feedback.** Real ingest runs the LLM extract
  prompt which is the slow path (~10–30 s on `gemma4:e2b`). Replace the
  silent spinner with a two-step indicator: "Storing notes…" → "Extracting
  terms… (this can take ~30s)". On success show "**Created space with N
  terms**" before routing into the new space.
- [ ] **Demo set = one-tap space creation.** Tapping a demo button now: if
  a space already exists for that demo title, open it; otherwise create
  it. Avoids the demo list duplicating spaces from repeated taps. A
  single tap performs the load + ingest + navigate.
- [ ] **Header copy.** Title becomes **"New space"**; Continue button label
  becomes **"Create space"**.

### Stretch additions

- [ ] **Replace-vs-append prompt** when the textarea already has content and
  the user taps a demo button: confirm "Replace current notes?" instead of
  silently overwriting.
- [ ] **Auto-title from first heading.** If pasted content starts with
  `# Something`, prefill `title` with `Something`. Today only the file
  picker prefills title.

### Contract gaps blocking the above

- `IngestRequest { title: string; content: string }` in
  `shared/src/types.ts`.
- `IngestResponse { space: Space }` in `shared/src/types.ts` (replaces the
  earlier `{ notesFile; termCount }` shape — `termCount` is now on
  `space.summary`).
- `Space` / `SpaceSummary` — already in preamble.
- No new endpoints — `POST /notes/ingest` is already in AGENTS as Person
  A's TODO.

### Decisions

- _2026-05-16 — Reframed as space creation. Response shape is now
  `{ space }`; success routes to `space` with the new `spaceId`._
- _2026-05-16 — Scoped to: MVP checklist + auto-title + replace-prompt
  stretch items. Term-preview-before-commit explicitly dropped._

---

## SpacesScreen

**File:** `app/src/screens/Spaces.tsx`
**Purpose:** List every space the user owns. Primary navigation hub once the
user has more than one space; also the home for delete/rename operations.
Rows are formatted NYT-style — today's due count, streak, per-kind status —
even though generation inside a space stays tap-to-generate.

### MVP checklist

- [ ] **List from `GET /spaces`.** Each row shows:
  - **Title.**
  - **Today line:** `"Today: K cards due"` when `dueToday > 0` and not all
    kinds have been played today; `"All caught up"` when `dueToday === 0`;
    `"K cards due"` (no "Today") when there are due cards but none for
    today specifically.
  - **Streak chip:** `"Streak: N days"` with a small flame icon when
    `streakDays > 0`.
  - **Three per-kind status badges** below the row (Crossword / Cloze /
    Flashcards), each colored by status: **ready** = accent (tap to play),
    **done** = success + checkmark (already finished today, derived from
    `playedTodayKinds.includes(kind)`), **unavailable** = muted (no due
    terms for that kind right now).
- [ ] **Sort order.** Spaces with `dueToday > 0` and not-yet-all-done-today
  float to the top; then `streakDays` descending; then `lastReviewedAt`
  descending. One fixed sort for MVP — no user-facing toggle.
- [ ] **Tap row → `space` route** with that `spaceId` and stamp it as
  `activeSpaceId` in session state so back-navigation behaves predictably.
- [ ] **Header right action: "+ New space"** → `import`. Mirrors Landing's
  "Register notes" CTA from inside the list.
- [ ] **Empty state.** When `spaces.length === 0`: large illustration text
  "No spaces yet" + a primary "Register notes" CTA → `import`. Covers
  deep-link / refresh cases (Landing already disables the path when empty).
- [ ] **Delete affordance.** Long-press row → action sheet with "Delete
  space" (confirm modal: "This deletes terms, FSRS history, and all
  puzzles. Cannot be undone."). Calls `DELETE /spaces/:id`, then refreshes
  the list.
- [ ] **Rename affordance.** Same action sheet, "Rename space" → inline
  editable title with save/cancel. Calls `PATCH /spaces/:id`. Useful
  because file-picker imports often arrive with title `untitled-1` until
  renamed.
- [ ] **Pull-to-refresh** re-fetches `GET /spaces` so the daily/FSRS summary
  refreshes after finishing a puzzle inside another space.
- [ ] **Error surface.** Same pattern as the puzzle screens: inline error
  card + retry on list-fetch failure; on delete/rename failure show a
  toast and revert the optimistic UI update.

### Stretch additions

- [ ] **Per-space progress sparkline.** Tiny inline bar showing
  `dueToday / termCount` (or `done / 3` for today's kinds). Zero new
  contract surface; pure derivation.
- [ ] **Filter chips** (**Today** / **Due soon** / **Caught up**) above
  the list. Useful once a demo user has 6+ spaces.
- [ ] **Bulk delete mode.** Long-press to enter selection mode,
  multi-delete. Stretch because most users won't have that many spaces
  during the demo.
- [ ] **Search by title.** Trivial filter input above the list; matters
  only past ~10 spaces.

### Contract gaps blocking the above

- `GET /spaces` → `{ spaces: Space[] }`. Person A.
- `DELETE /spaces/:id`. Person A.
- `PATCH /spaces/:id` with body `{ title: string }`. Person A.
- `Space` / `SpaceSummary` (including the daily fields `dueToday`,
  `playedTodayKinds`, `streakDays`) — defined in the Domain model preamble.

### Decisions

- _2026-05-16 — Created as part of the spaces-paradigm pivot. Holds delete
  and rename — first surface that mutates a space._
- _2026-05-16 — Daily-due display scoped to SpacesScreen only. Generation
  inside a space remains tap-to-generate (no NYT-style deterministic
  per-day puzzle endpoint for MVP)._
- _2026-05-16 — Scoped to: MVP checklist + all four stretch items
  (sparkline, filter chips, bulk delete, search)._

---

## PuzzlePickerScreen

**File:** `app/src/screens/PuzzlePicker.tsx` (kept under the existing
filename for now; the route name is `space`)
**Purpose:** Home screen for a single space. Shows the space's notes preview
and summary, plus three puzzle launchers. Reached from `SpacesScreen` or
directly after creating a space.

### MVP checklist

- [ ] **Read `spaceId` from the route**, fetch the space via
  `GET /spaces/:id`. Drop the previous "active notes from session" model.
  If the space isn't found (deleted on another tab, stale deep-link),
  show a "Space not found" state with a "Back to spaces" CTA.
- [ ] **Real `POST /puzzles/generate`** wiring with the revised request
  shape `GeneratePuzzleRequest { kind: PuzzleKind; spaceId: string; targetCount? }`.
  Response remains the existing `Puzzle` union.
- [ ] **Error surface.** Inline error card + retry on generation failure,
  keeping the screen state and selected space intact. Mirrors the
  NotesImport pattern.
- [ ] **Per-puzzle loader stays scoped + disabled state.** `loadingKind`
  already scopes the spinner; add explicit
  `accessibilityState={{ disabled: true }}` on inactive rows during
  generation so the disabled state is visible to assistive tech.
- [ ] **"About this space" card** replaces the previous "Active notes"
  card. Same fields (title, char count, 3-line preview) plus a
  `SpaceSummary` chip rendering "**{termCount} terms · {dueCount} due ·
  {dueToday} today**". This is the FSRS-visibility surface inside a space
  (fail two cards → come back here → see `dueCount` and `dueToday` jump).
- [ ] **Empty-terms guard.** If `summary.termCount === 0`, disable the
  three puzzle rows and show "Extraction is still running for this
  space — try again in a moment" with a refresh button. Prevents
  generating an empty puzzle immediately after ingest.
- [ ] **Per-kind status row** mirrors `SpacesScreen`'s badges: each puzzle
  option shows **ready** / **done today** / **no due cards**. Tapping a
  "done today" row still works but with a small subtitle ("You've
  already played a {kind} session today") — doesn't block, just informs.
- [ ] **Footer changes from "Change notes" → "← Back to spaces"**
  routing to `spaces`. The footer also gets a small caption "Streak:
  N days" when `summary.streakDays > 0` so the FSRS context follows the
  user inside the space.

### Stretch additions

- [ ] **Cloze-mode preview** on the Cloze row using `summary.stableCount`
  (terms with stability ≥ 7 d): "mostly anchored" vs "generated unlocked".
  Makes the StabilityRouter's decision visible before the user even taps.
- [ ] **Last-played indicator** per puzzle kind, sourced from
  `summary.lastPuzzleKind` + `summary.lastReviewedAt` on the server (was
  previously a local session log). Cheaper and survives reloads.
- [ ] **Recommended badge** on whichever kind has the most due terms
  ("Recommended — 4 cards due"). Soft nudge, not a hard rule.

### Contract gaps blocking the above

- `GeneratePuzzleRequest { kind: PuzzleKind; spaceId: string; targetCount?: number }`
  in `shared/src/types.ts` (replaces the earlier `notesId` variant).
- `GET /spaces/:id` → `Space` (Person A — already implied by
  `SpacesScreen`).
- `Space` / `SpaceSummary` — preamble.
- **Removed from this screen's deps:** the earlier `NotesSummary` type and
  `GET /notes/:id/summary` endpoint (superseded) and the `NotesSwitcher`
  component (entirely dropped).

### Decisions

- _2026-05-16 — Reframed as the per-space home. Route `space(:spaceId)`,
  generation keyed on `spaceId`, NotesSwitcher requirement removed,
  "Change notes" footer replaced by "Back to spaces"._
- _2026-05-16 — Scoped to: MVP checklist + all three stretch items
  (Cloze-mode preview, last-played indicator, recommended badge)._

---

## CrosswordScreen

**File:** `app/src/screens/Crossword.tsx`
**Purpose:** Play a `CrosswordPuzzle` and report per-term performance back to
FSRS via the finish endpoint, while consuming live coach hints over WS.

### MVP checklist

- [ ] **Per-term review tracking.** Track `startedAt`, `attempts`,
  `hintsUsed`, and final `correct`/`revealed` per `termId`. These feed
  `ratingMapper.mapCrossword({ hintsUsed, revealed, ms })` exactly as
  PLAN.md specifies. Without this, FSRS gets nothing from the screen.
- [ ] **Finish call.** On "Done", build `Review[]` from per-term state and
  `POST /puzzles/:id/finish`. The button currently only navigates. Uses
  a shared `SessionFinishRequest` / `SessionFinishResponse`. The response
  carries an optional refreshed `Space` so the space-home picker shows
  updated due/streak counts without a follow-up fetch.
- [ ] **Hint button + Coach wiring.** Add a "Hint" button on the
  selected-clue card. On tap, send `CoachClientMessage.hint_request` over
  the WS coach client; render the returned `CoachEvent.hint` in an inline
  `CoachOverlay`. Increment `hintsUsed[termId]`. (Overlay component is a
  Cross-cutting deliverable; this screen mounts it.)
- [ ] **Mistake reporting.** When the user submits a wrong answer for a
  clue, fire `CoachClientMessage.mistake` so the backend can stream a
  coach nudge. Increments local `attempts[termId]`.
- [ ] **Per-clue submit, not bulk check.** Replace "Check answers" with a
  per-clue "Submit" button on the selected-clue card. Bulk verification on
  Done can stay as the final tally, but bulk-only hides which clue failed
  and prevents per-attempt mistake events.
- [ ] **Reveal button per clue.** Setting `revealed=true` for that termId
  produces rating 1 ("Again") via the mapper. Today users have no surrender
  option other than guessing forever.
- [ ] **Empty-puzzle guard.** If `puzzle.entries.length === 0`, show
  "Couldn't build a crossword from these terms" with a "Try again" button
  calling generate against `puzzle.spaceId`. The current "No puzzle
  loaded" state only handles `activePuzzle === null`, not an empty
  `entries` array.
- [ ] **Back-navigation goes to the space.** Header back button and the
  "Done — back to **space**" footer route to `space(puzzle.spaceId)`,
  not the generic picker.

### Stretch additions

- [ ] **Wrong-cell shake / red flash** on per-clue submit failure. Cheap,
  big perceived-quality bump.
- [ ] **Coach overlay history.** Keep the last 3 hints visible as a stacked
  card list, not just the latest, so judges can see tier-1 → tier-2 →
  tier-3 escalation in one shot.

### Contract gaps blocking the above

- `SessionFinishRequest { puzzleId: string; reviews: Review[]; sessionStartedAt: string }`
  and `SessionFinishResponse { acceptedCount: number; nextDueAt?: string; space?: Space }`
  in `shared/src/types.ts`. The optional `space` lets the screen pass an
  already-fresh `Space` back to the space-home picker on Done.
- Add `spaceId: string` to `CrosswordPuzzle` (and the other two puzzle
  variants — see Cloze and Flashcards) so back-navigation works without
  consulting session state.
- `Hint { tier: 1 | 2 | 3; kind?: 'nudge' | 'pattern' | 'definition'; text: string }`
  — promote the `hint` payload inside `CoachEvent` to its own type so the
  overlay can style each tier. PLAN.md's coach prompt already separates
  LLM nudge / deterministic structural / definition tiers.
- WS client (`app/src/api/ws.ts`) and `CoachOverlay` component delivered by
  the Cross-cutting section.
- New endpoint `POST /puzzles/:id/finish` (Person A — already in AGENTS
  TODO).

### Decisions

- _2026-05-16 — Scoped to: MVP checklist + wrong-cell shake + coach
  overlay history. Direct-cell typing and cross-letter shading explicitly
  dropped from MVP._
- _2026-05-16 — Adapted to spaces paradigm. Back-navigation routes to
  `space(puzzle.spaceId)`; `SessionFinishResponse.space?` returns the
  refreshed summary; `CrosswordPuzzle` gains a `spaceId` field._

---

## ClozeScreen

**File:** `app/src/screens/Cloze.tsx`
**Purpose:** Play a `ClozePuzzle` — fill-in-the-blank cards drawn either
verbatim from the user's notes (`anchored`) or LLM-generated and grounded
(`generated`) — and feed per-item performance back to FSRS.

### MVP checklist

- [ ] **`[MASK]` rendering.** Standardize on `[MASK]` (the contract/prompt
  token); add a `MASK_TOKEN = '[MASK]'` constant in `shared` and render
  it as a styled fixed-width pill showing the answer length. Update
  `MOCK_CLOZE` to use `[MASK]` so mocks and real data agree.
- [ ] **Hide the source chunk by default.** It currently leaks the answer.
  Put behind a "Show source" toggle, either gated behind tapping Reveal
  first or counted as a hint that influences the rating.
- [ ] **Per-item review tracking.** `startedAt`, `attempts`, `hintsUsed`,
  `correct`, `revealed` per `termId`. Feeds
  `ratingMapper.mapCloze({ correct, attempts, hintsUsed })`.
- [ ] **Explicit Submit button.** Replace auto-detect-on-typing with a
  Submit action; on submit show success (mapper-rated) or count an
  attempt and clear input. Cap at 3 attempts before forcing Reveal so
  the user always advances.
- [ ] **Hint button + Coach wiring.** WS `hint_request` → render returned
  `CoachEvent.hint` via `CoachOverlay` → increment `hintsUsed[termId]`.
  Tier-1 hint can be deterministic (letter-count + first letter, per
  PLAN.md's coach prompt).
- [ ] **Mode badge visible.** `item.mode` is currently buried in the
  subtitle. Promote to a small chip ("Anchored" / "Generated") next to
  the sentence so the anchored → generated flip between demo rounds is
  obvious.
- [ ] **Finish call.** On the last card or via a new "End session" footer
  button, build `Review[]` and `POST /puzzles/:id/finish`. The response
  optionally carries a refreshed `Space` so the space-home picker shows
  updated due/streak counts without a follow-up fetch.
- [ ] **Empty-puzzle guard.** Existing `items.length === 0` branch stays,
  but route to `space(puzzle.spaceId)` with a regen prompt instead of a
  dead "Back to picker" button.
- [ ] **Back-navigation goes to the space.** Header back button routes to
  `space(puzzle.spaceId)`, not the generic picker.

### Stretch additions

- [ ] **"Regenerated for you" badge** when an item flipped from
  `anchored` (last session) to `generated` (this session). Lands the
  transfer-learning point of the demo.
- [ ] **Per-card progress bar** in the header in place of the "Card N of
  M" text.
- [ ] **Auto-focus the input** on card change so the user doesn't have to
  tap the field for every card.
- [ ] **Robust auto-uppercase.** `autoCapitalize="characters"` fights some
  Android keyboards / autocomplete; apply uppercasing on the value layer
  too so the displayed text is always uppercase regardless of IME.

### Contract gaps blocking the above

- `MASK_TOKEN` constant exported from `shared/src/index.ts`.
- `Hint` type (shared with Crossword — see that section).
- `SessionFinishRequest` / `SessionFinishResponse` (shared with Crossword,
  including the optional `space?: Space` refresh field).
- Extend `ClozeItem` with `previousMode?: 'anchored' | 'generated'` so the
  "Regenerated for you" badge can detect transitions without app-side
  bookkeeping.
- Add `spaceId: string` to `ClozePuzzle` so back-navigation works without
  consulting session state.
- WS client + `CoachOverlay` from Cross-cutting.

### Decisions

- _2026-05-16 — Scoped to: MVP checklist + all four stretch items,
  including the `ClozeItem.previousMode` contract extension._
- _2026-05-16 — Adapted to spaces paradigm. Back-navigation routes to
  `space(puzzle.spaceId)`; `SessionFinishResponse.space?` returns the
  refreshed summary; `ClozePuzzle` gains a `spaceId` field._

---

## FlashcardsScreen

**File:** `app/src/screens/Flashcards.tsx`
**Purpose:** Direct FSRS review — the only screen where the user produces a
`Rating` themselves rather than having one derived by the rating mapper.

### MVP checklist

- [ ] **Stop discarding ratings.** `rate(rating)` is the only place in the
  whole app where the user directly produces a `Rating`; today it's
  dropped on the floor. Persist `{ termId, rating, ms, hintsUsed: 0 }`
  per card.
- [ ] **Per-card timer.** Capture `cardShownAt` on flip and compute
  `ms = Date.now() - cardShownAt` on rate. Already in the `Review`
  contract; trivial to add.
- [ ] **Finish call.** On the last card, build `Review[]` and
  `POST /puzzles/:id/finish` before navigating to `space(puzzle.spaceId)`.
  Today it just navigates. The response optionally carries a refreshed
  `Space` so the space-home picker shows updated due/streak counts
  without a follow-up fetch.
- [ ] **Empty-puzzle guard.** Existing `items.length === 0` branch stays;
  routes to `space(puzzle.spaceId)` with a regen prompt instead of the
  current dead "Back to picker" button.
- [ ] **Back-navigation goes to the space.** Header back button routes to
  `space(puzzle.spaceId)`.
- [ ] **Disable rating buttons until flipped.** Already enforced by the
  conditional render — keep, but add an `accessibilityHint` so the path
  is clear.
- [ ] **End-of-deck summary.** Before navigating away, show a one-line
  tally with space context: "10 cards · 7 good · 2 hard · 1 again — next
  due in *{spaceTitle}*: tomorrow" using `SessionFinishResponse.nextDueAt`
  and the embedded `space.title`. This is the screen's payoff and the
  cheapest "FSRS works" demo evidence.

### Stretch additions

- [ ] **Swipe gestures** on the card for Hard/Good (left/right). Speeds
  the demo and feels native.
- [ ] **Self-grade confidence preview.** Before flipping, let the user
  pre-mark "I know it" / "I don't" to short-circuit obvious cards (still
  maps to a rating, just without revealing the back).
- [ ] **Persistent front-font sizing.** Long fronts overflow the fixed
  200-min-height card. Auto-shrink or wrap with scroll-on-overflow.
- [ ] **Keyboard shortcuts on web** (1/2/3/4 → Again/Hard/Good/Easy).
  Free, since web is a supported target.

### Contract gaps blocking the above

- `SessionFinishRequest` / `SessionFinishResponse` (shared with Crossword
  and Cloze, including the optional `space?: Space` refresh field).
- Add `spaceId: string` to `FlashcardsPuzzle` so back-navigation works
  without consulting session state.

### Decisions

- _2026-05-16 — Scoped to: MVP checklist + all four stretch items._
- _2026-05-16 — Adapted to spaces paradigm. Back-navigation routes to
  `space(puzzle.spaceId)`; end-of-deck summary names the space;
  `FlashcardsPuzzle` gains a `spaceId` field._

---

## Cross-cutting

Deliverables that don't live in a single screen but unblock multiple screens.
Everything here was referenced as a dependency under the screen sections above.

### MVP checklist

- [ ] **WS coach client (`app/src/api/ws.ts`).** Connect to
  `ws://<API>/coach`, auto-reconnect with exponential backoff, expose a
  `useCoach()` hook returning
  `{ events: CoachEvent[]; send: (msg: CoachClientMessage) => void; status: 'connecting' | 'open' | 'closed' }`.
  Handle `hello`, `pong`, `mistake`, `hint`. Consumed by Crossword + Cloze.
- [ ] **`CoachOverlay` component (`app/src/components/CoachOverlay.tsx`).**
  Renders the latest `CoachEvent.hint` (or a stack of the last 3 per the
  Crossword stretch). Slides up from the bottom of the puzzle screen.
  Knows nothing about which screen it's on; just consumes `useCoach()`.
- [ ] **`useSpaces()` hook in `state/session.tsx`.** Replaces the previous
  notes-flavored API. Exposes:

  ```ts
  {
    spaces: Space[];
    activeSpaceId: string | null;
    activeSpace: Space | null;
    resumablePuzzle: { kind: PuzzleKind; puzzleId: string; spaceId: string } | null;
    refreshSpaces(): Promise<void>;
    refreshSpace(id: string): Promise<void>;
    createSpace(input: IngestRequest): Promise<Space>;
    renameSpace(id: string, title: string): Promise<void>;
    deleteSpace(id: string): Promise<void>;
    setActiveSpaceId(id: string | null): void;
    setActivePuzzle(puzzle: Puzzle | null): void;
  }
  ```

  Internally replaces `notes: LocalNotes[]` with `spaces: Space[]`,
  `activeNotesId` with `activeSpaceId`, and removes the `LocalNotes`
  interface entirely.
- [ ] **`finishPuzzle` hook in `state/session.tsx`.** Takes `Review[]`,
  `puzzleId`, and `sessionStartedAt`; POSTs to `/puzzles/:id/finish`;
  clears `activePuzzle`; updates the cached `Space` for that `spaceId`
  using `SessionFinishResponse.space?` when present, falling back to a
  follow-up `refreshSpace(spaceId)` otherwise. Called by Crossword, Cloze,
  Flashcards.
- [ ] **Persist spaces list across reloads.** Use `AsyncStorage`
  (`@react-native-async-storage/async-storage`, which falls through to
  `localStorage` on web) to save `spaces[]`, `activeSpaceId`, and any
  unfinished `activePuzzle`. Save after every mutating call
  (`createSpace`, `renameSpace`, `deleteSpace`, `refreshSpace`,
  `finishPuzzle`). Rehydrate on `SessionProvider` mount. Promoted to MVP
  because spaces are first-class persistent data — a refresh must not
  wipe the user's library.
- [ ] **Toast / banner surface.** Today errors are silent or use
  `Alert.alert`. Add a one-line toast at the bottom of `Screen` for
  transient errors (network failure, finish failure, LLM timeout) so the
  user always knows what just happened.
- [ ] **Shared API client helpers.** Centralize `fetch` retry + JSON
  parse + error mapping so each screen doesn't reinvent it.
  `app/src/api/client.ts` already exists for health; extend it to cover
  `POST /notes/ingest`, `POST /puzzles/generate`, `POST /puzzles/:id/finish`,
  `GET /spaces`, `GET /spaces/:id`, `DELETE /spaces/:id`, and
  `PATCH /spaces/:id`.
- [ ] **`SessionStartedAt` plumbing.** Each puzzle screen needs the
  timestamp at which generation completed, for the `ms` field on
  `Review`. Stamp it inside `setActivePuzzle` and expose it on the
  session hook.

### Stretch additions

- [ ] **In-app log viewer / debug drawer.** A long-press on the
  `HealthBanner` opens a panel showing the last 20 `CoachEvent`s and last
  5 HTTP requests/responses. Invaluable during the demo when something
  looks weird and you have ten seconds to diagnose.
- [ ] **Animated transitions between screens.** `RootNavigator`
  currently swaps with no animation. A fade/slide via
  `react-native-reanimated` reads as polish for ~30 min of work.

### Contract gaps blocking the above

- `SessionFinishRequest` / `SessionFinishResponse` (with the optional
  `space?: Space` refresh field) — already listed under the puzzle
  screens.
- `Hint` type promotion inside `CoachEvent` — already listed under
  Crossword.
- `Space`, `SpaceSummary` — defined in the Domain model preamble.
- `GeneratePuzzleRequest` (now `spaceId`-keyed), `IngestRequest`,
  `IngestResponse { space }` — already listed under their respective
  screens.
- `GET /spaces`, `GET /spaces/:id`, `DELETE /spaces/:id`,
  `PATCH /spaces/:id` — already listed under `SpacesScreen` /
  `PuzzlePickerScreen`.
- No new backend endpoints beyond what the screen sections already
  require.

### Decisions

- _2026-05-16 — Adapted to spaces paradigm. `useSpaces()` introduced
  (replaces the previous notes-flavored session API); `NotesSwitcher` and
  the global register-switch command dropped entirely; session
  persistence promoted to MVP because spaces are persistent data._
- _2026-05-16 — Scoped to: MVP checklist + debug drawer + animated
  transitions. NotesSwitcher and global register-switch explicitly
  removed (not just demoted) under the spaces paradigm._
