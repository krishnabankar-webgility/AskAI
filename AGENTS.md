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

To fetch from or push to Bitbucket, use `git fetch bitbucket` / `git push bitbucket <branch>`. Bitbucket requires a Bitbucket **App Password** (or repository access token). Store it as a secret named `BITBUCKET_TOKEN` in **Cursor Dashboard → Cloud Agents → Secrets**. When it is present, commands that need authentication should use the authenticated URL:
```
https://x-token-auth:$BITBUCKET_TOKEN@bitbucket.org/webgility/unify-enterprise.git
```

> **Important — token type:** `BITBUCKET_TOKEN` must be a **Bitbucket App Password** (generated at [bitbucket.org/account/settings/app-passwords](https://bitbucket.org/account/settings/app-passwords); its value starts with `ATBB`). It is **not** an Atlassian API token (which starts with `ATATT` and only works for Jira/Confluence REST APIs, not for Bitbucket git operations). If you see `ATATT` as the prefix, re-generate the secret as a Bitbucket App Password with at minimum the **Repositories: Read** scope.

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
