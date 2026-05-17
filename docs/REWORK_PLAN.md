# Implementation Plan — Puzzle Forge Coach rework

> Translates the HTML/React-DOM blueprint in `app/screens/*` into the
> React Native app under `app/src/screens/*`, while completing the unchecked
> MVP items from [`SCREENS.md`](./SCREENS.md). Source of truth for the
> in-flight visual + contract rework.

## Confirmed scope
- **Palette:** Replace `shared/src/design/palette.ts` tokens wholesale with the PFC set; remove warm tokens. `app/src/theme.ts` re-points semantic roles at the new tokens.
- **Fonts:** Add `@expo-google-fonts/manrope` + `@expo-google-fonts/bricolage-grotesque`, load via `useFonts` in `App.tsx`, expose `fonts.ui` / `fonts.display` from `theme.ts`.
- **DitherField:** Port to `@shopify/react-native-skia` with the same noise+pulse algorithm.
- **MVP:** Visual rework *and* unchecked SCREENS.md MVP items per screen.

## Blueprint → RN mapping

| Blueprint (in `app/screens/`) | RN target (in `app/src/screens/`) | Route |
|---|---|---|
| `LandingScreen` (`screens.jsx`) | `Landing.tsx` | `landing` |
| `NotesImportScreen` (`screens.jsx`) | `NotesImport.tsx` | `import` |
| `SpacesScreen` (`screens.jsx`) | `Spaces.tsx` | `spaces` |
| `PuzzlePickerScreen` (`screens.jsx`) | `PuzzlePicker.tsx` | `picker` → renamed to `space(:spaceId)` |
| `CrosswordScreen` (`puzzles.jsx`) | `Crossword.tsx` | `crossword` |
| `ClozeScreen` (`puzzles.jsx`) | `Cloze.tsx` | `cloze` |
| `FlashcardsScreen` (`puzzles.jsx`) | `Flashcards.tsx` | `flashcards` |

Cross-cutting blueprint pieces → RN equivalents:

| Blueprint | RN target |
|---|---|
| `dither-field.jsx` | `app/src/components/DitherField.tsx` (Skia) |
| `ScreenShell`, `TopBar`, `PrimaryButton`, `SecondaryButton`, `GhostLink` | `components/{ScreenShell,TopBar,PrimaryButton,SecondaryButton,GhostLink}.tsx` |
| `ProgressBar`, `PuzzleShell` | `components/{ProgressBar,PuzzleShell}.tsx` |
| `ModeIcon` | `components/ModeIcon.tsx` (react-native-svg) |
| Design tokens (`PFC`, `--pfc-ui`, `--pfc-display`) | Re-themed `shared/src/design/palette.ts` + `app/src/theme.ts` |
| `ios-frame.jsx`, `tweaks-panel.jsx`, `app.jsx` | **Not ported** — dev-only prototype chrome |

---

## Phase 0 — Foundation ✅ **COMPLETE**

> Landed on `fronten` branch. `bun run typecheck` green across `shared`,
> `backend`, `app`. Legacy semantic keys preserved so Phase 2 can swap
> screens one at a time without breaking the build.

### 0.1 Dependencies ✅
Installed via `npx expo install` (SDK 54-compatible versions pinned):

| Package | Version | Purpose |
|---|---|---|
| `@shopify/react-native-skia` | `2.2.12` | DitherField canvas port (Phase 1.1) |
| `expo-font` | `~14.0.11` | `useFonts` hook for the font loader |
| `@expo-google-fonts/manrope` | `0.4.2` | UI font asset bundle |
| `@expo-google-fonts/bricolage-grotesque` | `0.4.1` | Display font asset bundle |
| `@react-native-async-storage/async-storage` | `2.2.0` | Session persistence (Phase 4) |
| `react-native-svg` | `15.12.1` | `ModeIcon`, `TopBar` chevrons, etc. |

Locations: `app/package.json` (deps), root `bun.lock` (resolved tree).

### 0.2 Palette rewrite ✅ — `shared/src/design/palette.ts`
- Tokens replaced wholesale; warm scale (rust/ember/amber/mauve/stone/plum/noir/void/ink/shadow/wine/mulberry/bone) **removed**.
- New tokens: `blue`, `ink`, `ink70`, `ink55`, `ink40`, `ink25`, `ink10`, `ink06`, `surface`, `hairline`, `sage`.
- `shared/src/index.ts` re-export untouched (still `export * from './design/palette'`).
- All direct `palette.*` references outside `theme.ts` cleaned up — only `Landing.tsx` had two (`palette.rust` → `colors.accent`, `palette.noir` → `colors.bg`).

