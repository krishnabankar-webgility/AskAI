# WD ES Kibana Daily Report — Automation Setup Guide

This guide walks through setting up the **WD ES Kibana Daily Report** automation on **GitHub Copilot** and **Claude Code**, mirroring the existing **Cursor Cloud Automation** setup.

---

## Table of Contents

- [Current Setup (Cursor Cloud)](#current-setup-cursor-cloud)
- [Option A: GitHub Copilot — GitHub Agentic Workflows (Recommended)](#option-a-github-copilot--github-agentic-workflows-recommended)
- [Option B: GitHub Copilot — Coding Agent via GitHub Issues](#option-b-github-copilot--coding-agent-via-github-issues)
- [Option C: Claude Code — Routines (Anthropic Cloud)](#option-c-claude-code--routines-anthropic-cloud)
- [Comparison Table](#comparison-table)
- [Credentials Reference](#credentials-reference)

---

## Current Setup (Cursor Cloud)

The existing Cursor Automation at [cursor.com/automations](https://cursor.com/automations):
- **Trigger:** Scheduled daily (09:00 IST / 03:30 UTC, Mon–Fri) + webhook
- **Agent:** Reads `.cursor/agents/wd-es-kibana.agent.md` + `.cursor/skill-library/wd-es-kibana.skill.md`
- **Credentials:** `KIBANA_WD_AUTH` injected via Cursor Cloud Secrets
- **Output:** Self-contained HTML report committed to `reports/wd-kibana-logs/`
- **Delivery:** Cursor Automation's built-in "Send to Slack" tool posts the summary + htmlpreview link

---

## Option A: GitHub Copilot — GitHub Agentic Workflows (Recommended)

**GitHub Agentic Workflows** (`gh-aw`) is the most direct equivalent of Cursor Automations. It uses markdown workflow files in `.github/workflows/` that define agent instructions + YAML frontmatter for triggers, permissions, and tools. Workflows run on GitHub Actions runners with an AI engine (Copilot, Claude, Codex, or Gemini).

### Prerequisites

| Requirement | Details |
|-------------|---------|
| GitHub Copilot Premium subscription | Required for the Copilot engine |
| GitHub CLI (`gh`) v2.0.0+ | [Install](https://cli.github.com/) — verify with `gh --version` |
| `gh-aw` extension | `gh extension install github/gh-aw` |
| GitHub Actions enabled | Repo Settings → Actions → enable |
| `COPILOT_GITHUB_TOKEN` secret | Fine-grained PAT with **Copilot Requests: Read** permission |
| `KIBANA_WD_AUTH` secret | Kibana WD LDAP `username:password` |

### Step 1 — Install the `gh-aw` CLI Extension

```bash
gh extension install github/gh-aw
```

Verify:
```bash
gh aw --version
```

### Step 2 — Initialize the Repository (One-Time)

From the repo root:
```bash
gh aw init
```

This creates:
- `.github/agents/agentic-workflows.agent.md` — dispatcher agent for Copilot
- Updates `.gitattributes` for generated `.lock.yml` files

### Step 3 — Add the `COPILOT_GITHUB_TOKEN` Secret

Create a [fine-grained PAT](https://github.com/settings/personal-access-tokens/new?name=COPILOT_GITHUB_TOKEN&description=GitHub+Agentic+Workflows+-+Copilot+engine+authentication&user_copilot_requests=read) with:
- **Resource owner:** Your personal account (not an organization)
- **Permissions → Account permissions → Copilot Requests:** Read

Add it as a repository secret:
```bash
gh aw secrets set COPILOT_GITHUB_TOKEN --value "ghp_your_token_here"
```

### Step 4 — Add the `KIBANA_WD_AUTH` Secret

```bash
gh secret set KIBANA_WD_AUTH --body "username:password"
```

Replace `username:password` with the actual Kibana WD LDAP credentials.

### Step 5 — Create the Workflow File

The workflow file is already provided at `.github/workflows/wd-kibana-daily-report.md` in this repo. It contains:

- **Frontmatter:** Schedule trigger (daily weekdays at 03:30 UTC = 09:00 IST), manual `workflow_dispatch`, .NET 8 runtime, network allowlist for `kibana-wd.webgility.com` and `github.com`
- **Markdown body:** Full agent instructions matching the Cursor Automation prompt

If you need to create it manually, see the template below or copy from the repo.

### Step 6 — Compile the Workflow

```bash
gh aw compile
```

This generates `.github/workflows/wd-kibana-daily-report.lock.yml` — the GitHub Actions YAML that actually runs.

### Step 7 — Commit and Push

```bash
git add .github/workflows/wd-kibana-daily-report.md
git add .github/workflows/wd-kibana-daily-report.lock.yml
git commit -m "Add WD Kibana daily report agentic workflow"
git push -u origin master
```

### Step 8 — Test with a Manual Run

From the CLI:
```bash
gh aw run wd-kibana-daily-report
```

Or from the GitHub Actions tab → select "WD ES Kibana Daily Report" → "Run workflow".

### Step 9 — Verify

1. Wait 2–5 minutes for the workflow to complete
2. Check the Actions tab for the run output
3. Verify the HTML report was committed to `reports/wd-kibana-logs/`
4. Check the created GitHub Issue (if safe-outputs is configured) or Slack delivery

### Slack Delivery (Optional)

For Slack delivery from GitHub Agentic Workflows, you have two options:

**Option 1 — Slack MCP Connector:**
Add a custom MCP server for Slack in the workflow frontmatter and include `SLACK_BOT_TOKEN` as a secret.

**Option 2 — MCP Script (inline):**
Use `mcp-scripts:` in the frontmatter to define an inline Slack posting script.

**Option 3 — Post-step webhook:**
Add a `post-steps:` section that curls a Slack webhook with the report summary.

### Workflow File Reference

The complete workflow file is at `.github/workflows/wd-kibana-daily-report.md`. Key sections:

```yaml
---
on:
  schedule: "30 3 * * 1-5"   # 03:30 UTC = 09:00 IST, Mon-Fri
  workflow_dispatch:
engine: copilot
description: "Daily WD Kibana Elasticsearch log report"
permissions:
  contents: read
network:
  allowed:
    - defaults
    - "kibana-wd.webgility.com"
    - "github.com"
secrets:
  KIBANA_WD_AUTH: ${{ secrets.KIBANA_WD_AUTH }}
tools:
  bash: ["curl", "node", "base64"]
  edit:
safe-outputs:
  create-issue:
    title-prefix: "WD Kibana Daily Report"
timeout-minutes: 30
---

# Agent Instructions
...
```

---

## Option B: GitHub Copilot — Coding Agent via GitHub Issues

This is a simpler but less automated approach using the **Copilot Coding Agent** (assign an issue to `@copilot`).

### How It Works

1. Create a GitHub Issue with the report generation instructions
2. Assign it to `@copilot`
3. Copilot creates a branch, generates the report, and opens a PR

### Limitations

- **No built-in schedule trigger** — you need an external cron to create issues
- Copilot creates PRs, not direct commits (requires manual merge)
- Less control over the execution environment

### Setup

#### Step 1 — Create `copilot-setup-steps.yml`

This file (at `.github/workflows/copilot-setup-steps.yml`) configures the Copilot coding agent's environment:

```yaml
name: "Copilot Setup Steps"
on: workflow_dispatch

jobs:
  copilot-setup-steps:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup .NET 8
        uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '8.0.x'

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Set KIBANA_WD_AUTH
        run: echo "KIBANA_WD_AUTH=${{ secrets.KIBANA_WD_AUTH }}" >> $GITHUB_ENV
```

#### Step 2 — Configure Copilot Agent Instructions

The existing `.github/copilot/agents/wd-es-kibana.agent.md` already serves as the Copilot agent definition. Copilot Coding Agent reads `.github/copilot/` agent files automatically.

#### Step 3 — Add MCP Configuration (Optional)

For Copilot to connect to external MCP tools, create `.github/copilot/mcp.json`:
```json
{
  "servers": {}
}
```

#### Step 4 — Trigger via GitHub Issue

Create an issue with this body:

```markdown
## WD ES Kibana Daily Report

Generate the daily WD Kibana log report for today.

1. Read `.cursor/skill-library/wd-es-kibana.skill.md` for the full procedure
2. Use `KIBANA_WD_AUTH` env variable for Kibana authentication
3. Time window: yesterday 9:00 AM IST to today 9:00 AM IST
4. Generate self-contained HTML report
5. Save to `reports/wd-kibana-logs/{TODAY}-wd-kibana-daily-report.html`
6. Commit and push
```

Assign the issue to **@copilot**.

#### Step 5 — Automate with GitHub Actions Cron (Optional)

To auto-create issues on a schedule:

```yaml
# .github/workflows/kibana-report-trigger.yml
name: Trigger Kibana Report
on:
  schedule:
    - cron: '30 3 * * 1-5'  # 03:30 UTC = 09:00 IST, Mon-Fri
  workflow_dispatch:

jobs:
  create-issue:
    runs-on: ubuntu-latest
    steps:
      - name: Create issue for Copilot
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          TODAY=$(date +%Y-%m-%d)
          gh issue create \
            --repo ${{ github.repository }} \
            --title "WD Kibana Daily Report — ${TODAY}" \
            --body "Generate the daily WD Kibana log report. Read .cursor/skill-library/wd-es-kibana.skill.md for the full procedure. Use KIBANA_WD_AUTH for auth. Time window: yesterday 9 AM IST to today 9 AM IST. Save HTML to reports/wd-kibana-logs/${TODAY}-wd-kibana-daily-report.html." \
            --assignee "copilot"
```

---

## Option C: Claude Code — Routines (Anthropic Cloud)

**Claude Code Routines** are the closest equivalent to Cursor Automations on the Anthropic side. They run on Anthropic-managed cloud infrastructure and support scheduled, API, and GitHub event triggers.

### Prerequisites

| Requirement | Details |
|-------------|---------|
| Claude Pro, Max, Team, or Enterprise plan | With Claude Code on the web enabled |
| GitHub connected | For repo cloning and PR creation |
| `KIBANA_WD_AUTH` | Set as environment variable in Claude cloud environment |

### Step 1 — Enable Claude Code on the Web

Go to [claude.ai/settings](https://claude.ai/settings) and ensure Claude Code is enabled for your account.

### Step 2 — Connect GitHub

If not already connected, run `/web-setup` in a Claude Code CLI session, or connect GitHub from [claude.ai/settings](https://claude.ai/settings).

### Step 3 — Create a Cloud Environment

1. Go to [claude.ai/code/environments](https://claude.ai/code) → Environments
2. Create a new environment (or edit "Default"):
   - **Name:** `WD Kibana Report`
   - **Network access:** Custom
   - **Allowed domains:** Add `kibana-wd.webgility.com` + check "Also include default list"
   - **Environment variables:** Add `KIBANA_WD_AUTH` = `username:password`
   - **Setup script** (optional):
     ```bash
     curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
     apt-get install -y nodejs
     ```
3. Save

### Step 4 — Create the Routine

1. Go to [claude.ai/code/routines](https://claude.ai/code/routines)
2. Click **New routine**
3. Fill in:

**Name:** `WD ES Kibana Daily Report`

**Model:** Claude Sonnet 4 (or latest)

**Prompt:**
```
You are the WD ES Kibana agent. Generate the daily WD Kibana log report in HTML format.

Steps:
1. Read .cursor/skill-library/wd-es-kibana.skill.md for the full procedure, credentials, and query templates.
2. Read .cursor/agents/wd-es-kibana.agent.md for the HTML report template.
3. Credentials: use KIBANA_WD_AUTH from environment variables (base64-encode for Basic auth header).
4. Time window: yesterday 9:00 AM IST to today 9:00 AM IST (03:30 UTC to 03:30 UTC).
5. Query Kibana WD via HTTPS API (curl). Include kbn-xsrf: true header.
6. Query the previous day's window too (for vs-previous comparison badges).
7. Generate Kibana short URLs for all drilldown links (POST /api/shorten_url).
8. Report date = TODAY (generation date). 
9. Save to reports/wd-kibana-logs/{TODAY}-wd-kibana-daily-report.html
10. Commit and push the HTML report.
11. Include a SHORT SUMMARY + htmlpreview.github.io link in your final response.
12. Do not ask for confirmation — this is an automated run.
```

**Repositories:** Select `krishnabankar-webgility/AskAI`

**Environment:** Select `WD Kibana Report` (or Default with KIBANA_WD_AUTH configured)

### Step 5 — Add Schedule Trigger

Under **Select a trigger**:
- Choose **Schedule**
- Select **Weekdays** (Mon-Fri)
- Set time to **09:00 AM** in your timezone (IST)

### Step 6 — (Optional) Add API Trigger

Click **Add another trigger** → **API**
- Save the routine first
- Copy the **endpoint URL** and **generate a bearer token**
- Store the token securely

Trigger on demand:
```bash
curl -X POST https://api.anthropic.com/v1/claude_code/routines/trig_XXXXX/fire \
  -H "Authorization: Bearer sk-ant-oat01-xxxxx" \
  -H "anthropic-beta: experimental-cc-routine-2026-04-01" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{"text": "Generate daily report for today"}'
```

### Step 7 — Add Slack Connector (Optional)

Under **Connectors**, add the Slack MCP connector if you want Claude to post directly to Slack. Alternatively, use the API trigger from a Slack slash command.

### Step 8 — Test

Click **Run now** on the routine detail page to test immediately. Open the resulting session to verify the report was generated correctly.

### Claude Code via GitHub Actions (Alternative)

If you prefer GitHub Actions instead of Anthropic Routines:

```yaml
# .github/workflows/kibana-report-claude.yml
name: WD Kibana Daily Report (Claude)
on:
  schedule:
    - cron: '30 3 * * 1-5'
  workflow_dispatch:

jobs:
  generate-report:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Claude Code
        uses: anthropics/claude-code-action@v1
        with:
          prompt: |
            Generate the daily WD Kibana log report.
            Read .cursor/skill-library/wd-es-kibana.skill.md for the procedure.
            Use KIBANA_WD_AUTH env var for authentication.
            Save HTML report to reports/wd-kibana-logs/ and commit.
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          KIBANA_WD_AUTH: ${{ secrets.KIBANA_WD_AUTH }}
```

---

## Comparison Table

| Feature | Cursor Automation | GitHub Agentic Workflows | Copilot Coding Agent | Claude Routines |
|---------|-------------------|--------------------------|----------------------|-----------------|
| **Schedule trigger** | Cron in Automation UI | `on: schedule` in frontmatter | External (GH Actions cron → issue) | Built-in schedule picker |
| **Manual trigger** | Webhook URL | `workflow_dispatch` + `gh aw run` | Assign issue to @copilot | "Run now" button + API |
| **API trigger** | Webhook POST | `workflow_dispatch` API | GitHub API (create issue) | HTTP POST with bearer token |
| **Agent instructions** | Paste in Automation UI | Markdown body in `.md` file | `.github/copilot/agents/*.agent.md` | Prompt in routine config |
| **Secrets** | Cursor Cloud Secrets | GitHub Actions Secrets | GitHub Actions Secrets | Cloud Environment Variables |
| **Slack delivery** | Built-in "Send to Slack" | MCP/webhook/post-step | Manual (via workflow) | MCP Connector or API webhook |
| **Output** | Commit to repo | Commit/Issue/PR (safe-outputs) | PR (branch + merge) | Commit to `claude/` branch or PR |
| **Subscription** | Cursor (any plan) | GitHub Copilot Premium | GitHub Copilot Premium | Claude Pro/Max/Team/Enterprise |
| **Runs on** | Cursor Cloud VM | GitHub Actions runner | GitHub Actions runner | Anthropic Cloud |
| **Network access** | Unrestricted | Configurable allowlist | GitHub-hosted runner | Configurable allowlist |

---

## Credentials Reference

All three platforms need the same core credential:

| Secret | Value | Where to set |
|--------|-------|-------------|
| `KIBANA_WD_AUTH` | `username:password` (Kibana WD LDAP) | **Cursor:** Cloud Secrets · **GitHub:** Actions Secrets · **Claude:** Environment Variables |

Platform-specific credentials:

| Platform | Secret | Value |
|----------|--------|-------|
| GitHub (Copilot engine) | `COPILOT_GITHUB_TOKEN` | Fine-grained PAT with Copilot Requests: Read |
| GitHub (Claude engine) | `ANTHROPIC_API_KEY` | Anthropic API key |
| Claude Routines | (none extra) | Uses your Claude account subscription |
| Slack (optional) | `SLACK_BOT_TOKEN` | Only needed if posting to Slack via MCP/webhook |

---

## Troubleshooting

### GitHub Agentic Workflows

- **"Resource not accessible by personal access token"** — The PAT is missing the Copilot Requests permission. Regenerate with the correct scope.
- **Workflow not triggering** — Ensure the `.md` and `.lock.yml` are on the default branch. Run `gh aw compile` after any frontmatter changes.
- **Network errors to Kibana** — Add `kibana-wd.webgility.com` to `network.allowed` in the frontmatter.

### Copilot Coding Agent

- **Copilot doesn't pick up the issue** — Ensure Copilot coding agent is enabled in repo Settings → Copilot.
- **Missing environment setup** — Verify `copilot-setup-steps.yml` is on the default branch.

### Claude Routines

- **"Routines are disabled"** — Your org admin may have disabled routines. Check [claude.ai/admin-settings/claude-code](https://claude.ai/admin-settings/claude-code).
- **403 on Kibana requests** — Add `kibana-wd.webgility.com` to the cloud environment's Allowed Domains.
- **Branch push restrictions** — Enable "Allow unrestricted branch pushes" for the repo in the routine settings, or let Claude push to `claude/` branches only.
