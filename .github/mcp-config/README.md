# MCP (Model Context Protocol) Configuration

This directory contains configurations for connecting MCP servers to GitHub Copilot across different editors.

## Overview

MCP servers extend the capabilities of AI models by providing access to external systems like Jira. This setup enables GitHub Copilot to directly interact with Jira for automations.

## Configuration Files

### VS Code & Visual Studio Code

**File:** `vscode-mcp.json`

Used for connecting GitHub Copilot in VS Code to MCP servers including Jira.

#### How to Use in VS Code

1. **Option A: Using VS Code Settings Extension**
   - Install an MCP extension if available (check Visual Studio Marketplace)
   - Copy the configuration from `vscode-mcp.json` to your VS Code settings

2. **Option B: Manual Environment Setup**
   - Ensure `npx` is available in your PATH
   - Set environment variables:
     ```bash
     export JIRA_EMAIL="your-jira-email@example.com"
     export JIRA_API_TOKEN="your-jira-api-token"
     export JIRA_BASE_URL="https://your-instance.atlassian.net"
     ```

### Visual Studio (2022+)

MCP support in Visual Studio is emerging. Check the following:
- Visual Studio Marketplace for MCP-compatible extensions
- GitHub Copilot for Visual Studio documentation for MCP integration

## Supported MCP Servers

| Server | Purpose | Package |
|--------|---------|---------|
| **jira** | Jira workflow automation, issue management, sprint lifecycle | `@nexus2520/jira-mcp-server` |
| **slack** | Slack messaging, channel history, user lookup, notifications | `@modelcontextprotocol/server-slack` |

## Environment Variables

**Never commit credentials to the repository.** Use environment variables or secure credential management:

| Variable | Purpose | Example |
|----------|---------|---------|
| `JIRA_EMAIL` | Jira account email | `user@example.com` |
| `JIRA_API_TOKEN` | Jira API token (get from [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens)) | `(keep secret)` |
| `JIRA_BASE_URL` | Jira instance base URL | `https://mycompany.atlassian.net` |
| `SLACK_BOT_TOKEN` | Slack Bot OAuth Token (prefix `xoxb-`) from your Slack App's OAuth & Permissions page | `xoxb-xxxxxxxxxxxx-…` (example format; keep secret) |
| `SLACK_TEAM_ID` | Slack workspace (team) ID found in workspace settings or URL | `T01ABCDE123` (example format) |

### How to Set Environment Variables

**Windows (PowerShell):**
```powershell
[System.Environment]::SetEnvironmentVariable("JIRA_EMAIL", "your-email@example.com", "User")
[System.Environment]::SetEnvironmentVariable("JIRA_API_TOKEN", "your-token", "User")
[System.Environment]::SetEnvironmentVariable("JIRA_BASE_URL", "https://your-instance.atlassian.net", "User")
```

**macOS/Linux (Bash):**
```bash
export JIRA_EMAIL="your-email@example.com"
export JIRA_API_TOKEN="your-token"
export JIRA_BASE_URL="https://your-instance.atlassian.net"
```

Or add to `~/.bashrc` or `~/.zshrc` for persistence.

## Jira MCP Server Setup

### Prerequisites

- Node.js 16+ installed
- Jira Cloud account with API access enabled
- GitHub Copilot extension installed

### Installation Steps

1. **Get Jira API Token:**
   - Go to [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens)
   - Click "Create API token"
   - Copy the token (save securely)

2. **Set Environment Variables** (see section above)

3. **In VS Code:**
   - Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
   - Search for "Copilot: Configure MCP" or similar
   - Reference the `vscode-mcp.json` configuration
   - Restart VS Code

4. **Verify Connection:**
   - Open GitHub Copilot Chat
   - Try a Jira-related request (e.g., "Show my Jira issues")
   - Copilot should access Jira through the MCP server

## Cursor Editor (Reference)

For comparison, Cursor uses `.cursor/mcp.json` with the same structure. This project maintains both for consistency.

## Slack MCP Server Setup

### Prerequisites

- Node.js 16+ installed
- A Slack workspace with admin access to create an app
- GitHub Copilot extension installed

### Installation Steps

1. **Create a Slack App:**
   - Go to [https://api.slack.com/apps](https://api.slack.com/apps)
   - Click **Create New App → From scratch**
   - Name your app and select your workspace

2. **Add Bot Token Scopes** (OAuth & Permissions → Bot Token Scopes):
   - `channels:read`, `channels:history`, `chat:write`, `users:read`
   - Add more scopes as needed (see `slack-integration.md` for full list)

3. **Install App to Workspace** and copy the **Bot User OAuth Token** (`xoxb-…`)

4. **Set Environment Variables:**
   ```bash
   export SLACK_BOT_TOKEN="xoxb-your-token"
   export SLACK_TEAM_ID="T01ABCDE123"   # from Slack workspace settings or URL
   ```

5. **In VS Code:**
   - Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
   - Search for "Copilot: Configure MCP" or similar
   - Reference the `vscode-mcp.json` configuration (already includes the Slack server)
   - Restart VS Code

6. **Verify Connection:**
   - Open GitHub Copilot Chat
   - Try: `@slack-automation list my Slack channels`
   - Copilot should connect to Slack via the MCP server

## Troubleshooting

| Issue | Solution |
|-------|----------|
| MCP server not connecting | Verify environment variables are set; restart editor |
| "npx not found" | Install Node.js and npm globally |
| "API token invalid" (Jira) | Generate a new token from Atlassian Account Settings |
| `not_authed` (Slack) | Check `SLACK_BOT_TOKEN` starts with `xoxb-`; re-install app if expired |
| `not_in_channel` (Slack) | Invite the bot to the channel: `/invite @YourBotName` in Slack |
| `missing_scope` (Slack) | Add required scopes in Slack app settings and reinstall the app |
| Copilot not recognizing MCP | Check VS Code version; update to latest; verify extension enabled |
| Permission denied on Jira | Ensure API token has correct scope; check email matches account |

## Next Steps

- Integrate with `.github/copilot/agents/jira-automation.agent.md` for Jira automation
- Use `.github/copilot/agents/slack-automation.agent.md` for Slack automation
- Test Slack access via `@slack-automation` agent in Copilot Chat

## References

- [MCP Documentation](https://modelcontextprotocol.io)
- [Jira MCP Server GitHub](https://github.com/nexus2520/jira-mcp-server)
- [Slack MCP Server (official)](https://github.com/modelcontextprotocol/servers/tree/main/src/slack)
- [Slack API Apps](https://api.slack.com/apps)
- [GitHub Copilot Documentation](https://docs.github.com/en/copilot)
- [Visual Studio Code Documentation](https://code.visualstudio.com/docs)
