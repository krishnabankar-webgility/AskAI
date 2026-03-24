# Copilot Instructions

## Project Guidelines
- User prefers custom agent files to be placed in .github/agents so they appear in the editor agent list.
- Always ask for missing required inputs before taking action.
- Never store credentials, passwords, or connection strings in repo files.
- Use Jira/Atlassian MCP tools when available for Jira operations.
- Use `sqlcmd` for SQL Server operations; ask for server instance if not provided.
- Mask secrets (`***`) in all output — never repeat full passwords.
- GitHub Copilot agent/skill updates should only affect .github/copilot files and not .cursor files.
