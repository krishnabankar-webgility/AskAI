# AskAI — Skill and agent evolution

When a session reveals **wrong behavior**, **missing steps**, **API quirks**, or **user correction** (“actually do X”, “the formula should be…”), treat that as a signal to **update repository instructions** so the same mistake is not repeated.

## When to update (triggers)

- User **corrects** an agent’s output or workflow.
- A tool/API returns an error that implies the skill text is **outdated** (field id, transition id, permission).
- **Ambiguity** in a skill caused the model to guess wrong; the resolution should be **documented**.
- **New integration** (MCP tool, env var) becomes standard for this repo.

## What to edit

| Change type | Update |
|-------------|--------|
| Procedure, formula, JQL, field map | `.cursor/skill-library/<domain>.md` (canonical source). |
| Which file an agent reads first | `.cursor/agents/<name>.md` and the matching `.github/copilot/agents/<name>.agent.md`. |
| Registry tables | `.cursor/agent-skill-bindings.md` and `.github/copilot/AGENT-SKILL-BINDINGS.md`. |
| Project-wide policy | `AGENTS.md` and `.github/copilot-instructions.md` when it affects all agents. |

## Parity rule (Cursor ↔ Copilot ↔ VS Code)

**Canonical skills** live under **`.cursor/skill-library/*.md`**. GitHub Copilot agent files under `.github/copilot/agents/` must **reference those same paths** (workspace-relative). Do not maintain divergent copies of the same workflow in `.github/copilot/skills/` unless a Copilot-only shim is unavoidable—if you add a shim, add a banner pointing to the canonical file.

When you add or rename an agent:

1. Add `.cursor/agents/<name>.md`.
2. Add `.github/copilot/agents/<name>.agent.md` (same `name`, aligned instructions).
3. Add `.github/agents/AskAI.agent.md` cross-links if the agent is user-facing in VS Code (optional row in the AskAI master section).
4. Update both **AGENT-SKILL-BINDINGS** files and **AGENTS.md** (AskAI section).

## agent-learning agent

Use the **`agent-learning`** agent (or explicit user request) when the task is **only** “fix the skill / doc from this feedback”. It reads this file plus the target skill, applies a minimal edit, and updates bindings if needed.

## What not to put in skills

Ephemeral session notes, one-off analysis, or personal reminders belong in **`local/ephemeral/`** or `logs/` — not in `skill-library/`.
