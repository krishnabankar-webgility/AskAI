# Copilot Instructions (AskAI project)

## Canonical source

- **Skills:** **`.cursor/skill-library/*.md`** — single source of truth for Jira, Git, DB, Bitbucket, Slack, dev customization, Confluence, and meta (`krishnaaigen-*.md`).
- **Cursor agents:** **`.cursor/agents/*.md`** — full behavioral specs; **mandatory read lists** drive what each specialist loads.
- **GitHub Copilot agents:** **`.github/copilot/agents/*.agent.md`** — must mirror **`.cursor/agents/*.md`** (same names, same skill paths, same routing). When you change behavior, update **`.cursor/skill-library/`** first, then Copilot wrappers per **`.cursor/skill-library/krishnaaigen-skill-evolution.md`**.
- **VS Code agent picker:** **`.github/agents/KrishnaAiGen.agent.md`** — master summary; specialists are listed in **`.cursor/agent-skill-bindings.md`** and **`.github/copilot/AGENT-SKILL-BINDINGS.md`** (keep both registries aligned).

## Specialist agents (parity)

| Agent | Canonical skills (`.cursor/skill-library/`) |
|-------|--------------------------------|
| `KrishnaAiGen` | All core skills (see `.cursor/agents/KrishnaAiGen.md` ordered list) |
| `agent-learning` | `krishnaaigen-skill-evolution.md` + targets being edited |
| `jira-automation` | `jira-workflow.md` |
| `git-automation` | `git-sync.md` |
| `db-automation` | `db-restore.md` |
| `bitbucket-automation` | `git-sync.md`, `bitbucket-unify-enterprise.md` |
| `slack-automation` | `slack-integration.md` |
| `dev-customization` | `dev-customization-expertise.md`, `dev-customization-workflow.md` |
| `confluence-automation` | `confluence-workflow.md` |

## Project rules

- Always ask for missing required inputs before taking action.
- Never store credentials, passwords, or connection strings in repo files.
- Use Jira/Atlassian MCP tools when available for Jira operations; Atlassian MCP for Confluence.
- Use `sqlcmd` for SQL Server operations; always ask for server instance if not provided. Read SQL Server credentials from environment variables (`$env:SQLCMD_SERVER`, `$env:SQLCMD_USER`, `$env:SQLCMD_PASSWORD`). Always ask user for database name and backup file path — never cache these between sessions. Log all restore operations to `logs/db-restore-log.md`.
- Mask secrets (`***`) in all output.
- **One-off / throwaway files** go under **`local/ephemeral/`** (gitignored) or `logs/` — not under `src/` or tracked docs unless the user wants them committed.

## Legacy

The folder **`.github/copilot/skills/jira-automation/`** is **deprecated** in favor of **`.cursor/skill-library/jira-workflow.md`**.
