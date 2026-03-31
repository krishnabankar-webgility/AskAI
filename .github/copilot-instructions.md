# Copilot Instructions

## Project Guidelines
- **Canonical skills** live in **`.cursor/skill-library/*.md`**. GitHub Copilot agents (`.github/copilot/agents/*.agent.md`) **must reference those paths** so Cursor, VS Code, and Copilot stay aligned.
- Custom agents for the editor list: **`.github/agents/`** (e.g. `AskAI.agent.md`).
- Always ask for missing required inputs before taking action.
- Never store credentials, passwords, or connection strings in repo files.
- Use Jira/Atlassian MCP tools when available for Jira operations.
- Use `sqlcmd` for SQL Server operations; ask for server instance if not provided.
- Mask secrets (`***`) in all output — never repeat full passwords.
- **One-off / throwaway files** go under **`local/ephemeral/`** (gitignored) or `logs/` — not under `src/` or tracked docs unless the user wants them committed.
- When behavior changes, update **`.cursor/skill-library/`** first, then sync agent wrappers per **`.cursor/skill-library/askai-skill-evolution.md`**.