### 0.3 Theme rewrite ✅ — `app/src/theme.ts`
- `colors` re-derived from PFC tokens; legacy keys (`bg`, `surface`, `surfaceElevated`, `cell`, `cellBlock`, `cellActive`, `cellHighlight`, `accentHot`) preserved as aliases so the 14 consumer files keep compiling. New keys added: `textOnAccent`, `subtle`, `borderStrong`, `overlay`.
- `fonts = { ui: {regular,medium,semibold,bold}, display: {regular,medium,semibold,bold} }` — values are the weight-suffixed family names emitted by the google-fonts packages.
- `radii` scale added (`xxs:4, xs:8, sm:12, md:14, lg:18, xl:20, xxl:22, card:24, pill:99`). Legacy `radius.sm|md|lg` aliased onto `radii.xs|sm|lg` for back-compat.
- `shadows` (RN-shaped: `shadowColor/Offset/Opacity/Radius/elevation`) added with `card / hero / button / pill` presets matching the blueprint box-shadows.
- `typography` expanded: `hero:56, display:32, title:28, heading:20, subheading:17, body:16, bodySm:14, caption:12, micro:11, eyebrow:10.5`.
- `sharedStyles` re-pointed at new fonts/radii (display-font screen title, Manrope-bold uppercase labels with `letterSpacing: 1.4`).

### 0.4 Font loader ✅ — `app/App.tsx`
- `useFonts({ Manrope_400Regular..700Bold, BricolageGrotesque_400Regular..700Bold })` gates the tree; returns blank `<View>` (using `colors.bg`) until loaded.
- `StatusBar` flipped from `light` → `dark` to suit the new white surface.

### 0.5 Landing.tsx palette de-leak ✅
- Removed `import { palette }` from `app/src/screens/Landing.tsx`.
- `tintColor={palette.rust}` → `tintColor={colors.accent}` (logo on landing).
- `backgroundColor: palette.noir` → `backgroundColor: colors.bg`.
- The screen will be fully re-skinned in Phase 2.1; this is the minimum to keep the build green after the wholesale palette swap.

### 0.6 Smoke check ✅
- `bun run typecheck` — exit 0 for `@pachu/shared`, `@pachu/backend`, `@pachu/app`.
- No runtime check yet (dev server not started); first runtime smoke happens after Phase 1 primitives land.

---

## Phase 1 — Shared primitives ✅ **COMPLETE**

> Landed on `fronten` branch. `bun run typecheck` green across all three
> workspaces. Legacy `Screen.tsx` / `Grid.tsx` / `ClueList.tsx` still in
> place and untouched — Phase 2 screens consume the new primitives;
> legacy ones keep working through the back-compat aliases in `theme.ts`
> and the preserved `PrimaryButton.variant` API.

### 1.0 Reanimated peer + Babel plugin ✅
Skia v2 animation primitives are driven through Reanimated. Adding
Reanimated here also unblocks the Phase 2.7 flashcard flip.

| Package | Version | Notes |
|---|---|---|
| `react-native-reanimated` | `4.1.7` | Installed via `expo install` (SDK 54-compatible). |
| `react-native-worklets` | `0.5.1` | Required peer for Reanimated v4. Installed via `expo install`. |

