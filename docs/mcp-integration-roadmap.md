# MCP integration roadmap (AskAI)

Canonical procedures remain in `.cursor/skill-library/*.skill.md`. This document tells **humans and agents** which MCP servers are wired today, which integrations need OAuth/private apps, and **what to do next** so Claude Desktop, Cursor (local + Cloud), and other MCP-capable clients can share the same pattern.

## Where MCP configuration lives

| Context | Typical location |
|--------|-------------------|
| Cursor local desktop | `.cursor/mcp.json` under your opened workspace folder (often **`Agentic_Unify-Enterprise/.cursor/mcp.json`** when the root workspace contains AskAI). |
| Cursor Cloud Agents | Same repo `.cursor/mcp.json` plus secrets from **Cursor Dashboard → Cloud Agents → Secrets**. Env placeholders `${VAR}` in JSON resolve from injected secrets. |
| Claude Desktop | Claude config file per Anthropic docs (OS-specific path); merge equivalent `mcpServers` entries. |
| VS Code / GitHub Copilot agents | These consume AskAI agents/skills from `.github/agents/` and `.github/copilot/agents/`; MCP is still whichever runtime attaches servers for that chat session — reuse the same server definitions below. |

**Committed reference snippet:** extend your IDE JSON from `AskAI/docs/mcp-servers.example.json` (example blocks only — paste host-specific secrets locally).

## Your choices (locked for next implementation)

| Topic | Your answer |
|-------|-------------|
| Google | One GCP project for **Calendar + Gmail + Drive/Docs** (Meet note ingestion). |
| Meet / Gemini notes | **Gmail** (meeting recap / summary mail) and/or **Drive/Docs** (exported doc). |
| HubSpot | **Deferred** — no portal permission to create Private Apps; keep using Jira §A8 for HubSpot bridge text. |

## Single place for “connection” vs secrets (read this)

**What can live in Git (safe):** MCP server definitions in `.cursor/mcp.json` using **placeholders** such as `"${GOOGLE_OAUTH_CLIENT_ID}"` — same file for Cloud and Local. Skills/docs that list **secret names** only.

