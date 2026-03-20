namespace AskAI.Core.Providers;

/// <summary>
/// Abstraction for database connections (Provider Pattern).
/// Decouples application logic from the concrete database driver.
/// </summary>
public interface IDatabaseProvider : IAsyncDisposable
{
    /// <summary>Opens (or returns an already-open) database connection asynchronously.</summary>
    /// <param name="cancellationToken">Cancellation token.</param>
    Task ConnectAsync(CancellationToken cancellationToken = default);

    /// <summary>Returns <c>true</c> when the underlying connection is open.</summary>
    bool IsConnected { get; }
}
