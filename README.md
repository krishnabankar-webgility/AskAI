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
