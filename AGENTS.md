# AskAI

## Cursor Cloud specific instructions

### Technology Stack
- **Language/Framework:** C# / .NET 8 (LTS)
- **Project Type:** Console application + optional **ASP.NET Core** catalog site
- **Solution file:** `AskAI.sln` (root)
- **Main project:** `src/AskAI/AskAI.csproj`
- **Web catalog:** `src/AskAI.Web/AskAI.Web.csproj` (browser UI for agents, skills, prompts, and a keyword “catalog assistant”)
- **Test project:** `tests/AskAI.Tests/AskAI.Tests.csproj` (xUnit)

### .NET SDK Setup
The .NET 8 SDK is installed at `$HOME/.dotnet`. The PATH is configured in `~/.bashrc`:
```
export DOTNET_ROOT=$HOME/.dotnet
export PATH=$DOTNET_ROOT:$PATH
```

### Python tooling (`uv` / `uvx`)
`uv` (Astral) is installed via `pip install uv`. Both `uv` and `uvx` are on PATH. This is required for the Google Workspace MCP server (`uvx workspace-mcp`) used by the `daily-work-update` agent.

### Git Remotes

| Alias | URL | Purpose |
|-------|-----|---------|
| `origin` | `https://github.com/krishnabankar-webgility/AskAI` | Primary GitHub remote |
| `bitbucket` | `https://bitbucket.org/webgility/unify-enterprise.git` | Bitbucket — `unify-enterprise` |

### Cloud Agent secrets (Bitbucket + `unify-enterprise`)

In **Cursor Dashboard → Cloud Agents → Secrets**, define at least:

| Secret | Injected as | Purpose |
|--------|-------------|---------|
| Bitbucket username | `BITBUCKET_USERNAME` | Account **slug** (e.g. `krishnabankar`), not an email address. |
| Bitbucket token | `BITBUCKET_TOKEN` | **Bitbucket HTTP access token** with repo **Read** (and **Write** to push). |

**Agent skill pack:** `.cursor/skill-library/bitbucket-unify-enterprise.skill.md` (clone, authenticated remote URL, push, PR workflow vs MCP). **Subagent:** type **`/bitbucket-automation`** in Agent mode to load Git safety rules + that skill.

### Cloud Agent secrets (Slack)

In **Cursor Dashboard → Cloud Agents → Secrets** (for cloud) or as system environment variables (for desktop), define:

| Secret | Injected as | Purpose |
|----------------------------------------|----------------------|--------------------------------------------------------------|
| Slack bot token | `SLACK_BOT_TOKEN` | OAuth Bot Token (`xoxb-…`) from your Slack App → OAuth & Permissions |
| Slack team ID | `SLACK_TEAM_ID` | Workspace (team) ID (e.g. `T01ABCDE123`) from workspace settings |

**Agent skill pack:** `.cursor/skill-library/slack-integration.skill.md`. **Subagent:** type **`/slack-automation`** in Agent mode.

### Cloud Agent secrets (Google Workspace MCP)

Google Workspace MCP (`workspace-mcp` via `uvx`) requires an interactive browser OAuth flow on first use. On **local desktop Cursor**, this happens automatically. On **Cloud Agents**, the VM cannot open a browser, so a **refresh token** must be pre-seeded.

**Setup (one-time):**

1. Complete the Google OAuth flow **locally** (open Cursor desktop, enable the `google-workspace` MCP, authenticate in browser).
2. Run the extraction script on your local machine:
   ```bash
   python scripts/extract-google-refresh-token.py
   ```
3. Add the extracted refresh token as a Cloud Secret.