**Cursor Cloud Secrets (same keys as local env):** For Google, add at minimum **`GOOGLE_OAUTH_CLIENT_ID`**, **`GOOGLE_OAUTH_CLIENT_SECRET`** ([workspace-mcp](https://github.com/taylorwilsdon/google_workspace_mcp) naming). Optional: **`USER_GOOGLE_EMAIL`**, **`WORKSPACE_MCP_READ_ONLY=true`**.

**What must never go in GitHub:** Access tokens, refresh tokens, client secrets, private keys, or “example” tokens that look real. Anyone with repo read access could abuse them.

**Can Local Cursor read Cursor Cloud Secrets?** **No.** Cursor injects **Cloud Agents → Secrets** only into **cloud/scheduled** agent runs. The desktop app does not pull those values into your laptop session automatically.

**Practical “one naming convention, two injection points” pattern**

| Where you run | Where values live |
|---------------|-------------------|
| **Cursor Cloud Agent** | **Cursor Dashboard → Cloud Agents → Secrets** — keys must match env vars in `mcp.json` (e.g. `GOOGLE_OAUTH_CLIENT_ID`). |
| **Cursor local (desktop)** | **Windows User environment variables** (same names), or a **gitignored** `.env` loaded by a launcher, or a secrets manager CLI. Values stay on your machine. |

Both environments use the **same** `mcp.json` shape and **same variable names**; only the **storage location** of values differs. That is the closest feasible “single source” without a third-party vault.

**Optional upgrade:** A team vault (Doppler, 1Password CLI, Azure Key Vault, etc.) can supply the same names to CI, cloud, and local — still **no tokens in the repo**.

## Currently aligned with AskAI workflows

| Integration | Purpose | MCP / transport | Secrets |
|-------------|---------|------------------|---------|
| Jira | UD issues, §A8 comments, search | `@nexus2520/jira-mcp-server` via `npx` | `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_BASE_URL` |
| Slack | Daily digest post, search | `@modelcontextprotocol/server-slack` via `npx` | `SLACK_BOT_TOKEN`, `SLACK_TEAM_ID` |
| Bitbucket | PRs when MCP enabled in your Cursor project | User/project Bitbucket MCP (if listed under mcps) | `BITBUCKET_*` per `bitbucket-unify-enterprise.skill.md`; digest **git** still primary |

Daily digest (`daily-work-update.skill.md`) uses **Bitbucket `unify-enterprise` only** for repo commits/PRs — **no** GitHub `gh` in that digest.

## Google Workspace MCP — recommended (Gmail + Calendar + Drive/Docs, local **and** cloud)

Use **[workspace-mcp](https://github.com/taylorwilsdon/google_workspace_mcp)** ([PyPI `workspace-mcp`](https://pypi.org/project/workspace-mcp/)) — one server for **Gmail**, **Calendar**, **Drive** (and Docs), so Meet/Gemini summaries can be pulled from **email search** or **Drive file search** without a separate “Gemini MCP”.

### Prerequisites

1. **[uv](https://docs.astral.sh/uv/)** (runs `uvx workspace-mcp` without a global pip install). Install on Windows (pick one):  
   `pip install uv` · winget · or follow [Installing uv](https://docs.astral.sh/uv/getting-started/installation/).
2. **Confirm Cloud Agents have `uv`:** Open a **Cloud Agent** terminal once and run `uv --version`. If missing, use your team’s Cloud image/bootstrap to install `uv`, **or** fall back to the Node-based [`mcp-google-workspace`](https://github.com/j3k0/mcp-google-workspace) server **locally only** (file-based OAuth under `local/ephemeral/` — awkward for Cloud).

### Google Cloud project (one project for everything)

In [Google Cloud Console](https://console.cloud.google.com/) (same project throughout):

1. **APIs & Services → Library** — enable:
   - **Google Calendar API**
   - **Gmail API**
   - **Google Drive API** (for Docs/files Meet notes saved to Drive)
2. **OAuth consent screen**
   - User type: **Internal** if everyone is on your Google Workspace (fits your plan).
   - Add **test users** while in Testing, or **Publish** per [workspace-mcp / Google docs](https://github.com/taylorwilsdon/google_workspace_mcp) if you hit token expiry warnings.
3. **Credentials → Create Credentials → OAuth client ID**
   - Application type: **Desktop app** is typical for CLI/OAuth loop used by MCP stdio mode ([upstream notes](https://github.com/taylorwilsdon/google_workspace_mcp)).
   - Download / copy **Client ID** and **Client secret**.

### Cursor Secrets + local env (same names)

| Secret / env name | Value |
|-------------------|--------|
| `GOOGLE_OAUTH_CLIENT_ID` | From GCP OAuth client |
| `GOOGLE_OAUTH_CLIENT_SECRET` | From GCP OAuth client |
| `GOOGLE_REFRESH_TOKEN` | From local OAuth flow (run `scripts/extract-google-refresh-token.py`) — **required for Cloud Agents** |
| `USER_GOOGLE_EMAIL` | Default account: `krishna.bankar@webgility.com` |
| `WORKSPACE_MCP_READ_ONLY` | `true` — ask for readonly Gmail/Drive/Calendar scopes and disable write tools ([upstream](https://github.com/taylorwilsdon/google_workspace_mcp)) |

**Cursor Cloud:** [Dashboard → Cloud Agents → Secrets](https://cursor.com/dashboard?tab=cloud-agents) — add each row above.

**Cursor local (Windows):** Same variable names under **User** environment variables (restart Cursor).

### `mcp.json` fragment

Committed template: **`docs/mcp-servers.example.json`** (`google-workspace` server). Shape:

- **Command:** `uvx`
- **Args:** `workspace-mcp`, `--transport`, `stdio`, `--tool-tier`, `core`, `--read-only`, `--tools`, `gmail`, `drive`, `calendar`
- **Env:** `${GOOGLE_OAUTH_CLIENT_ID}`, `${GOOGLE_OAUTH_CLIENT_SECRET}`, plus optional `USER_GOOGLE_EMAIL`, `WORKSPACE_MCP_READ_ONLY`

### OAuth and `OAUTHLIB_INSECURE_TRANSPORT` (security)

Do **not** put `OAUTHLIB_INSECURE_TRANSPORT=1` in committed `mcp.json`, in **`docs/mcp-servers.example.json`**, or in **Cursor Cloud Agent Secrets**. That flag tells oauthlib to allow non-HTTPS OAuth flows and is [documented](https://oauthlib.readthedocs.io/en/latest/oauth2/security.html) as unsafe for production.

| Environment | Guidance |
|-------------|----------|
| **Cursor Cloud Agents** | Omit the flag. Use HTTPS OAuth as designed; persist tokens on the agent or prefer **service account + domain-wide delegation** (`GOOGLE_SERVICE_ACCOUNT_KEY_JSON` + `USER_GOOGLE_EMAIL`) for scheduled runs without interactive localhost callbacks. |
| **Local Cursor (desktop)** | If OAuth redirect is `http://localhost:8000/...` and the stack refuses HTTP loopback without the flag, set `OAUTHLIB_INSECURE_TRANSPORT=1` only in your **Windows User** environment (or a gitignored launcher), **not** in repo JSON — so cloud schedules never inherit it. |

### Authentication: local vs. Cloud

**Local desktop:** The server starts a **local OAuth callback** on `http://localhost:8000/oauth2callback` — complete the browser consent once; tokens are cached under `~/.google_workspace_mcp/credentials/`.

**Cursor Cloud Agents:** Cloud VMs cannot complete interactive browser OAuth flows. Use the **refresh-token bootstrap** approach:

1. **Extract your refresh token** from your local machine (after completing OAuth locally at least once):
   ```bash
   python scripts/extract-google-refresh-token.py
   ```
2. **Add the refresh token** as a Cursor Cloud Secret:
   - Go to [Cursor Dashboard → Cloud Agents → Secrets](https://cursor.com/dashboard?tab=cloud-agents)
   - Add secret: **`GOOGLE_REFRESH_TOKEN`** = (the value from step 1)
3. **Bootstrap runs automatically:** The `scripts/bootstrap-google-credentials.py` script exchanges the refresh token for a fresh access token and pre-seeds the credential file before `workspace-mcp` starts. The `.cursor/mcp.json` passes `GOOGLE_REFRESH_TOKEN` as an env var so the bootstrap can run.

The bootstrap script is idempotent and exits gracefully when `GOOGLE_REFRESH_TOKEN` is not set (local desktop use case).

**Token rotation:** Google may rotate the refresh token during a token refresh. The bootstrap script always uses the latest value from the `GOOGLE_REFRESH_TOKEN` secret. If token rotation causes failures, re-run `extract-google-refresh-token.py` locally and update the Cloud Secret.

**Alternative (requires Workspace admin):** Use **[service account + domain-wide delegation](https://github.com/taylorwilsdon/google_workspace_mcp)** (`GOOGLE_SERVICE_ACCOUNT_KEY_JSON` + `USER_GOOGLE_EMAIL`) for fully autonomous access.

### Meet / Gemini notes — queries to try after connect

- **Gmail:** tools/search with Gmail query syntax, e.g. `subject:(Meet OR "Gemini" OR recap) newer_than:7d`, `from:(messages-noreply@google.com OR meet)`, etc. (adjust labels/senders to match your org).
- **Drive:** search or list files modified yesterday containing “Meet” or the meeting title once Drive tools are enabled via the same MCP.

### Alternative (Node only, file OAuth): `mcp-google-workspace`

[`npx mcp-google-workspace`](https://github.com/j3k0/mcp-google-workspace) with `.gauth.json` / `.accounts.json` under **`local/ephemeral/google-workspace-mcp/`** (already under gitignored `local/ephemeral/`). Good for **desktop-only**; harder to operate on Cloud without file secrets.

## HubSpot — deferred (no Private App access)

Skip HubSpot MCP until an admin can create a **Private App** or grants you access. Short reference below stays for later.

### HubSpot Private App (when access exists)

HubSpot → **Settings** → **Integrations** → **Private Apps** → create app → **read-only** CRM scopes → copy token once → Cursor Secret `HUBSPOT_PRIVATE_APP_TOKEN`.

## Canonical secret names (same names → Cloud + Local)

Use one **stable name** per credential everywhere; only the **storage** differs (Dashboard Secrets vs Windows User env).

| Variable | Used for |
|----------|-----------|
| `GOOGLE_OAUTH_CLIENT_ID` | OAuth client ID (Workspace MCP / recommended stack) |
| `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth client secret |
| `GOOGLE_REFRESH_TOKEN` | Refresh token from local OAuth flow — needed for Cloud Agents (run `scripts/extract-google-refresh-token.py`) |
| `USER_GOOGLE_EMAIL` | Default account e.g. `krishna.bankar@webgility.com` |
| `WORKSPACE_MCP_READ_ONLY` | Set `true` for read-only OAuth scopes + no write tools (recommended for digest agents) |
| **HubSpot** | **Not in use** until Private App access exists (`HUBSPOT_PRIVATE_APP_TOKEN` reserved). |
| `JIRA_*`, `SLACK_*`, `BITBUCKET_*` | Existing AskAI workflows |

Older docs referred to `GOOGLE_CLIENT_ID` — **`workspace-mcp`** expects **`GOOGLE_OAUTH_CLIENT_ID`** / **`GOOGLE_OAUTH_CLIENT_SECRET`** ([upstream env table](https://github.com/taylorwilsdon/google_workspace_mcp)).

## Example merge (`docs/mcp-servers.example.json`)

See sibling file **`mcp-servers.example.json`** — copy `mcpServers` entries into your real `.cursor/mcp.json` and fill secrets via Cursor/env.

## What to tell your agent after setup

After OAuth works (browser consent completed at least once), say explicitly:

- **`workspace-mcp`** via **`uvx`** (`pypi workspace-mcp`), `--read-only`, tools `gmail` / `drive` / `calendar`.
- **`uv --version`** outcome on **Cloud Agent** (if Cloud fails to start the MCP, fix `uv` or switch strategy).
- Exact **secret names** in Cursor Cloud **and** locally (`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, …).

Then ask to extend **`daily-work-update.skill.md`** with concrete tool names and query shapes for Calendar + Gmail/Drive lines.

**HubSpot:** still deferred until Private App access exists.
