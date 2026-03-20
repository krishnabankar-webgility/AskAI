using AskAI.Core.Models;

namespace AskAI.Core.Repositories;

/// <summary>
/// Async repository abstraction for <see cref="Conversation"/> persistence (Repository Pattern).
/// </summary>
public interface IConversationRepository
{
    /// <summary>Persists a new conversation entry.</summary>
    Task AddAsync(Conversation conversation, CancellationToken cancellationToken = default);

    /// <summary>Retrieves a conversation by its unique identifier.</summary>
    Task<Conversation?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);

    /// <summary>Returns all stored conversations, ordered by creation time descending.</summary>
    Task<IReadOnlyList<Conversation>> GetAllAsync(CancellationToken cancellationToken = default);
}
