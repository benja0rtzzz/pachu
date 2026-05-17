# Pachu

Adaptive, note-driven puzzles for studying — powered by FSRS (math) and a local LLM (style).

The user provides their own notes; the system extracts terms, schedules them with FSRS, and generates puzzles whose register mimics the source notes. Three puzzle types share one memory model:

- **Crossword** — clues generated to match the notes' register
- **Cloze** (fill-in-the-blank) — anchored mode (verbatim sentence from notes) for fragile cards, generated mode (LLM mimics styleAnchor, with a grounding verifier) for solid cards
- **Flashcards** — direct FSRS reviews

## Repo layout

```
pachu/
  app/        # React Native + Expo
  backend/    # Node + Bun + TypeScript + Express + ws + `bun:sqlite`
  shared/     # cross-cutting TypeScript types
```

## Prerequisites

- [Bun](https://bun.sh/) 1.1+ (used as the package manager and runtime — runs `.ts` natively, has built-in SQLite)
- [Ollama](https://ollama.com/) running locally (`ollama serve`); model is configurable via `backend/.env` (see `backend/.env.example` for options and notes)
- iOS Simulator or Expo Go on a phone (same Wi-Fi as the dev laptop)

## Quick start

```bash
bun install
cp .env.example .env                   # edit to set OLLAMA_MODEL, etc.
bun run dev:backend                    # one terminal
bun run dev:app                        # another terminal
```

Backend listens on `http://localhost:4000`. The Expo app reads `EXPO_PUBLIC_API_BASE_URL` (defaults to `http://localhost:4000`).

## For contributors

- **Start here**: [`AGENTS.md`](AGENTS.md) — team coordination, conventions, live progress board.
- **Full architecture**: [`docs/PLAN.md`](docs/PLAN.md) — diagrams, anti-hallucination contract, demo script.
- **GitHub**: https://github.com/benja0rtzzz/pachu