| Secret | Injected as | Purpose |
|--------|-------------|---------|
| Google OAuth Client ID | `GOOGLE_OAUTH_CLIENT_ID` | OAuth client ID from GCP Console |
| Google OAuth Client Secret | `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth client secret from GCP Console |
| Google Refresh Token | `GOOGLE_REFRESH_TOKEN` | Refresh token from local OAuth flow (**required for Cloud**) |
| Google Email | `USER_GOOGLE_EMAIL` | Default account (`krishna.bankar@webgility.com`) |

**How it works on Cloud:** Before using Google tools, run `python scripts/bootstrap-google-credentials.py`. It reads `GOOGLE_REFRESH_TOKEN` from the injected Cloud Secret, exchanges it for a fresh access token, and writes the credential file to `~/.google_workspace_mcp/credentials/`. The `workspace-mcp` server then finds existing credentials and skips the interactive OAuth flow. No changes to `.cursor/mcp.json` are needed — local desktop usage is completely unaffected.

**Token rotation:** If Cloud authentication stops working, re-run `extract-google-refresh-token.py` locally and update the `GOOGLE_REFRESH_TOKEN` secret.

To fetch from or push to Bitbucket, use `git fetch bitbucket` / `git push bitbucket <branch>` after setting an authenticated remote URL (see skill file). If you prefer not to store a username secret, Bitbucket accepts the `x-token-auth` scheme with **only** `BITBUCKET_TOKEN` (below). When `BITBUCKET_USERNAME` is present, use:

```
https://${BITBUCKET_USERNAME}:${BITBUCKET_TOKEN}@bitbucket.org/webgility/unify-enterprise.git
```

(URL-encode the token if it contains characters that break URLs — see skill file.)

**Alternative without username secret:** Bitbucket **HTTP Access Token** (repository-scoped). Store it as `BITBUCKET_TOKEN` in **Cursor Dashboard → Cloud Agents → Secrets**. Configure the remote using the `x-token-auth` scheme:
```
https://x-token-auth:{BITBUCKET_TOKEN}@bitbucket.org/webgility/unify-enterprise.git
```
If the token contains special characters (e.g. `=`), URL-encode it first:
```bash
ENCODED=$(python3 -c "import os,urllib.parse; print(urllib.parse.quote(os.environ['BITBUCKET_TOKEN'], safe=''))")
git remote set-url bitbucket "https://x-token-auth:${ENCODED}@bitbucket.org/webgility/unify-enterprise.git"
```

**Verified alternative (confirmed working 2026-03-25):** the current token also authenticates using the account username slug + token as password:
```bash
git remote set-url bitbucket "https://krishnabankar:${BITBUCKET_TOKEN}@bitbucket.org/webgility/unify-enterprise.git"
```
> **Important — username slug vs. email:** the Bitbucket account slug is `krishnabankar`. Using the email address (`krishna.bankar@webgility.com`) as the URL username fails because `@` breaks URL parsing.

> **Important — token type:** `BITBUCKET_TOKEN` must be a **Bitbucket HTTP Access Token** created from the **repository settings → Access tokens** page (or Bitbucket profile → HTTP access tokens). It is **not** an Atlassian API token generated at `id.atlassian.com/manage-api-tokens` (those only work for Jira/Confluence REST APIs). The correct token for Bitbucket git authentication is created directly in Bitbucket with at minimum the **Repositories: Read** scope (add **Write** for push).
>
> **As of September 9, 2025, Bitbucket has replaced App Passwords with API tokens** (scoped HTTP access tokens). The old App Passwords page now redirects to "Go to API tokens". Create the token from the Bitbucket repository or workspace settings under **Access tokens** / **HTTP access tokens**.
>
> The existing **MyToken** app password (created 2025-03-18) will be disabled June 9, 2026 — regenerate it as an HTTP access token before then.

### Common Commands
| Task | Command |
|------|---------|
| Restore dependencies | `dotnet restore` |
| Build solution | `dotnet build` |
| Run application | `dotnet run --project src/AskAI` |
| Run agent catalog web | `dotnet run --project src/AskAI.Web` (then open the URL shown, e.g. `http://localhost:5088`) |
| Run tests | `dotnet test` |
| Lint (warnings as errors) | `dotnet build /p:TreatWarningsAsErrors=true` |

### MCP (Cursor, Claude Desktop, other agents)

**Google (Gmail + Calendar + Drive/Docs for Meet notes):** follow **`docs/mcp-integration-roadmap.md`** — recommended stack is **`workspace-mcp`** via **`uvx`** (install **`uv`**); OAuth client ID/secret use env names **`GOOGLE_OAUTH_CLIENT_ID`** / **`GOOGLE_OAUTH_CLIENT_SECRET`** in both **Cursor Cloud Secrets** and **local Windows User env**. **Cloud Agents** also need **`GOOGLE_REFRESH_TOKEN`** (see "Cloud Agent secrets (Google Workspace MCP)" above and `scripts/bootstrap-google-credentials.py`). Merge template: **`docs/mcp-servers.example.json`** → your `.cursor/mcp.json`.

HubSpot MCP stays deferred until Private App access exists (same doc).

### Notes
- `dotnet restore` is implicitly run by `dotnet build` and `dotnet run`, but can be run explicitly after adding new NuGet packages.
- The `.gitignore` is the standard Visual Studio/.NET template — build outputs (`bin/`, `obj/`) are already excluded.

