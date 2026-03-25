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
| `bitbucket` | `https://bitbucket.org/webgility/unify-enterprise.git` | Bitbucket remote |

To fetch from or push to Bitbucket, use `git fetch bitbucket` / `git push bitbucket <branch>`. Bitbucket requires a **Bitbucket HTTP Access Token** (repository-scoped). Store it as a secret named `BITBUCKET_TOKEN` in **Cursor Dashboard → Cloud Agents → Secrets**. When it is present, the remote must be configured with the authenticated URL using the `x-token-auth` scheme:
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

### Cursor subagents (`.cursor/agents/`)

The **dropdown next to the Agent chat** (modes like Ask / Agent / Plan / Debug, model picker, ∞) is **not** populated from `.cursor/agents/*.md`. That control is for **chat mode and model**, not a catalog of custom subagents. Cursor documents custom subagents as tools the main Agent delegates to; the canonical way to see what exists is the `.cursor/agents/` folder on disk.

**How to run project subagents** (in **Agent** mode, `Ctrl+I`):

- Type **`/db-automation`** then your request (SQL Server workflows; restore lives in `db-restore.md`; more DB skills can be added under the same agent).
- Type **`/git-automation`** then your request (commit, push, merge, sync `develop` with `master`; detail in `git-sync.md`).
- Type **`/jira-automation`** then your request (customer issue key, story points, etc.).

You can also ask in plain language, for example: *Delegate to the jira-automation subagent for CUST-123.*

See [Subagents](https://cursor.com/docs/subagents) in the Cursor docs.

### Agent-specific skill packs (`.cursor/skill-library/`)

Cursor does **not** support a built-in “this subagent may only load skills A, B, C” manifest in YAML. To keep **one agent = a specific set of small markdown files** (and avoid one giant agent prompt):

1. Put **atomic instructions** in `.cursor/skill-library/*.md` (plain markdown, not `SKILL.md` trees—those are for [globally discoverable skills](https://cursor.com/docs/skills)).
2. Keep each **subagent** in `.cursor/agents/<name>.md` **thin**: `name`, `description`, `model`, plus a **mandatory first step** listing the exact skill paths to read in order.
3. Maintain the human map in **`.cursor/agent-skill-bindings.md`** when you add agents or change assignments.

**Example:** `/jira-automation` loads `jira-story-workflow.md`, `jira-worklogs.md`, and `jira-sprint-lifecycle.md` only. **`/db-automation`** loads `db-restore.md` today; add paths to `db-automation.md` when you introduce more `db-*.md` skills. **`/git-automation`** loads `git-sync.md`; add more `git-*.md` paths to `git-automation.md` as needed.

The model loads those files at runtime via its read tool, so context stays **scoped to what that agent declares**, not every skill in the repo.
