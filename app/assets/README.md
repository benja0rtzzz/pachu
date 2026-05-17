# App assets (required by `app.json`)

Place these **valid PNG** files in this folder (`app/assets/`):

| File | Used for | Suggested size |
|------|----------|----------------|
| `logo.png` | App icon (iOS/Android) | **1024×1024** |
| `splash-icon.png` | Splash screen center image | **1024×1024** (or larger; `contain` in config) |
| `adaptive-icon.png` | Android adaptive icon foreground | **1024×1024**, square, transparent background OK |
| `favicon.png` | Web tab icon | **48×48** or **32×32** |

All paths are relative to the `app/` package root, as declared in `app.json`.

After adding files, restart Metro: `bun run dev:app:web` from the repo root.
