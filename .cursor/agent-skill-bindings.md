# Agent → skill pack map

Cursor subagents do not support a native `skills: [...]` field. Each agent in `.cursor/agents/*.md` lists the paths it must **read first**; this file is the human-readable map (keep it in sync when you add agents or skills).

**Master agent:** **`askai`** — reads the registry below plus **all** canonical skills when full context is needed (see `.cursor/agents/askai.md`).  
**Meta agent:** **`agent-learning`** — updates skills/agents from feedback (see `.cursor/agents/agent-learning.md`).

## Canonical skills

All specialist behavior is defined in **`.cursor/skill-library/*.md`**. GitHub Copilot agents under `.github/copilot/agents/` reference **the same paths** (no divergent copies).

| Agent (`/name`) | Skill files (under `.cursor/skill-library/`) |
|-----------------|-----------------------------------------------|
| `askai` (master) | `askai-ephemeral-output.md`, `askai-skill-evolution.md`, plus **all** rows below as needed |
| `agent-learning` | `askai-skill-evolution.md` + target skill(s) being edited |
| `jira-automation` | `jira-workflow.md` |
| `db-automation` | `db-restore.md` *(append more `db-*.md` to `db-automation.md`’s read list)* |
| `git-automation` | `git-sync.md` *(append more `git-*.md` as needed)* |
| `bitbucket-automation` | `git-sync.md`, then `bitbucket-unify-enterprise.md` |
| `slack-automation` | `slack-integration.md` *(append `slack-*.md` as needed)* |
| `dev-customization` | `dev-customization-expertise.md`, then `dev-customization-workflow.md` |
| `confluence-automation` | `confluence-workflow.md` *(append `confluence-*.md` as needed)* |

## Adding an agent

1. Add skills under `.cursor/skill-library/`.
2. Create `.cursor/agents/<name>.md` with mandatory read list.
3. Create `.github/copilot/agents/<name>.agent.md` (same `name`, point at the same `.cursor/skill-library/` paths).
4. Optionally add a row to `.github/agents/AskAI.agent.md` if the agent should appear in VS Code’s list.
5. Update **this file** and `.github/copilot/AGENT-SKILL-BINDINGS.md`.

Use **plain `.md` in `skill-library/`** for agent-bound packs. Reserve `.cursor/skills/<name>/SKILL.md` for [Cursor discoverable skills](https://cursor.com/docs/skills) that any chat may pull in by relevance.
