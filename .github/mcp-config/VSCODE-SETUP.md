# VS Code MCP Configuration Guide for GitHub Copilot

This file provides step-by-step instructions for setting up MCP servers with GitHub Copilot in VS Code.

## Prerequisites

- VS Code 1.90+
- GitHub Copilot extension installed
- Node.js 16+
- Jira Cloud account with API token

## Option 1: Using `.vscode/settings.json` (Workspace-Level)

The `.vscode/settings.json` in this repository contains base settings for GitHub Copilot.

### Setup Steps

1. **Enable MCP in VS Code Settings:**
   - Open Command Palette: `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (macOS)
   - Type: `Preferences: Open Workspace Settings (JSON)`
   - Add or merge these settings:

   ```json
   {
     "github.copilot.enable": {
       "*": true,
       "plaintext": false,
       "markdown": false
     },
     "github.copilot.advanced": {
       "debug.overrideChatApiUrl": ""
     }
   }
   ```

2. **Verify MCP Extension:**
   - Open Extensions (`Ctrl+Shift+X` / `Cmd+Shift+X`)
   - Search: `GitHub.copilot`
   - Install if not already present
   - Reload window

## Option 2: Using Environment Variables (System-Level)

Set Jira credentials at the system level so MCP servers can access them.

### Windows (PowerShell - Admin):

```powershell
# Set environment variables
[System.Environment]::SetEnvironmentVariable("JIRA_EMAIL", "your-email@company.com", "User")
[System.Environment]::SetEnvironmentVariable("JIRA_API_TOKEN", "your-secret-token", "User")
[System.Environment]::SetEnvironmentVariable("JIRA_BASE_URL", "https://company.atlassian.net", "User")

# Verify
Get-ChildItem env: | ? { $_.Name -match "JIRA" }
```

### macOS/Linux (Bash):

```bash
# Add to ~/.bashrc, ~/.zshrc, or ~/.bash_profile
export JIRA_EMAIL="your-email@company.com"
export JIRA_API_TOKEN="your-secret-token"
export JIRA_BASE_URL="https://company.atlassian.net"

# Reload shell
source ~/.bashrc  # or ~/.zshrc
```

## Option 3: Using `.env` File (Development Only)

**Warning:** `.env` files should NOT be committed. Add to `.gitignore`:

```bash
echo ".env.local" >> .gitignore
```

Then create `.env.local`:

```
JIRA_EMAIL=your-email@company.com
JIRA_API_TOKEN=your-secret-token
JIRA_BASE_URL=https://company.atlassian.net
```

Load in terminal before running VS Code:
```bash
source .env.local
code .
```

## Option 4: Using `.vscode/launch.json` (Debug Configuration)

For VS Code debugging sessions with environment variables:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "VS Code with MCP",
      "type": "extensionHost",
      "request": "launch",
      "args": ["${workspaceFolder}"],
      "env": {
        "JIRA_EMAIL": "${env:JIRA_EMAIL}",
        "JIRA_API_TOKEN": "${env:JIRA_API_TOKEN}",
        "JIRA_BASE_URL": "${env:JIRA_BASE_URL}"
      }
    }
  ]
}
```

## Testing MCP Connection

### Test 1: Verify Environment Variables

**Windows (PowerShell):**
```powershell
$env:JIRA_EMAIL
$env:JIRA_API_TOKEN
$env:JIRA_BASE_URL
```

**macOS/Linux (Bash):**
```bash
echo $JIRA_EMAIL
echo $JIRA_API_TOKEN
echo $JIRA_BASE_URL
```

### Test 2: Test npx Command

```bash
# Verify npx can run the Jira MCP server
npx -y @nexus2520/jira-mcp-server --help
```

### Test 3: Use Copilot Chat

1. Open GitHub Copilot Chat (`Ctrl+Shift+L` / `Cmd+Shift+L`)
2. Try these requests:
   - "Show my Jira issues"
   - "Create a Jira story for login feature"
   - "List all sprints"

If MCP is working, Copilot will use the Jira server to retrieve live data.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "MCP server not found" | Ensure `.github/mcp-config/vscode-mcp.json` is present; restart VS Code |
| "npx not found" | Install Node.js from [nodejs.org](https://nodejs.org); add to PATH |
| "API token invalid" | Generate new token from [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens) |
| Environment vars not loading | Restart VS Code or terminal after setting variables |
| Copilot not responding | Check Copilot extension version; update if needed |
| Jira connection timeout | Verify `JIRA_BASE_URL` is correct; check internet connection |

## Integration with KrishnaAIGen Agent

Once MCP is configured, the `@KrishnaAIGen` agent can automatically:
- Route Jira requests to the `git-automation` and `jira-automation` subagents
- Access Jira directly through the MCP server
- Execute Jira workflows with live data

Example in Copilot Chat:
```
@KrishnaAIGen create a story for user authentication with subtasks
```

## Visual Studio Support

Visual Studio 2022 with GitHub Copilot extension has limited MCP support currently. Recommended approach:

1. Use VS Code for Jira-heavy workflows
2. Use Visual Studio for main development with Copilot code generation
3. Or check Visual Studio Marketplace for emerging MCP support

## Security Best Practices

- ✅ Store tokens in environment variables (never in code)
- ✅ Use workspace-level `.vscode/settings.json` (committed to repo)
- ✅ Use `$(env:VAR_NAME)` syntax for secret references
- ❌ Do NOT commit API tokens to git
- ❌ Do NOT hardcode credentials in settings
- ❌ Do NOT use production tokens in shared workspaces

## References

- [Model Context Protocol](https://modelcontextprotocol.io)
- [Jira MCP Server](https://github.com/nexus2520/jira-mcp-server)
- [GitHub Copilot in VS Code](https://docs.github.com/en/copilot/using-github-copilot/getting-started-with-github-copilot?tool=vscode)
- [VS Code Settings Reference](https://code.visualstudio.com/docs/getstarted/settings)
- [Atlassian API Tokens](https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/)
