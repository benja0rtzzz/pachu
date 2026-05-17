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
  "try": ["/health", "/spaces", "/notes/ingest", "/coach (WS)"]
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

A `mistake_observed` event will be added when the orchestrator starts
forwarding solver telemetry. Not implemented yet.

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

## Not yet wired (don't expect these to answer)

These endpoints are on the Person A board in `AGENTS.md`; this section is here
so callers don't code against guesses. **Wire shapes are pinned in
`shared/src/types.ts` — paths are still flexible.**

- `POST /puzzles/generate` — body `GeneratePuzzleRequest { kind, spaceId, targetCount? }`;
  returns a `Puzzle` (one of `CrosswordPuzzle | ClozePuzzle | FlashcardsPuzzle`,
  all of which carry a `spaceId`).
- `POST /puzzles/:id/finish` — body `SessionFinishRequest`; response
  `SessionFinishResponse` includes an optional refreshed `Space` so the
  app doesn't need a follow-up `GET /spaces/:id`.
- Term extraction call (path TBD) — runs `extractTerms` against a stored
  space and persists the verified candidates.
