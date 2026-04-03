# AskAI

## Cursor Cloud specific instructions

### Technology Stack
- **Language/Framework:** C# / .NET 8 (LTS)
- **Project Type:** Console application
- **Solution file:** `AskAI.sln` (root)
- **Main project:** `src/AskAI/AskAI.csproj`
- **Test project:** `tests/AskAI.Tests/AskAI.Tests.csproj` (xUnit)

### .NET SDK Setup
The .NET 8 SDK is installed at `$HOME/.dotnet`. The PATH is configured in `~/.bashrc`:
```
export DOTNET_ROOT=$HOME/.dotnet
export PATH=$DOTNET_ROOT:$PATH
```

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

**Agent skill pack:** `.cursor/skill-library/bitbucket-unify-enterprise.md` (clone, authenticated remote URL, push, PR workflow vs MCP). **Subagent:** type **`/bitbucket-automation`** in Agent mode to load Git safety rules + that skill.

### Cloud Agent secrets (Slack)

In **Cursor Dashboard → Cloud Agents → Secrets** (for cloud) or as system environment variables (for desktop), define:

| Secret | Injected as | Purpose |
|----------------------------------------|----------------------|--------------------------------------------------------------|
| Slack bot token | `SLACK_BOT_TOKEN` | OAuth Bot Token (`xoxb-…`) from your Slack App → OAuth & Permissions |
| Slack team ID | `SLACK_TEAM_ID` | Workspace (team) ID (e.g. `T01ABCDE123`) from workspace settings |

**Agent skill pack:** `.cursor/skill-library/slack-integration.md`. **Subagent:** type **`/slack-automation`** in Agent mode.

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
| Run tests | `dotnet test` |
| Lint (warnings as errors) | `dotnet build /p:TreatWarningsAsErrors=true` |

### Notes
- `dotnet restore` is implicitly run by `dotnet build` and `dotnet run`, but can be run explicitly after adding new NuGet packages.
- The `.gitignore` is the standard Visual Studio/.NET template — build outputs (`bin/`, `obj/`) are already excluded.

### Master agent: AskAI (`askai`)

- **Full context:** The **`askai`** agent loads the skill registry plus **all** canonical skills under `.cursor/skill-library/` (see `.cursor/agents/askai.md`). Use when work spans multiple domains or you want one agent to see Jira + Git + DB + Bitbucket + Slack rules together.
- **VS Code / GitHub Copilot:** Same role in `.github/copilot/agents/askai.agent.md` and `.github/agents/AskAI.agent.md`.

### Specialist-only (`/<agent-name>`)

To **scope** the model to a single workflow (smaller context), invoke by name:

- **`/askai`** — master (same as choosing full orchestration).
- **`/agent-learning`** — update skills/agents from corrections or feedback (meta; edits repo docs).
- **`/db-automation`** — SQL Server (`db-restore.md`; extend with more `db-*.md` in the agent file).
- **`/git-automation`** — commit, push, merge, sync `develop` with `master` (`git-sync.md`).
- **`/bitbucket-automation`** — `unify-enterprise` on Bitbucket (`bitbucket-unify-enterprise.md` + `git-sync.md`).
- **`/jira-automation`** — Jira UD workflows (`jira-workflow.md`).
- **`/slack-automation`** — Slack MCP (`slack-integration.md`).
- **`/dev-customization`** — Customer-driven customizations: reuse architecture, profile + customization node gating, logging (`dev-customization-expertise.md`, `dev-customization-workflow.md`).
- **`/confluence-automation`** — Confluence page management, search, content creation, and evolving knowledge base of workspace documentation (`confluence-workflow.md`).

You can also ask in plain language, for example: *Delegate to the jira-automation subagent for UD-31982.*

### Ephemeral output (not committed)

One-time reports, formatted dumps, or scratch files that must **not** be pushed: write under **`local/ephemeral/`** (gitignored) or `logs/`. See `.cursor/skill-library/askai-ephemeral-output.md`. Session scratch can also use `.cursor/agent-session-notes.log`.

### Skill evolution (corrections → repo learning)

When a session fixes wrong or incomplete instructions, follow **`.cursor/skill-library/askai-skill-evolution.md`**. Use **`/agent-learning`** when the task is specifically to persist that fix into skills and keep **Cursor + Copilot + VS Code** agent files in sync.

### Cursor subagents (`.cursor/agents/`)

The **dropdown next to the Agent chat** (modes like Ask / Agent / Plan / Debug, model picker, ∞) is **not** populated from `.cursor/agents/*.md`. That control is for **chat mode and model**, not a catalog of custom subagents. Cursor documents custom subagents as tools the main Agent delegates to; the canonical way to see what exists is the `.cursor/agents/` folder on disk.

See [Subagents](https://cursor.com/docs/subagents) in the Cursor docs.

### Parity: Cursor, GitHub Copilot, VS Code

| Location | Role |
|----------|------|
| `.cursor/agents/*.md` | Cursor subagent definitions |
| `.cursor/skill-library/*.md` | **Canonical** skills (single source of truth) |
| `.github/copilot/agents/*.agent.md` | Copilot agents (reference `.cursor/skill-library/` paths) |
| `.github/agents/*.agent.md` | VS Code / GitHub agent picker (e.g. `AskAI.agent.md`) |
| `.github/copilot/AGENT-SKILL-BINDINGS.md` | Copilot registry (keep aligned with `.cursor/agent-skill-bindings.md`) |

Adding or changing an agent: update **both** bindings files and **both** agent file locations unless the tool is Cursor-only.

### Agent-specific skill packs (`.cursor/skill-library/`)

Cursor does **not** support a built-in “this subagent may only load skills A, B, C” manifest in YAML. To keep **one agent = a specific set of small markdown files** (and avoid one giant agent prompt):

1. Put **atomic instructions** in `.cursor/skill-library/*.md` (plain markdown, not `SKILL.md` trees—those are for [globally discoverable skills](https://cursor.com/docs/skills)).
2. Keep each **subagent** in `.cursor/agents/<name>.md` **thin**: `name`, `description`, `model`, plus a **mandatory first step** listing the exact skill paths to read in order.
3. Maintain the human map in **`.cursor/agent-skill-bindings.md`** when you add agents or change assignments.

**Example:** `/jira-automation` loads **`jira-workflow.md`** only (consolidated Jira rules). **`/db-automation`** loads `db-restore.md` today; add paths to `db-automation.md` when you introduce more `db-*.md` skills. **`/git-automation`** loads `git-sync.md`; add more `git-*.md` paths to `git-automation.md` as needed. **`/bitbucket-automation`** loads `git-sync.md` then `bitbucket-unify-enterprise.md`. **`/slack-automation`** loads `slack-integration.md`; add more `slack-*.md` paths to `slack-automation.md` as needed. **`/dev-customization`** loads `dev-customization-expertise.md` then `dev-customization-workflow.md`. **`/askai`** loads the registry plus all skills when full cross-domain context is needed (see `.cursor/agents/askai.md`).

The model loads those files at runtime via its read tool, so context stays **scoped to what that agent declares**, not every skill in the repo.
