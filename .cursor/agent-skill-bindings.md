# Agent → skill pack map

> **Scope reminder:** This registry and all agents/skills listed here belong to the **AskAI project** (`AskAI/`). Agents under `Agentic_Unify-Enterprise/.github/agents/` (e.g. `eng-master`) are **reference-only** — never modified by AskAI agents.

Cursor subagents do not support a native `skills: [...]` field. Each agent in `.cursor/agents/*.agent.md` lists the paths it must **read first**; this file is the human-readable map (keep it in sync when you add agents or skills).

**Identification naming (AskAI):** specialists use **`<name>.agent.md`** (Cursor), **`<name>.skill.md`** (canonical packs under `.cursor/skill-library/`), **`<name>.prompt.md`** (optional helpers under `.github/prompts/`), and **`<name>.rule.md`** (human-readable rule identification beside `.mdc` files Cursor loads).

**Master agent:** **`KrishnaAiGen`** — intelligent routing: bindings + meta skills always; domain skills loaded **via** the specialist agents you choose (see `.cursor/agents/KrishnaAiGen.agent.md`).  
**Meta agent:** **`agent-learning`** — updates skills/agents from feedback (see `.cursor/agents/agent-learning.agent.md`).  
**VS Code autonomous variant:** **`KrishnaAIGen-autonomous`** — `.github/agents/KrishnaAIGen-autonomous.agent.md` (codebase / VS Code tooling; not the same as the KrishnaAiGen master).

## Canonical skills

All specialist behavior is defined in **`.cursor/skill-library/*.skill.md`**. GitHub Copilot agents under `.github/copilot/agents/` reference **the same paths** (no divergent copies).

| Agent (`/name`) | Skill files (under `.cursor/skill-library/`) |
|-----------------|-----------------------------------------------|
| `KrishnaAiGen` (master) | `krishnaaigen-ephemeral-output.skill.md`, `krishnaaigen-skill-evolution.skill.md`, plus whichever domains you route to (see master agent §B) |
| `agent-learning` | `krishnaaigen-skill-evolution.skill.md` + target skill(s) being edited |
| `jira-automation` | `jira-workflow.skill.md` (§1.6c SP + Priority Rank 1 on new Stories; §3.1.1; §3.7–§3.8; §7) |
| `db-automation` | `db-restore.skill.md` *(append more `db-*.skill.md` to `db-automation.agent.md`’s read list)* |
| `git-automation` | `git-sync.skill.md` *(append more `git-*.skill.md` as needed)* |
| `bitbucket-automation` | `git-sync.skill.md`, then `bitbucket-unify-enterprise.skill.md` |
| `slack-automation` | `slack-integration.skill.md` *(append `slack-*.skill.md` as needed)* |
| `dev-customization` | `dev-customization-expertise.skill.md`, then `dev-customization-workflow.skill.md` |
| `confluence-automation` | `confluence-workflow.skill.md` *(append `confluence-*.skill.md` as needed)* |
| `daily-work-update` | `daily-work-update.skill.md`, `slack-integration.skill.md`, `jira-workflow.skill.md` (§3, §7, §7.6 only), `bitbucket-unify-enterprise.skill.md`, `git-sync.skill.md`, `krishnaaigen-ephemeral-output.skill.md` |
| `sys-troubleshoot` | `vpn-smb-access.skill.md`, `network-profile-fix.skill.md` (load per symptom; agent maps cases) |

## Adding an agent

1. Add skills under `.cursor/skill-library/*.skill.md`.
2. Create `.cursor/agents/<name>.agent.md` with mandatory read list.
3. Create `.github/copilot/agents/<name>.agent.md` (same `name`, same `.cursor/skill-library/*.skill.md` paths).
4. Copy or sync `.github/agents/<name>.agent.md` so VS Code’s picker sees it (same body as Copilot agent).
5. Optionally add `.github/prompts/<name>.prompt.md`.
6. Update **this file** and `.github/copilot/AGENT-SKILL-BINDINGS.md`.

Use **`.skill.md` in `skill-library/`** for agent-bound packs. Reserve `.cursor/skills/<name>/SKILL.md` for [Cursor discoverable skills](https://cursor.com/docs/skills) that any chat may pull in by relevance.
