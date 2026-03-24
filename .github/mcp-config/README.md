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

## Environment Variables

**Never commit credentials to the repository.** Use environment variables or secure credential management:

| Variable | Purpose | Example |
|----------|---------|---------|
| `JIRA_EMAIL` | Jira account email | `user@example.com` |
| `JIRA_API_TOKEN` | Jira API token (get from [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens)) | `(keep secret)` |
| `JIRA_BASE_URL` | Jira instance base URL | `https://mycompany.atlassian.net` |

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

## Troubleshooting

| Issue | Solution |
|-------|----------|
| MCP server not connecting | Verify environment variables are set; restart editor |
| "npx not found" | Install Node.js and npm globally |
| "API token invalid" | Generate a new token from Atlassian Account Settings |
| Copilot not recognizing MCP | Check VS Code version; update to latest; verify extension enabled |
| Permission denied on Jira | Ensure API token has correct scope; check email matches account |

## Next Steps

- Integrate with `.github/copilot/agents/jira-automation.agent.md` for enhanced automation
- Add more MCP servers (e.g., GitHub API, Slack) as needed
- Test Jira access via `@git-automation` agent in Copilot Chat

## References

- [MCP Documentation](https://modelcontextprotocol.io)
- [Jira MCP Server GitHub](https://github.com/nexus2520/jira-mcp-server)
- [GitHub Copilot Documentation](https://docs.github.com/en/copilot)
- [Visual Studio Code Documentation](https://code.visualstudio.com/docs)
