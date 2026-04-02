---
mode: agent
description: >
  SQL Server restore and DB operations. Canonical instructions live in
  .cursor/skill-library/db-restore.md — read that file first; this prompt only routes.
---

# DB Automation (GitHub Copilot) — prompt routing

**Canonical skill (mandatory for restore and sqlcmd workflows):** `.cursor/skill-library/db-restore.md`

The full workflow (instance naming, auth, `RESTORE FILELISTONLY`, `MOVE`, drop DB safety, verification, troubleshooting **`SQLCMD.rll`**, service-account path access) is defined **only** in that file so Cursor and Copilot stay aligned.

**Agent file:** `.github/copilot/agents/db-automation.agent.md` (self-contained checklist + environment notes after reading the skill).

**Invoke in Cursor:** `/db-automation` then your request (server, `.bak` path, target database name, auth).

Do **not** duplicate long restore steps in this prompt—edit **`db-restore.md`** when rules change.
