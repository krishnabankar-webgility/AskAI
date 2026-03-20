using AskAI.Core.Models;
using AskAI.Core.Providers;
using AskAI.Core.Repositories;
using Microsoft.Extensions.Logging;

namespace AskAI.Service.Repositories;

/// <summary>
/// In-memory implementation of <see cref="IConversationRepository"/>.
/// Swap for a real database-backed implementation using <see cref="IDatabaseProvider"/>.
/// </summary>
public sealed class ConversationRepository : IConversationRepository
{
    private readonly IDatabaseProvider _databaseProvider;
    private readonly ILogger<ConversationRepository> _logger;
    private readonly List<Conversation> _store = [];

    /// <summary>Initialises the repository with a database provider and logger.</summary>
    public ConversationRepository(
        IDatabaseProvider databaseProvider,
        ILogger<ConversationRepository> logger)
    {
        _databaseProvider = databaseProvider ?? throw new ArgumentNullException(nameof(databaseProvider));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    /// <inheritdoc />
    public async Task AddAsync(Conversation conversation, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(conversation);

        if (!_databaseProvider.IsConnected)
        {
            await _databaseProvider.ConnectAsync(cancellationToken).ConfigureAwait(false);
        }

        _store.Add(conversation);
        _logger.LogDebug("Stored conversation {Id}", conversation.Id);
    }

    /// <inheritdoc />
    public Task<Conversation?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var result = _store.FirstOrDefault(c => c.Id == id);
        return Task.FromResult(result);
    }

    /// <inheritdoc />
    public Task<IReadOnlyList<Conversation>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        IReadOnlyList<Conversation> result = _store
            .OrderByDescending(c => c.CreatedAt)
            .ToList();

        return Task.FromResult(result);
    }
}
