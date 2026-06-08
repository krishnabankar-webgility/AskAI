# Skill: Slack Integration (Cursor)

## Overview

This skill enables the **Slack Automation Agent** to interact with a Slack workspace via the **Slack MCP server**. It covers setup, authentication, available actions, and workflows for use in the Cursor editor (desktop or cloud agent).

---

## Secrets / Environment Variables

**Never commit tokens to the repository.** Store them in Cursor Dashboard → Cloud Agents → Secrets (for cloud agents) or as system environment variables (for desktop).

| Variable | Role | How to obtain |
|---|---|---|
| `SLACK_BOT_TOKEN` | OAuth Bot Token for your Slack app (prefix `xoxb-`) | Slack API → Your App → OAuth & Permissions → Bot User OAuth Token |
| `SLACK_TEAM_ID` | The workspace (team) ID (e.g. `T01ABCDE123`) | Slack Admin → Settings → Workspace Settings, or from any Slack URL |

### Desktop — setting environment variables

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

### Cursor Cloud Agent — secrets

1. Go to **Cursor Dashboard → Cloud Agents → Secrets**.
2. Add `SLACK_BOT_TOKEN` and `SLACK_TEAM_ID`.
3. They are injected as environment variables at agent runtime.

---

## MCP Configuration

The Slack MCP server is configured in `.cursor/mcp.json`:

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

After setting environment variables, **restart Cursor** for the MCP server to connect.

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
   | `search:read` | Search messages (**note:** full message search requires a user token; bot tokens have limited search access — use `channels:history` to scan recent messages instead) |

4. Click **Install App to Workspace** and copy the **Bot User OAuth Token** (`xoxb-…`).
5. Set `SLACK_BOT_TOKEN` to this token.
6. Find your **Team ID** from the workspace URL (`https://app.slack.com/client/TXXXXXXXX`).

---

## Available Actions (via Slack MCP)

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

---

## Constraints

- **Always resolve channel names to IDs** before calling history/post tools (use `slack_list_channels`).
- **Always resolve display names to user IDs** before DMing (use `slack_get_users`).
- For channels with `is_private: true`, the bot must be invited first.
- Do **not** post sensitive data (tokens, passwords, PII) to Slack channels.

---

## Troubleshooting

| Issue | Solution |
|---|---|
| `not_authed` or `invalid_auth` | Check `SLACK_BOT_TOKEN` — ensure it starts with `xoxb-` |
| `channel_not_found` | Verify the channel name; use `slack_list_channels` |
| `not_in_channel` | Invite the bot: `/invite @CopilotBot` in Slack |
| `missing_scope` | Add the required scope in Slack app settings, then reinstall |
| `npx not found` | Install Node.js 16+ from [nodejs.org](https://nodejs.org) |
| MCP server not starting | Restart Cursor after setting environment variables |

---

## Output Format

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
