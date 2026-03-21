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

- Type **`/db-restorer`** then your request (SQL Server backup restore workflow).
- Type **`/jira-automation`** then your request (customer issue key, story points, etc.).

You can also ask in plain language, for example: *Delegate to the jira-automation subagent for CUST-123.*

See [Subagents](https://cursor.com/docs/subagents) in the Cursor docs.

### Agent-specific skill packs (`.cursor/skill-library/`)

Cursor does **not** support a built-in “this subagent may only load skills A, B, C” manifest in YAML. To keep **one agent = a specific set of small markdown files** (and avoid one giant agent prompt):

1. Put **atomic instructions** in `.cursor/skill-library/*.md` (plain markdown, not `SKILL.md` trees—those are for [globally discoverable skills](https://cursor.com/docs/skills)).
2. Keep each **subagent** in `.cursor/agents/<name>.md` **thin**: `name`, `description`, `model`, plus a **mandatory first step** listing the exact skill paths to read in order.
3. Maintain the human map in **`.cursor/agent-skill-bindings.md`** when you add agents or change assignments.

**Example:** `/jira-automation` loads `jira-story-workflow.md`, `jira-worklogs.md`, and `jira-sprint-lifecycle.md` only. Another agent can load `skill1.md` + `skill2.md` only by listing just those paths in its agent file.

The model loads those files at runtime via its read tool, so context stays **scoped to what that agent declares**, not every skill in the repo.
