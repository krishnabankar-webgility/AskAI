namespace AskAI.Core.Models;

/// <summary>Represents a single user question and the corresponding AI answer.</summary>
public sealed class Conversation
{
    /// <summary>Unique identifier for the conversation entry.</summary>
    public Guid Id { get; init; } = Guid.NewGuid();

    /// <summary>The original user prompt.</summary>
    public required string Prompt { get; init; }

    /// <summary>The AI-generated reply.</summary>
    public required string Reply { get; init; }

    /// <summary>UTC timestamp when the conversation was created.</summary>
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;
}
