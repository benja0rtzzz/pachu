# Pachu backend API

> Live catalogue of the backend HTTP + WS surface. Update this file in the same
> commit that adds, changes, or removes a route. Anything not listed here is not
> wired yet — see the Person A board in [`AGENTS.md`](../AGENTS.md) for what's
> planned. Cross-team type names below refer to [`shared/src/types.ts`](../shared/src/types.ts).

- Base URL (local): `http://localhost:4000`
- All bodies are `application/json` unless noted.
- CORS is open (`GET, POST, PATCH, DELETE, OPTIONS`) so the Expo app can hit the
  laptop from a phone over LAN.
- Anything client-supplied is validated and rejected with a `4xx` and
  `{ "error": "..." }` body. Servers never throw to the client.

---

## `GET /`

Service banner. Useful for "did the right thing answer the port?".

**Response — `200 OK`**

```json
{
  "service": "pachu-backend",
  "try": ["/health", "/spaces", "/notes/ingest", "/puzzles/generate", "/coach (WS)"]
}
```

---

## `GET /health`

Returns service health plus a live ping to the LLM provider. The app polls this
every 5 s to colour the home screen indicator.

**Response — `200 OK` (`HealthResponse`)**

```json
{
  "ok": true,
  "service": "pachu-backend",
  "version": "0.0.1",
  "uptimeMs": 12345,
  "llm": {
    "reachable": true,
    "provider": "ollama",
    "model": "gemma4:e2b"
  }
}
```

- `llm.reachable` is the result of a fresh ping (not a cached value). `false`
  means Ollama isn't answering — the rest of the app should keep working but
  any route that needs extraction / clue generation will fail loudly.

---

## Spaces

A **space** is the user-facing object: notes metadata + a computed
[`SpaceSummary`](../shared/src/types.ts) (term counts, due counts, FSRS-derived
stability bucket, today-line, streak). `Space.id === notes_files.id` — there is
no separate `spaces` table; the term derives from the UI domain model in
[`SCREENS.md`](SCREENS.md).

Summaries are computed on every read (one JS pass over the FSRS card blobs +
a handful of small SQL queries). No cache; staleness is worse than the
microseconds saved.

### `POST /notes/ingest` — create a space

Stores raw text and returns the newly-created `Space`. **LLM-free for now** —
extraction will be wired into the same handler later without changing this
contract.

**Request body — `IngestRequest`**

| Field     | Type   | Required | Notes                                                                 |
| --------- | ------ | -------- | --------------------------------------------------------------------- |
| `title`   | string | yes      | Trimmed; must be non-empty.                                           |
| `content` | string | yes      | UTF-8 raw notes. Hard cap **2 MiB** (matches `express.json({ limit })`). |

```json
{ "title": "Lecture 1", "content": "Hiragana is the rounded one ..." }
```

**Responses**

- `201 Created` — `IngestResponse`:

  ```json
  {
    "space": {
      "id": "5f6c2c8a-7c43-4f3a-9a1b-3a6f7e8d2c11",
      "title": "Lecture 1",
      "createdAt": "2026-05-16T22:33:01.187Z",
      "byteLength": 1024,
      "summary": {
        "termCount": 0,
        "dueCount": 0,
        "newCount": 0,
        "stableCount": 0,
        "dueToday": 0,
        "playedTodayKinds": [],
        "streakDays": 0
      }
    }
  }
  ```

  Immediately after ingest, `summary` is zero-state — extraction hasn't run.

- `400 Bad Request` — missing/empty `title` or `content`.
- `413 Payload Too Large` — body exceeds 2 MiB.

### `GET /spaces`

Lists every space, newest first. Each row includes a fresh summary.

**Response — `200 OK`**

```json
{
  "spaces": [
    {
      "id": "5f6c2c8a-...",
      "title": "Lecture 1",
      "createdAt": "2026-05-16T22:33:01.187Z",
      "byteLength": 1024,
      "summary": { "termCount": 12, "dueCount": 4, "newCount": 0, "stableCount": 6,
                   "lastReviewedAt": "2026-05-16T20:14:55.000Z", "lastPuzzleKind": "cloze",
                   "dueToday": 4, "playedTodayKinds": ["cloze"], "streakDays": 3 }
    }
  ]
}
```

