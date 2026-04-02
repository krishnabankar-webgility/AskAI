# GitHub Copilot Agents → Skills Map

**Canonical skills** live in **`.cursor/skill-library/*.md`**. Copilot `.agent.md` files reference those paths so **Cursor, VS Code Copilot, and GitHub stay aligned**.

## Layout

```
.cursor/
├── agents/              # Cursor subagents (e.g. askai.md, jira-automation.md)
├── skill-library/       # CANONICAL skills (single source of truth)
.github/
├── agents/
│   └── AskAI.agent.md   # VS Code / GitHub agent picker — master summary
├── copilot/
│   ├── agents/*.agent.md  # GitHub Copilot agents (mirror Cursor names)
│   └── skills/            # Legacy / deprecated copies — prefer .cursor/skill-library
├── prompts/
│   └── askai.prompt.md
```

## Agent → Skills

| Agent (`.agent.md`) | Canonical skills (`.cursor/skill-library/`) |
|---------------------|-----------------------------------------------|
| `askai` | `askai-ephemeral-output.md`, `askai-skill-evolution.md`, `jira-workflow.md`, `git-sync.md`, `db-restore.md`, `bitbucket-unify-enterprise.md`, `slack-integration.md`, `dev-customization-expertise.md`, `dev-customization-workflow.md` |
| `agent-learning` | `askai-skill-evolution.md` + files being edited |
| `jira-automation` | `jira-workflow.md` |
| `git-automation` | `git-sync.md` |
| `db-automation` | `db-restore.md` |
| `bitbucket-automation` | `git-sync.md`, `bitbucket-unify-enterprise.md` |
| `slack-automation` | `slack-integration.md` |
| `dev-customization` | `dev-customization-expertise.md`, `dev-customization-workflow.md` |

## Deprecated

The folder **`.github/copilot/skills/jira-automation/`** (split Jira docs) is **deprecated** in favor of **`.cursor/skill-library/jira-workflow.md`**. Update automation in one place only.

## Parity rule

When you add, remove, or rename an agent or skill:

1. Update `.cursor/agent-skill-bindings.md` and this file.
2. Update `.cursor/agents/` and `.github/copilot/agents/` together.
3. Update `AGENTS.md` (AskAI section) if user-facing commands change.

## Differences from older Copilot layout

| Aspect | Current practice |
|--------|------------------|
| Skills | **`.cursor/skill-library/*.md`** only |
| Copilot `.agent.md` | Thin wrapper + mandatory read list pointing at `.cursor/...` |
| `.github/copilot/skills/` | Legacy; do not duplicate new workflows there |