New file: `app/babel.config.js` — adds `react-native-worklets/plugin` to
the existing `babel-preset-expo` preset (the plugin must be last in the
`plugins` array, per Reanimated's docs).

### 1.1 DitherField ✅ — `app/src/components/DitherField.tsx`
- Skia `<Canvas>` + `<Picture>` driven by `createPicture` re-recorded each frame inside a `useDerivedValue` worklet.
- `useFrameCallback` advances a shared-value `t` accumulator (scaled by `speed`).
- Same multi-sine noise (`Math.sin(x*0.018 + t*0.27) * Math.cos(y*0.022 - t*0.21)` etc.) and pulse formula as the JS reference.
- Per-intensity config preserved verbatim (`hero / medium / low`: `base, amp, opacity, max`).
- Gradient masks (`none / top / bottom / radial`) translated 1:1.
- Width/height tracked via shared values updated from `onLayout`; `pointerEvents="none"` so the canvas never steals taps.

### 1.2 TopBar ✅ — `app/src/components/TopBar.tsx`
- `<Pressable>` back chevron rendered via `react-native-svg` (`Svg` + `Path`).
- Centered title using `fonts.display.semibold`, letter-spacing tuned to match the blueprint.
- Right-slot accepts any `ReactNode` (used by `PuzzleShell` for the overflow menu, by `SpacesScreen` for the `+` create-space button in Phase 2.3).
- Top padding uses `useSafeAreaInsets().top`, floored to `spacing.lg` so the bar doesn't collapse on devices that report 0 inset (web).

### 1.3 Buttons ✅ — `app/src/components/PrimaryButton.tsx`
- File rewritten in place — same path, expanded exports: `PrimaryButton`, `SecondaryButton`, `GhostLink`.
- **Back-compat:** `PrimaryButton` still accepts `variant: 'primary' | 'secondary' | 'ghost'` and delegates to the relevant component when used by legacy screens (Spaces, NotesImport, PuzzlePicker, etc.). Phase 2 code should reach for the dedicated `SecondaryButton` / `GhostLink` exports.
- Primary: `colors.accent` background + `shadows.button` glow + `colors.textOnAccent` label.
- Secondary: white background + 1px `colors.borderStrong` border + ink label.
- GhostLink: transparent, blue 14.5px label, no padding chrome — used for inline "Input raw text instead →" affordances.
- All three honor `full`, `disabled`, `loading`, `leading` (icon slot), `style` overrides.

### 1.4 ScreenShell ✅ — `app/src/components/ScreenShell.tsx`
- White full-bleed flex column.
- `dither` prop: `false` (default — flat surface) or `{ intensity, gradient, speed, gridSize, color }` to render a `DitherField` behind the children via `pointerEvents="none"`.
- Phase 2 screens build directly inside `<ScreenShell>`; the legacy `Screen.tsx` wrapper stays around (untouched) until each screen migrates.

### 1.5 ProgressBar + PuzzleShell ✅ — `app/src/components/ProgressBar.tsx`, `PuzzleShell.tsx`
- `ProgressBar`: 4px track (`palette.ink06`) with `colors.accent` fill, optional `color` override, `value/max` tabular-nums label (hideable via `hideLabel`).
- `PuzzleShell`: `ScreenShell` w/ `intensity="medium"`, `gradient="radial"` + `TopBar` whose right-slot renders a three-dot menu button (`react-native-svg` `Circle`s). Crossword / Cloze / Flashcards in Phase 2 mount inside this.

### 1.6 ModeIcon ✅ — `app/src/components/ModeIcon.tsx`
- `react-native-svg` ports of the three blueprint icons.
- `kind: 'cross' | 'cloze' | 'cards'`, `color`, optional `size` (defaults to 28). Shared stroke object keeps `strokeWidth: 1.6`, round caps/joins consistent across all three.

---

## Phase 2 — Per-screen rework ✅ **COMPLETE**

> All seven screens rebuilt against the blueprint + backend contracts on the
> `fronten` branch. `bun run typecheck` green across all three workspaces.
> Each (V) is restyle-against-blueprint; each (M) is a SCREENS.md MVP item.
> Items marked **DEFERRED** stayed out of scope and were rolled forward to
> Phase 4 — see the deferred-list at the bottom of this section.

### 2.1 `Landing.tsx` ✅
- **V** ✅ Hero half: 52% height `View` with absolute-positioned `DitherField intensity="hero" gradient="bottom"`, wordmark "Puzzle / Forge / **Coach**" (Bricolage 56, line-height 0.92, letter-spacing -2). Status-bar guard overlay sits above the dither so the wordmark stays readable on devices with notches.
- **V** ✅ Action half: copy paragraph (Manrope 16/23) + Primary `New space` with `+` SVG `leading` icon + Secondary `My spaces · N` (disabled when N=0).
- **M** ✅ Health-gate disables `New space` and shows `Backend offline — start bun run dev:backend` when `/health` returns unreachable.
- **M** ✅ Resume affordance — `GhostLink` "Resume {kind} in {spaceTitle}" appears under the buttons when `useSpaces().resumablePuzzle` is non-null.
- **M** ✅ Stat strip ("N spaces · M terms · K due today") rendered below the copy paragraph, derived client-side from `useSpaces().spaces`.

### 2.2 `NotesImport.tsx` ✅
- **V** ✅ Ambient low radial dither, `TopBar title="New space"`, display-font h2 "What are we learning?", dashed-border drop zone with the upload-icon bubble + "Drop your notes here / or tap to browse / pdf · docx · md · txt" copy, file pill list (ext badge + filename + KB size + remove `×`), "Input raw text instead →" `GhostLink` toggling to a 220px-min textarea.
- **V** ✅ Footer Primary `Create space` with a soft white-gradient guard above it (RN-friendly flat overlay since RN has no built-in linear-gradient).
- **V** ✅ Expo `DocumentPicker` wired to the drop-zone press (drop-actual is web-only; native taps the underlying picker).
- **M** ✅ `POST /notes/ingest` via the new `api/notes.ts`, response `{ space }` cached via `createSpace` (also stamps `activeSpaceId`).
- **M** ✅ **Chained `POST /spaces/:id/extract`** after ingest. Two-step progress UI: `Storing notes…` (ingest) → `Extracting terms… (this can take ~30s)` (extract). On extract 422 → inline error card "Couldn't find enough to extract from these notes — try a richer source" with an "Open space anyway" recovery affordance. On 409 → navigate straight into the space.
- **M** ✅ Min-content guard (≥ 40 characters); inline hint shown when notes are shorter.
- **M** ✅ Header title now `New space`; primary button label `Create space`.
- **M** ✅ Demo set = one-tap creation w/ **dedupe** — tapping a demo whose title already exists opens the existing space instead of duplicating.
- **M** ✅ Auto-title from leading `# Heading` in the pasted content (falls back to filename, then `Untitled space`).

### 2.3 `Spaces.tsx` ✅
- **V** ✅ `TopBar` w/ blue `+` button in the right-slot (routes to `import`), display-font h2 "N spaces" + Manrope subtitle "{totalDue} items due across all spaces".
- **V** ✅ Scrollable list of cards: title (Bricolage 17), `{termCount} terms · last seen` meta, blue "K due" pill or muted "caught up" right-aligned, 4px progress fill, per-kind badge row (Crossword/Cloze/Flashcards: ready=blue tint / done=sage tint+✓ / unavailable=ink06) + 🔥 streak chip when `streakDays > 0`.
- **M** ✅ Sort: dueToday>0 (and not all kinds done today) first, then `streakDays` desc, then `lastReviewedAt` desc — single fixed order, no user toggle.
- **M** ✅ Tap → `space(spaceId)`, stamps `activeSpaceId` so back-navigation behaves predictably.
- **M** ✅ Empty state — "No spaces yet" card with primary `Register notes` CTA when `spaces.length === 0`.
- **M** ✅ Pull-to-refresh wired to `refreshSpaces`.
- **M** ✅ Long-press (350ms delay) → `ActionSheetIOS` on iOS / `Alert` action menu on Android: "Rename space" opens inline overlay modal with `TextInput` + Save/Cancel; "Delete space" opens confirm `Alert` with destructive button.
- **M** ✅ Error surface — inline error banner for list-fetch failures + a separate mutation-error banner for rename/delete failures. Optimistic rename/delete with server rollback on failure (handled by `useSpaces()` in `state/session.tsx`).

### 2.4 `PuzzlePicker.tsx` ✅ — route renamed `picker` → `space(:spaceId)`
- **V** ✅ `TopBar title={space.title}`, h2 "Pick how you want to remember today." (Bricolage 28), subtitle "{N} items due · same content, three angles." (Manrope 14).
- **V** ✅ Three mode tiles: 110px mini-dither preview with the 56×56 white icon-bubble (using `ModeIcon`) + body w/ Bricolage label + Manrope hint + status caption ("Open →" / "done today" / "—" / "Loading…").
- **V** ✅ Footer caption "Streak: N days" when `summary.streakDays > 0`.
- **M** ✅ Reads `spaceId` from route prop, fetch via `GET /spaces/:id` (cache-first via `useSpaces().spaces`, then refresh). "Space not found" fallback with `Back to spaces` button.
- **M** ✅ `POST /puzzles/generate` w/ `{ kind, spaceId }`; inline error banner on failure; 422 mapped to "No terms available in this space yet — extract terms above" so the user knows extraction is the blocker.
- **M** ✅ "About this space" card replaces the previous "Active notes" card — title + `{termCount} terms · {dueCount} due · {dueToday} today`.
- **M** ✅ Empty-terms guard: when `summary.termCount === 0`, the tiles dim/disable and a tinted call-out card explains extraction and shows an `Extract terms` button calling `POST /spaces/:id/extract`. 409/422/502 handled inline.
- **M** ✅ Per-kind tile statuses derived from `space.summary.playedTodayKinds` (`done today`) vs `termCount === 0` (`—`).
- **M** ✅ Footer `← Back to spaces` (`GhostLink`).

### 2.5 `Crossword.tsx` ✅
- **V** ✅ `PuzzleShell title="Crossword"`, top `ProgressBar` (filled cells / total cells), grid card with 36px cells (current = blue, in-word = blue/10, correct = blue text) and row-major-numbered cells.
- **V** ✅ Active-clue card ("{n} Across" eyebrow + Bricolage 19 clue + Reveal / Submit buttons + feedback line).
- **V** ✅ Horizontal scrollable clue chip row ("{n}A" / "{n}D"), active chip filled blue.
- **V** ✅ Tap-to-toggle-direction on the currently selected cell, auto-advance on letter entry, scoped per-cell `TextInput`s with refs for programmatic focus.
- **M** ✅ Per-term tracking (`startedAt`, `attempts`, `hintsUsed`, `correct`, `revealed`) + per-clue `Submit` and `Reveal` buttons.
- **M** ✅ `POST /puzzles/:id/finish` on the bottom `Done` button via `session.finishActivePuzzle(reviews)`. Returned `space` merges into cache.
- **M** ✅ End-of-session summary card ("N solved", correct/revealed/skipped breakdown, "Saved to {spaceTitle}", `Back to space`).
- **M** ✅ Empty-puzzle guard with `Back to spaces` fallback.
- **M** ✅ Back-navigation routes to `space(puzzle.spaceId)`.
- **DEFERRED** Hint button + WS `useCoach().send(hint_request)` wiring + mistake event on wrong submit — pending Phase 4 WS client.

### 2.6 `Cloze.tsx` ✅
- **V** ✅ Card w/ "From your notes" eyebrow + Anchored/Generated `modeChip` (blue tint vs sage tint), Bricolage 22/34 sentence split on `MASK_TOKEN` with inline `TextInput` blank sized to `answer.length × 13`px, source footer with `{sourceChunk}` (no longer leaks the answer).
- **V** ✅ Bottom actions: while unsubmitted/wrong → `Reveal` + `Submit`; after correct/reveal → full-width `Next →` / `Finish session`.
- **M** ✅ Uses `MASK_TOKEN` from `shared/src/index.ts` as the split delimiter. Backend cloze items now share this constant.
- **M** ✅ Per-item tracking (`startedAt/attempts/hintsUsed/correct/revealed`).
- **M** ✅ Explicit Submit (no auto-detect) with attempts counter; **cap at 3 attempts → force Reveal** so the user always advances.
- **M** ✅ Mode chip — "Anchored" (blue) vs "Generated" (sage).
- **M** ✅ "Regenerated for you (was anchored)" badge when `item.previousMode !== item.mode`.
- **M** ✅ Rating mapper: correct first-try & no hints → Easy(4); correct (≤2 attempts, ≤1 hint) → Good(3); correct (>2 attempts or revealed) → Hard(2); revealed or wrong → Again(1).
- **M** ✅ `POST /puzzles/:id/finish` on Finish session via `session.finishActivePuzzle`.
- **M** ✅ Empty-puzzle guard, back-navigation routes to `space(puzzle.spaceId)`.
- **DEFERRED** Hint button + WS `useCoach().send(hint_request)` wiring — pending Phase 4 WS client. The rating mapper already counts `hintsUsed` to keep the math right once hints land.

### 2.7 `Flashcards.tsx` ✅
- **V** ✅ Reanimated `useSharedValue` + `withTiming` + `interpolate` for the Y-flip animation (550ms cubic-bezier). White front w/ blue eyebrow tag + Bricolage 34 front + "Tap to flip" hint; blue back w/ Bricolage 22 answer + "Rate your recall" caption. `backfaceVisibility: 'hidden'` on each face.
- **V** ✅ Bottom row: before flip → full-width `Show answer` (blue + glow). After flip → Again / Hard / Good / Easy quartet — Easy gets the blue-fill + pill shadow, Good gets the blue-tint background, the other two are ink06.
- **M** ✅ Per-card review tracking (`termId`, `rating`, `ms`, `hintsUsed: 0`) accumulated into a `ref` so it survives flip resets.
- **M** ✅ `cardShownAt` timer reset on index change.
- **M** ✅ `POST /puzzles/:id/finish` on the last grade tap, via `session.finishActivePuzzle`.
- **M** ✅ End-of-deck summary card: "N cards reviewed · X good · Y hard · Z again · W easy · Next due in *{spaceTitle}*: tomorrow" (uses `SessionFinishResponse.nextDueAt` formatted via a relative-time helper).
- **M** ✅ Back-navigation routes to `space(puzzle.spaceId)`.

### Deferred (rolled forward to Phase 4)
- **Hint surfaces** in Crossword + Cloze (button + WS `hint_request` + `CoachOverlay` mount). Rating mappers already count `hintsUsed`; just need the UI + WS plumbing.
- **Mistake event** on wrong Cloze submit / wrong Crossword cell — pending WS client.
- **Web-only file drop** in NotesImport (drag-and-drop callbacks). The native press-to-pick path works on all platforms via `expo-document-picker`.
- **Replace-vs-append prompt** in NotesImport when raw-text textarea already has content and the user taps a demo — not promoted from stretch; current behavior is "demo dedupes by title or overwrites textarea via setRawMode toggle".
- **Wrong-cell shake / coach hint stack** stretch items from SCREENS.md.

---

## Phase 3 — Shared contract changes ✅ **LANDED BY BACKEND TEAM**

> The backend + contracts arrived in the repo between Phase 1 and the
> start of Phase 2. `shared/src/types.ts` and the four `backend/src/routes`
> modules cover everything this rework needs, plus one endpoint we hadn't
> planned for. Phase 2 work targets the real wire shapes from here on; no
> further changes to `shared/src/types.ts` are required for the MVP.

### Shared types now present (`shared/src/types.ts`)
- `MASK_TOKEN` constant.
- `Space`, `SpaceSummary` (with `dueToday`, `playedTodayKinds`, `streakDays`, `stableCount`, `lastReviewedAt`, `lastPuzzleKind`).
- `Term`, `Rating`, `Review`.
- `CrosswordPuzzle` / `ClozePuzzle` / `FlashcardsPuzzle` — all carry `spaceId`.
- `ClozeItem.previousMode` for the "Regenerated for you" badge.
- `Hint` promoted to its own type (`{ termId, tier, kind?, text }`).
- `HealthResponse`, `IngestRequest`, `IngestResponse`, `ExtractTermsResponse`, `GeneratePuzzleRequest`, `SessionFinishRequest`, `SessionFinishResponse`.
- `CoachEvent`, `CoachClientMessage`.

### Backend endpoints implemented
| Endpoint | Notes |
|---|---|
| `GET /health` | Already wired in app. |
| `POST /notes/ingest` | Returns `{ space }`. **Does NOT run extraction.** |
| `GET /notes/:id` | Raw text + metadata. Internal use. |
| `GET /spaces` | `{ spaces: Space[] }` |
| `GET /spaces/:id` | `Space` |
| `PATCH /spaces/:id` | Body `{ title }` → updated `Space` |
| `DELETE /spaces/:id` | 204 on success |
| `POST /spaces/:id/extract` | **New (not in original plan).** Runs the LLM extractor, returns `ExtractTermsResponse`. 409 if terms already extracted; 422 if no candidates pass verification; 502 on LLM failure. |
| `POST /puzzles/generate` | Body `{ kind, spaceId, targetCount? }` → `Puzzle` union. |
| `POST /puzzles/:id/finish` | Body `{ puzzleId, reviews, sessionStartedAt }` → `SessionFinishResponse` (carries refreshed `space`). |
| `WS /coach` | `attachCoachWs` on the HTTP server. Handles `ping`/`mistake`/`hint_request`. |

### What this changes for Phase 2

- **2.2 NotesImport flow shift.** The original plan assumed `POST /notes/ingest` extracted terms inline (one slow call). Reality is **two sequential calls**: `POST /notes/ingest` (fast, returns a zero-term space) followed by `POST /spaces/:id/extract` (slow, ~10–30s LLM call). The two-step progress UI ("Storing notes…" → "Extracting terms…") now maps cleanly: stage one is the ingest call, stage two is the extract call. On extract 409 (already extracted) the screen can navigate straight into the space; on 422 it can show "couldn't find enough to extract — try richer notes" and keep the form populated.
- **Empty-terms guard in PuzzlePicker (2.4)** is now load-bearing — a brand-new space that finished ingest but failed extract will have `summary.termCount === 0`. The "Extraction is still running…" copy from `docs/SCREENS.md` should be re-phrased as "Extraction didn't yield any terms — re-ingest with richer notes" since the backend doesn't auto-retry.
- **API client surface (Phase 4)** picks up one extra method: `extractSpaceTerms(spaceId)` calling `POST /spaces/:id/extract`. Listed alongside the other endpoints in the updated Phase 4 section below.

---

## Phase 4 — Cross-cutting wiring 🟡 **PARTIAL — landed alongside Phase 2**

> The Phase 2 screens forced the API + state-store work forward so the
> three remaining bullets (AsyncStorage, WS coach, toast) are the only
> Phase 4 items still pending. Marking them out explicitly below.

### Landed during Phase 2 ✅
- ✅ **`api/client.ts` centralization** — `apiFetch<T>()` helper + typed `ApiError` (carries status + parsed body). Used by every other `api/*` module.
- ✅ **`api/notes.ts`** rewritten as a real `POST /notes/ingest` call returning `IngestResponse`.
- ✅ **`api/puzzles.ts`** rewritten: `generatePuzzle({ kind, spaceId, targetCount? })` and `finishPuzzle(puzzleId, body)` against the real backend. The old `MOCK_*` fallback was dropped (mocks live unreferenced in `app/src/mocks/mockPuzzles.ts` — can be deleted in a cleanup pass).
- ✅ **`api/spaces.ts`** covers `listSpaces`, `getSpace`, `renameSpace`, `deleteSpace`, `extractSpaceTerms`. `listSpaces` retains the `MOCK_SPACES` offline fallback intentionally so the Landing demo stays usable without the backend.
- ✅ **`useSpaces()` expansion** in `state/session.tsx`: `activeSpaceId`, `activeSpace`, `setActiveSpaceId`, `refreshSpace(id)`, `createSpace(input)`, `extractTerms(id)`, `renameSpace(id, title)` (optimistic w/ rollback on failure), `deleteSpace(id)` (optimistic w/ rollback). `LocalNotes` slice is still in `useSession` for back-compat — the only screen left that touches it is the placeholder code path inside `NotesImport`'s now-unused legacy `addNotes` plumbing; safe to delete in Phase 4 cleanup.
- ✅ **`finishActivePuzzle(reviews)`** hook on `useSession` — POSTs to `/puzzles/:id/finish`, merges returned `space?` into cache (fallback `refreshSpace`), clears `activePuzzle`. Used by Cloze, Crossword, and Flashcards on session end.
- ✅ **`sessionStartedAt` plumbing** — stamped inside `setActivePuzzle`; exposed on the session context for finish-request signing.

### Still pending 🟡
- 🟡 **AsyncStorage persistence**: save `{ spaces, activeSpaceId, activePuzzle, sessionStartedAt }` after each mutating call; rehydrate on `SessionProvider` mount. (`@react-native-async-storage/async-storage` already installed in Phase 0 — just needs to be wired through `useSession`.)
- 🟡 **WS coach client `api/ws.ts`** + **`CoachOverlay.tsx`** component — connection w/ exp backoff exposing `useCoach() → { events, send, status }`, handling `hello / pong / mistake / hint`. Crossword + Cloze are wired to count `hintsUsed` in their rating mappers and have placeholder hint UI slots; they just need the WS button + overlay mounted.
- 🟡 **Toast surface in `ScreenShell`** — one-line bottom toast for transient errors. Today Spaces uses inline error banners, NotesImport uses an error card, the puzzle screens use a fallback red banner inside their summary; consolidating all of these into a shared toast is the cleanup.
- 🟡 **Cleanup**: delete the legacy `LocalNotes` slice from `useSession`, the unused `app/src/mocks/mockPuzzles.ts`, and the legacy `Screen.tsx` once nothing references it (only `ClueList.tsx` / `Grid.tsx` / the legacy `HealthBanner` still do — they're untouched by Phase 2 but no longer reachable from any screen).

---

## Phase 5 — Navigation ✅ **COMPLETE**

> Landed alongside Phase 2 so each new screen could navigate against the
> final route shape.

- ✅ `navigation/types.ts` — `picker` removed; new `{ name: 'space'; spaceId: string }` added. `NavigateTarget` collapsed onto `Route` (the old split no longer adds anything).
- ✅ `NavigationContext.tsx` — dedupe rule now considers params (e.g. two taps on the same space row don't stack the same space twice).
- ✅ `RootNavigator.tsx` — `case 'space'` passes `spaceId` to `<PuzzlePickerScreen spaceId={route.spaceId} />`.
- ✅ Every legacy `navigate({ name: 'picker' })` call site updated. Puzzle screens (`Cloze` / `Crossword` / `Flashcards`) route back to `space(puzzle.spaceId)`; the legacy `NotesImport` placeholder routes to `spaces` (and the fully-reworked screen now navigates to `space(space.id)`).

---

## Suggested merge order

`Phase 0 → 1 → 3 → 5 → 2 (Landing, Spaces, Picker, NotesImport, Flashcards, Cloze, Crossword) → 4 (cross-cutting wiring interleaved with the screens that need it).`

**Actual landing order:** 0 → 1 → 3 (landed by backend team) → 5 + 2.2/2.4 dependencies + most of 4 (interleaved as Phase 2 progressed) → 2.1 → 2.3 → 2.4 → 2.2 → 2.7 → 2.6 → 2.5 → final typecheck. Remaining: 🟡 AsyncStorage, 🟡 WS coach + CoachOverlay, 🟡 toast surface, 🟡 cleanup of legacy `LocalNotes` / `mockPuzzles.ts` / `Screen.tsx`.

---

## Status snapshot

| Phase | Status |
|---|---|
| 0 — Foundation | ✅ COMPLETE |
| 1 — Shared primitives | ✅ COMPLETE |
| 2 — Per-screen rework | ✅ COMPLETE (with the hint/WS surfaces in 2.5/2.6 rolled forward to Phase 4) |
| 3 — Shared contract changes | ✅ COMPLETE (landed by backend team) |
| 4 — Cross-cutting wiring | 🟡 PARTIAL (API client + useSpaces + finishActivePuzzle done; AsyncStorage / WS coach / toast / cleanup pending) |
| 5 — Navigation | ✅ COMPLETE |

`bun run typecheck` green across `@pachu/shared`, `@pachu/backend`, `@pachu/app` after every screen landing.

---

## Out of scope (explicitly deferred)

- `ios-frame.jsx` / `tweaks-panel.jsx` / blueprint `app.jsx` — dev-only prototype chrome.
- SCREENS.md *stretch* items not promoted to MVP (sparkline, filter chips, bulk delete, search, swipe gestures, keyboard shortcuts, debug drawer, animated transitions). Follow-up after MVP set ships.

## Open risks

- **Skia on web**: support is via WASM and adds bundle weight. If Expo Web is a hard target, sanity-check bundle size and lazy-load Skia. *(Status: not yet runtime-smoked; Phase 1 typecheck passed, but the first real smoke happens after Phase 4 toast surface lands and a dev server boot.)*
- **Font weight names**: Google Fonts packages export weight-suffixed family names; cross-platform `fontFamily` strings differ slightly. Centralized in `theme.fonts`. *(Status: needs visual smoke on iOS/Android to confirm all eight weights resolve.)*
- **Backend MVP endpoints** — landed during Phase 1→2 transition; Phase 2 screens now hit the real surface. *(Status: green at compile time; needs end-to-end smoke against a live backend.)*
- **Palette wholesale replace** — handled in Phase 0; no further references to the warm scale remain outside `theme.ts`.
- **`AlertActionSheetIOS` on Android** — `SpacesScreen` long-press uses the iOS action sheet API on iOS and falls back to a four-button `Alert` on Android. Visual parity is reasonable but the Android path is less idiomatic; revisit in a polish pass.
- **`<View pointerEvents>` deprecation warning** — React Native 0.81 has deprecated the `pointerEvents` prop in favor of `style.pointerEvents`. Phase 2 screens use the prop form; cleanup task to migrate before the deprecation becomes an error.