### `GET /spaces/:id`

Fetches one space (metadata + fresh summary; no raw text).

- `200 OK` — `Space`.
- `404 Not Found` — `{ "error": "not found" }`.

### `PATCH /spaces/:id`

Renames a space.

**Request body**

```json
{ "title": "New title" }
```

- `200 OK` — the updated `Space`.
- `400 Bad Request` — `title` missing or empty.
- `404 Not Found` — no such space.

### `DELETE /spaces/:id`

Deletes a space. `terms`, `sessions`, and `review_events` cascade automatically
via the FK clauses in `schema.sql`. Irreversible.

- `204 No Content` — deleted.
- `404 Not Found` — no such space.

### `POST /spaces/:id/extract`

Runs the LLM term extractor against the space's stored raw text, applies the
tier-1 span verifier (`source_span` and `style_anchor` must be literal
substrings of the notes; the `style_anchor` must contain the term), and
persists the survivors as `terms` rows. No request body — the soft cap on
returned candidates is server-side (currently 20).

The route deliberately does NOT force-fit. If the LLM produces zero candidates
that pass verification, it returns `422` instead of inserting noise into the
store. The "user's notes are the source of truth" guarantee is non-negotiable.

**Responses**

- `200 OK` — `ExtractTermsResponse`:

  ```json
  {
    "space": { "id": "...", "summary": { "termCount": 12, ... } },
    "acceptedCount": 12,
    "rejectedCount": 3
  }
  ```

  `rejectedCount` surfaces how many LLM candidates the tier-1 verifier dropped
  (e.g. paraphrased `source_span`, hallucinated terms). Useful during the demo
  to show the anti-hallucination contract actually filtering.

- `404 Not Found` — no such space.
- `409 Conflict` — the space already has at least one extracted term.
  Re-extraction is intentionally blocked to avoid duplicate rows and orphaned
  FSRS state; `DELETE /spaces/:id` + re-ingest to retry.
- `422 Unprocessable Entity` — every LLM candidate was rejected by the verifier
  (or the LLM returned nothing parseable). Response includes `rejectedCount`
  so the client can show "the LLM produced N candidates but none passed
  verification — try richer or longer notes."
- `502 Bad Gateway` — the LLM adapter threw (Ollama unreachable, HTTP timeout,
  etc.). The store is left untouched.

### `GET /notes/:id` (internal)

Returns a `NotesFile & { rawText: string }`. Kept around for the extraction
pipeline and for debugging — **not** the canonical route for the app, which
should use `/spaces` everywhere it can.

- `200 OK` — full notes file including the raw body.
- `404 Not Found` — no such notes file.

---

## WebSocket `/coach`

URL: `ws://localhost:4000/coach`

A live channel for coach hints + mistake observations. Message types come from
`CoachEvent` / `CoachClientMessage` in `shared`.

### Server → client (`CoachEvent`)

Sent on connect:

```json
{ "type": "hello", "sessionId": "f9b9f9b8-..." }
```

In response to `{"type":"ping"}`:

```json
{ "type": "pong" }
```

In response to `{"type":"hint_request", ...}` — the payload is the promoted
`Hint` type so the overlay can style each tier independently:

```json
{
  "type": "hint",
  "hint": {
    "termId": "...",
    "tier": 2,
    "kind": "pattern",
    "text": "5 letters, starts with H"
  }
}
```

`tier` is `1 | 2 | 3`, `kind` is `'nudge' | 'pattern' | 'definition'`:

- tier 1 (`nudge`) — LLM hint in the notes' register
- tier 2 (`pattern`) — deterministic structural hint (length + first letter)
- tier 3 (`definition`) — definition reveal

The server may forward solver telemetry back to the client as
`{ type: 'mistake', termId, observation }` once the orchestrator starts
processing client-emitted mistakes. Not implemented yet — clients only see
`hello`, `hint`, and `pong` today.

### Client → server (`CoachClientMessage`)

```json
{ "type": "ping" }
```

```json
{ "type": "mistake", "termId": "...", "observation": "typed 'kana' for 'Hiragana'" }
```

```json
{ "type": "hint_request", "termId": "...", "tier": 1 }
```

