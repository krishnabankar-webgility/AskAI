# Skill: Slack Integration (GitHub Copilot)

## Overview

This skill enables the **Slack Automation Agent** to interact with a Slack workspace via the **Slack MCP server**. It covers setup, authentication, available actions, and workflows for both VS Code desktop and GitHub.com cloud Copilot.

---

## Secrets / Environment Variables

**Never commit tokens to the repository.** Store them as environment variables or in your editor's secrets store.

| Variable | Role | How to obtain |
|---|---|---|
| `SLACK_BOT_TOKEN` | OAuth Bot Token for your Slack app (prefix `xoxb-`) | Slack API → Your App → OAuth & Permissions → Bot User OAuth Token |
| `SLACK_TEAM_ID` | The workspace (team) ID (e.g. `T01ABCDE123`) | Slack Admin → Settings → Workspace Settings, or from any Slack URL |

### VS Code Desktop — setting environment variables

**Windows (PowerShell):**
```powershell
[System.Environment]::SetEnvironmentVariable("SLACK_BOT_TOKEN", "xoxb-your-token", "User")
[System.Environment]::SetEnvironmentVariable("SLACK_TEAM_ID", "T01ABCDE123", "User")
```

**macOS / Linux (Bash):**
```bash
export SLACK_BOT_TOKEN="xoxb-your-token"
export SLACK_TEAM_ID="T01ABCDE123"
# Add to ~/.bashrc or ~/.zshrc for persistence, then: source ~/.bashrc
```

### GitHub Copilot Cloud (github.com) — Codespace / repository secrets

1. Go to **Settings → Secrets and variables → Codespaces** (for Codespaces) or supply them in your Codespace's `.devcontainer/devcontainer.json` under `"remoteEnv"`.
2. Add `SLACK_BOT_TOKEN` and `SLACK_TEAM_ID` as **Codespace secrets**.
3. They are injected automatically when the Codespace starts.

---

## MCP Server Setup

The Slack MCP server is configured in:
- **VS Code / desktop Copilot:** `.github/mcp-config/vscode-mcp.json`
- **Cursor:** `.cursor/mcp.json`

### Package

```
@modelcontextprotocol/server-slack
```

### MCP Configuration (already added to repo config files)

```json
"slack": {
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-slack"],
  "env": {
    "SLACK_BOT_TOKEN": "${SLACK_BOT_TOKEN}",
    "SLACK_TEAM_ID": "${SLACK_TEAM_ID}"
  }
}
```

---

## Creating a Slack App

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps) and click **Create New App → From scratch**.
2. Name the app (e.g. `CopilotBot`) and select your workspace.
3. Under **OAuth & Permissions → Bot Token Scopes**, add the scopes required for your use case:

   | Scope | Purpose |
   |---|---|
   | `channels:read` | List public channels |
   | `channels:history` | Read messages from public channels |
   | `chat:write` | Send messages as the bot |
   | `users:read` | Look up workspace users |
   | `groups:read` | List private channels the bot is in |
   | `im:read` | List direct messages |
   | `im:write` | Open DM conversations |
   | `mpim:read` | List group DMs |
   | `search:read` | Search messages (**note:** full message search requires a user token; bot tokens have limited search access — consider using `channels:history` to scan recent messages instead) |

4. Click **Install App to Workspace** and copy the **Bot User OAuth Token** (`xoxb-…`).
5. Set `SLACK_BOT_TOKEN` to this token.
6. Find your **Team ID** from the workspace URL (`https://app.slack.com/client/TXXXXXXXX`) or workspace settings page.

---

## Available Actions (via Slack MCP)

When the Slack MCP server is active, the following tools are available:

| Action | Description |
|---|---|
| `slack_list_channels` | List all public channels in the workspace |
| `slack_get_channel_history` | Retrieve recent messages from a channel |
| `slack_post_message` | Send a message to a channel or user |
| `slack_reply_to_thread` | Reply to an existing thread |
| `slack_add_reaction` | Add an emoji reaction to a message |
| `slack_get_users` | List workspace members |
| `slack_get_user_profile` | Get profile details for a specific user |

---

## Example Workflows

### Send a message to a Slack channel
```
User: Send "Deployment complete ✅" to #deployments
Agent: Uses slack_post_message → channel: #deployments, text: "Deployment complete ✅"
```

### Read the last 10 messages from a channel
```
User: Show me the last 10 messages in #general
Agent: Uses slack_get_channel_history → channel: #general, limit: 10
```

### Look up a user
```
User: Find the Slack profile for John Smith
Agent: Uses slack_get_users → filter by display name / real name containing "John Smith"
```

### Send a direct message
```
User: DM @krishna "PR review needed on branch feature/login"
Agent: Uses slack_get_users to resolve user ID, then slack_post_message to their DM channel
```

---

## Constraints

- **Always resolve channel names to IDs** before calling history/post tools (use `slack_list_channels`).
- **Always resolve display names to user IDs** before DMing (use `slack_get_users`).
- For channels with `is_private: true`, the bot must be invited first — inform the user if access is denied.
- Do **not** post sensitive data (tokens, passwords, PII) to Slack channels.

---

## Troubleshooting

| Issue | Solution |
|---|---|
| `not_authed` or `invalid_auth` | Check `SLACK_BOT_TOKEN` — ensure it starts with `xoxb-` and is not expired |
| `channel_not_found` | Verify the channel name is correct; use `slack_list_channels` to browse |
| `not_in_channel` | Invite the bot to the channel: `/invite @CopilotBot` in Slack |
| `missing_scope` | Add the required scope under OAuth & Permissions in the Slack app settings, then reinstall |
| `npx not found` | Install Node.js 16+ from [nodejs.org](https://nodejs.org) |
| MCP server not starting | Restart VS Code / Cursor after setting environment variables |

---

## Output Format

After completing a Slack action, report:

```
✅ Slack action: <action taken>
   Channel/User: <target>
   Result: <confirmation message or data summary>
```

For errors:
```
❌ Slack error: <error description>
   Suggested fix: <solution from troubleshooting table above>
```