### Master agent: KrishnaAiGen (`KrishnaAiGen`)

- **Orchestration:** The **`KrishnaAiGen`** agent reads the registry plus meta skills, **infers which specialists apply**, then loads **only** those `.cursor/agents/<name>.agent.md` files and their `.skill.md` packs (see `.cursor/agents/KrishnaAiGen.agent.md` §B). Use it when you do **not** want to attach every subagent manually.
- **VS Code / GitHub Copilot:** Same role in `.github/copilot/agents/KrishnaAiGen.agent.md` and `.github/agents/KrishnaAiGen.agent.md`.
- **Autonomous VS Code variant:** `.github/agents/KrishnaAIGen-autonomous.agent.md` (heavy tooling — not the same as the KrishnaAiGen master).

### Specialist-only (`/<agent-name>`)

To **scope** the model to a single workflow (smaller context), invoke by name:

- **`/KrishnaAiGen`** — master router + orchestration (see master agent).
- **`/agent-learning`** — update skills/agents from corrections or feedback (meta; edits repo docs).
- **`/db-automation`** — SQL Server (`db-restore.skill.md`; extend with more `db-*.skill.md` in the agent file).
- **`/git-automation`** — commit, push, merge, sync `develop` with `master` (`git-sync.skill.md`).
- **`/bitbucket-automation`** — `unify-enterprise` on Bitbucket (`bitbucket-unify-enterprise.skill.md` + `git-sync.skill.md`).
- **`/jira-automation`** — Jira UD workflows (`jira-workflow.skill.md`).
- **`/slack-automation`** — Slack MCP (`slack-integration.skill.md`).
- **`/dev-customization`** — Customer-driven customizations: reuse architecture, profile + customization node gating, logging (`dev-customization-expertise.skill.md`, `dev-customization-workflow.skill.md`).
- **`/confluence-automation`** — Confluence page management, search, content creation, and evolving knowledge base of workspace documentation (`confluence-workflow.skill.md`).
- **`/daily-work-update`** — Generates Krishna's morning digest (Yesterday / Today / Pending / Follow-ups) by reading Jira (UD), Slack mentions and threads, Bitbucket `unify-enterprise` commits and PRs (no GitHub activity in digest), Google Workspace (Calendar + Gmail + Drive via `google-workspace` MCP, §E — meetings including yesterday/today Calendar via `get_events`, recaps, Gemini summaries), and HubSpot updates that come in via the Atish-Sinha Customer-Issue comment bridge (§A8). Posts to Slack **`#my-daily-update`** (or DMs Krishna). Digest layout: Yesterday → Today → Pending → Blockers → TL;DR (omit zero-count sections). Read-only on Jira/Bitbucket/Google Workspace/HubSpot; write-only on that Slack channel. Canonical skill: `daily-work-update.skill.md`. Schedule: weekdays 09:00 IST via Cursor scheduled cloud agent / GitHub Actions cron / local cron — opt-in (skill documents the cron lines, not committed).
- **`/sys-troubleshoot`** — Windows / VPN / SMB / network diagnostics and fixes (`vpn-smb-access.skill.md`, `network-profile-fix.skill.md`).
- **`/wd-es-kibana`** — Elasticsearch log analyst: daily log reports, error investigation, health checks via Kibana WD HTTPS API or ES MCP. Report delivery to Slack is via the Cursor Automation's built-in "Send to Slack" tool (channel configured in Automation UI, not hardcoded). Skills: `wd-es-kibana.skill.md`. Standalone script: `.mcp-servers/es-logs/fetch-daily-logs.mjs`.

You can also ask in plain language, for example: *Delegate to the jira-automation subagent for UD-31982.*

### Ephemeral output (not committed)

One-time reports, formatted dumps, or scratch files that must **not** be pushed: write under **`local/ephemeral/`** (gitignored) or `logs/`. See `.cursor/skill-library/krishnaaigen-ephemeral-output.skill.md`. Session scratch can also use `.cursor/agent-session-notes.log`.

### Skill evolution (corrections → repo learning)

When a session fixes wrong or incomplete instructions, follow **`.cursor/skill-library/krishnaaigen-skill-evolution.skill.md`**. Use **`/agent-learning`** when the task is specifically to persist that fix into skills and keep **Cursor + Copilot + VS Code** agent files in sync. After specialist agent work completes in a thread, **`agent-learning`** is the **default close-out** (see `.cursor/agents/agent-learning.agent.md`) unless you opt out.

