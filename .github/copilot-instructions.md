# Copilot Instructions (AskAI project)

## Canonical source

- **Skills:** **`.cursor/skill-library/*.skill.md`** — single source of truth for Jira, Git, DB, Bitbucket, Slack, dev customization, Confluence, meta (`krishnaaigen-*.skill.md`), VPN/SMB, and network profile packs.
- **Cursor agents:** **`.cursor/agents/*.agent.md`** — full behavioral specs; **mandatory read lists** drive what each specialist loads.
- **GitHub Copilot agents:** **`.github/copilot/agents/*.agent.md`** — must mirror **`.cursor/agents/*.agent.md`** (same names, same skill paths, same routing). When you change behavior, update **`.cursor/skill-library/`** first, then Copilot wrappers per **`.cursor/skill-library/krishnaaigen-skill-evolution.skill.md`**.
- **VS Code agent picker:** **`.github/agents/*.agent.md`** — sync from Copilot agents for AskAI specialists; see **`.cursor/agent-skill-bindings.md`** and **`.github/copilot/AGENT-SKILL-BINDINGS.md`** (keep both registries aligned).

## Specialist agents (parity)

| Agent | Canonical skills (`.cursor/skill-library/`) |
|-------|--------------------------------|
| `KrishnaAiGen` | Routed packs per `.cursor/agents/KrishnaAiGen.agent.md` (§B); optional full sweep of core `.skill.md` files |
| `agent-learning` | `krishnaaigen-skill-evolution.skill.md` + targets being edited |
| `jira-automation` | `jira-workflow.skill.md` |
| `git-automation` | `git-sync.skill.md` |
| `db-automation` | `db-restore.skill.md` |
| `bitbucket-automation` | `git-sync.skill.md`, `bitbucket-unify-enterprise.skill.md` |
| `slack-automation` | `slack-integration.skill.md` |
| `dev-customization` | `dev-customization-expertise.skill.md`, `dev-customization-workflow.skill.md` |
| `confluence-automation` | `confluence-workflow.skill.md` |
| `daily-work-update` | See agent mandatory list (several `.skill.md` files) |
| `sys-troubleshoot` | `vpn-smb-access.skill.md`, `network-profile-fix.skill.md` |

## Project rules

- Always ask for missing required inputs before taking action.
- Never store credentials, passwords, or connection strings in repo files.
- Use Jira/Atlassian MCP tools when available for Jira operations; Atlassian MCP for Confluence.
- Use `sqlcmd` for SQL Server operations; always ask for server instance if not provided. Read SQL Server credentials from environment variables (`$env:SQLCMD_SERVER`, `$env:SQLCMD_USER`, `$env:SQLCMD_PASSWORD`). Always ask user for database name and backup file path — never cache these between sessions. Log all restore operations to `logs/db-restore-log.md`.
- Mask secrets (`***`) in all output.
- **One-off / throwaway files** go under **`local/ephemeral/`** (gitignored) or `logs/` — not under `src/` or tracked docs unless the user wants them committed.

## Legacy

The folder **`.github/copilot/skills/jira-automation/`** is **deprecated** in favor of **`.cursor/skill-library/jira-workflow.skill.md`**.
