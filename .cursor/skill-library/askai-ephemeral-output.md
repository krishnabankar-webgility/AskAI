# AskAI — Ephemeral output (not for git)

Use this when the user wants **one-time** results: scratch reports, formatted dumps, throwaway charts, or session notes that must **not** be committed or pushed.

## Allowed locations (all gitignored or under ignored trees)

| Path | Purpose |
|------|---------|
| `local/ephemeral/` | Default folder for arbitrary one-off files (reports, exports, temp markdown). Create subfolders as needed. |
| `logs/` | Build-style logs; entire `logs/` folder is ignored by the standard VS `.gitignore` template. |
| `.cursor/agent-session-notes.log` | Short session scratch (override freely). |

**Do not** write ephemeral content to tracked paths such as `docs/`, `src/`, or `.cursor/skill-library/` unless the user explicitly asks to **persist** something in the repo.

## Before writing

1. Confirm the user wants **throwaway** output (or infer from “show in a file”, “don’t commit”, “local only”).
2. Prefer `local/ephemeral/<date-or-topic>/` for clarity.
3. Remind the user these paths are ignored; they must **copy** anything they want to keep into a tracked file.

## Git

If a file was created outside ignored paths by mistake, **do not commit it**; move it under `local/ephemeral/` or delete after the user copies the content.
