# AskAI

A .NET 8 console application that sends prompts to an AI provider and persists conversations.

## Architecture

The solution follows established .NET design patterns across four layers:

| Layer | Namespace | Responsibility |
|-------|-----------|---------------|
| Core | `AskAI.Core.*` | Interfaces and domain models (no external dependencies) |
| App | `AskAI.App.*` | Configuration (`AiOptions`, `DatabaseOptions`) and `ServiceFactory` |
| Console | `AskAI.Console.*` | CLI command handlers (`AskCommandHandler`) |
| Service | `AskAI.Service.*` | Concrete provider and repository implementations |

### Design Patterns

- **Command Pattern** — `ICommandHandler<TOptions>` / `CommandHandler<TOptions>` (Template Method base with validation, logging and error handling)
- **Factory Pattern** — `ServiceFactory` wraps `IServiceProvider` for typed service resolution
- **Dependency Injection** — `Microsoft.Extensions.Hosting` host builder; `ValidateDataAnnotations` + `ValidateOnStart` for configuration
- **Repository Pattern** — `IConversationRepository` async interface backed by `ConversationRepository`
- **Provider Pattern** — `IAiProvider` (Semantic Kernel ready) and `IDatabaseProvider` (SQLite ready) abstractions
- **Resource Pattern** — `ResourceManager`-backed `LogMessages` and `ErrorMessages` from embedded `.resx` files

## Getting Started

```bash
dotnet run --project src/AskAI -- "What is the capital of France?"
```

## Running Tests

```bash
dotnet test
```

## Agent catalog (web)

The **`AskAI.Web`** project serves a small dashboard that scans this repository for Cursor agents, canonical skills, GitHub Copilot mirrors, VS Code picker agents, and GitHub prompts. It includes editable **insights** (capabilities, weaknesses, performance notes, learnings, suggestions) in `src/AskAI.Web/Data/agent-insights.json`, and a floating **catalog assistant** that answers from keyword matches over the catalog (no external LLM required).

```bash
dotnet run --project src/AskAI.Web
```

If the app cannot find `.cursor/agents` (for example when publishing to a folder without the repo), set **`AgentCatalog:RepoRoot`** in `appsettings.json` or the **`AGENT_CATALOG_REPO_ROOT`** environment variable to the AskAI repository root.