Unparseable frames are dropped silently. Mistake observations are cached
per-connection so subsequent tier-1 nudges have context.

---

## Puzzles

A **puzzle** has no DB row of its own. `POST /puzzles/generate` creates a
session row and returns the engine's output with `puzzle.id === session.id`.
`POST /puzzles/:id/finish` ends that session and applies the per-term
`Review[]` (which updates FSRS state on the `terms` rows).

### `POST /puzzles/generate`

**Request body — `GeneratePuzzleRequest`**

| Field         | Type                         | Required | Notes                                                                              |
| ------------- | ---------------------------- | -------- | ---------------------------------------------------------------------------------- |
| `kind`        | `'crossword'\|'cloze'\|'flashcards'` | yes | Selects the engine.                                                                |
| `spaceId`     | string                       | yes      | Must reference an existing space.                                                  |
| `targetCount` | number                       | no       | Soft cap (clamped to `[1, 25]`). Defaults: crossword 8, cloze 8, flashcards 12.    |

```json
{ "kind": "cloze", "spaceId": "5f6c...", "targetCount": 6 }
```

**Responses**

- `200 OK` — a `Puzzle` (`CrosswordPuzzle | ClozePuzzle | FlashcardsPuzzle`).
  All three variants carry `id`, `spaceId`, and a `kind` discriminant. Cloze
  items use the shared `MASK_TOKEN` (`[MASK]`) in `sentence`. Items per term
  are equal to the picker's output count (≤ `targetCount`, ≤ space's
  available terms).
- `400 Bad Request` — invalid `kind` or missing `spaceId`.
- `404 Not Found` — no such space.
- `422 Unprocessable Entity` — space exists but has no extracted terms yet
  (`{ "error": "no terms available in this space yet — ingest notes and extract terms first" }`),
  or the crossword layout placed zero entries.
- `502 Bad Gateway` — engine threw (e.g. crossword's clueStylist couldn't
  reach the LLM at all). Note: per-clue LLM failures fall back to the term's
  definition; this is only for whole-pipeline failures. Cloze never 502s —
  generated-mode failures fall back silently to anchored.

### `POST /puzzles/:id/finish`

`:id` is the `puzzle.id` returned by `/generate` (== `session.id`). The route
applies each `Review` via `reviewTerm` (FSRS persisted on the term row),
appends a `review_events` row, and ends the session. Reviews whose `termId`
doesn't belong to this session's space are silently dropped from
`acceptedCount` — clients can safely retry.

**Request body — `SessionFinishRequest`**

```json
{
  "puzzleId": "8f1e...",
  "sessionStartedAt": "2026-05-16T22:35:01.187Z",
  "reviews": [
    { "termId": "...", "rating": 3, "ms": 4123, "hintsUsed": 0 },
    { "termId": "...", "rating": 4, "ms": 1980, "hintsUsed": 0 }
  ]
}
```

`rating` is `1|2|3|4` (Again/Hard/Good/Easy). For Crossword and Cloze the app
derives this rating from solver telemetry via `memory/ratingMapper.ts`; for
Flashcards the user picks directly.

**Responses**

- `200 OK` — `SessionFinishResponse`:

  ```json
  {
    "acceptedCount": 2,
    "nextDueAt": "2026-05-19T14:22:00.000Z",
    "space": { "id": "...", "title": "...", "summary": { ... } }
  }
  ```

  `nextDueAt` is the earliest `due` across all FSRS cards in the space, or
  omitted when nothing is scheduled (all terms unreviewed). `space` saves
  the caller a follow-up `GET /spaces/:id`.

- `400 Bad Request` — `puzzleId` in body disagrees with `:id`, or `reviews`
  isn't an array.
- `404 Not Found` — no such session.
- `409 Conflict` — session has already been finished (idempotency guard).

---

## Not yet wired (don't expect these to answer)

These items are still on the boards in `AGENTS.md`; this section is here so
callers don't code against guesses.

- Server→client `mistake` forwarding on `/coach`. The wire type already exists
  on `CoachEvent` as `{ type: 'mistake', termId, observation }`; the
  orchestrator just doesn't emit one yet. Will land when the app starts
  streaming per-cell mistake events to the backend.