### Cursor subagents (`.cursor/agents/`)

**Workspace root:** Cursor loads **project** subagents only from **`<workspace_folder>/.cursor/agents/`** (see [Subagents — file locations](https://cursor.com/docs/subagents)). In this monorepo, open **`Agentic_Unify-Enterprise`** as the workspace folder and keep **`.cursor/` at that repository root** — not under `AskAI/.cursor/` only — otherwise custom subagents do not appear for `@` / Task delegation after nesting AskAI inside a larger repo.

The **dropdown next to the Agent chat** (modes like Ask / Agent / Plan / Debug, model picker, ∞) is **not** populated from `.cursor/agents/*.agent.md`. That control is for **chat mode and model**, not a catalog of custom subagents. Cursor documents custom subagents as tools the main Agent delegates to; the canonical way to see what exists is the `.cursor/agents/` folder on disk.

See [Subagents](https://cursor.com/docs/subagents) in the Cursor docs.

### Parity: Cursor, GitHub Copilot, VS Code

| Location | Role |
|----------|------|
| `.cursor/agents/*.agent.md` | Cursor subagent definitions |
| `.cursor/skill-library/*.skill.md` | **Canonical** skills (single source of truth) |
| `.github/copilot/agents/*.agent.md` | Copilot agents (reference `.cursor/skill-library/` paths) |
| `.github/agents/*.agent.md` | VS Code / GitHub agent picker (e.g. `KrishnaAiGen.agent.md`) |
| `.github/copilot/AGENT-SKILL-BINDINGS.md` | Copilot registry (keep aligned with `.cursor/agent-skill-bindings.md`) |

Adding or changing an agent: update **both** bindings files and **both** agent file locations unless the tool is Cursor-only.

### Agent-specific skill packs (`.cursor/skill-library/`)

Cursor does **not** support a built-in “this subagent may only load skills A, B, C” manifest in YAML. To keep **one agent = a specific set of small markdown files** (and avoid one giant agent prompt):

1. Put **atomic instructions** in `.cursor/skill-library/*.skill.md` (plain markdown, not `SKILL.md` trees—those are for [globally discoverable skills](https://cursor.com/docs/skills)).
2. Keep each **subagent** in `.cursor/agents/<name>.agent.md` **thin**: `name`, `description`, `model`, plus a **mandatory first step** listing the exact skill paths to read in order.
3. Maintain the human map in **`.cursor/agent-skill-bindings.md`** when you add agents or change assignments.

**Example:** `/jira-automation` loads **`jira-workflow.skill.md`** only (consolidated Jira rules). **`/db-automation`** loads `db-restore.skill.md` today; add paths to `db-automation.agent.md` when you introduce more `db-*.skill.md` skills. **`/git-automation`** loads `git-sync.skill.md`; add more `git-*.skill.md` paths to `git-automation.agent.md` as needed. **`/bitbucket-automation`** loads `git-sync.skill.md` then `bitbucket-unify-enterprise.skill.md`. **`/slack-automation`** loads `slack-integration.skill.md`; add more `slack-*.skill.md` paths to `slack-automation.agent.md` as needed. **`/dev-customization`** loads `dev-customization-expertise.skill.md` then `dev-customization-workflow.skill.md`. **`/confluence-automation`** loads **`confluence-workflow.skill.md`**. **`/daily-work-update`** loads **`daily-work-update.skill.md`** plus the read-only slices it needs from `slack-integration.skill.md`, `jira-workflow.skill.md` (§3, §7, §7.6), `bitbucket-unify-enterprise.skill.md`, `git-sync.skill.md`, and `krishnaaigen-ephemeral-output.skill.md`. **`/sys-troubleshoot`** loads **`vpn-smb-access.skill.md`** and **`network-profile-fix.skill.md`** as symptoms dictate. **`/wd-es-kibana`** loads **`wd-es-kibana.skill.md`** then `slack-integration.skill.md` (Slack MCP fallback). **`/KrishnaAiGen`** loads the registry + meta skills, **routes** to specialists, and pulls **only** the `.agent.md` + `.skill.md` packs needed for the task (optional full sweep — see `.cursor/agents/KrishnaAiGen.agent.md` §C — same behavior in `.github/copilot/agents/KrishnaAiGen.agent.md` and `.github/agents/KrishnaAiGen.agent.md`).

The model loads those files at runtime via its read tool, so context stays **scoped to what that agent declares**, not every skill in the repo.
