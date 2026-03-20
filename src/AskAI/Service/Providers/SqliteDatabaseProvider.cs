using AskAI.App.Configuration;
using AskAI.Core.Providers;
using AskAI.Resources;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace AskAI.Service.Providers;

/// <summary>
/// SQLite-based implementation of <see cref="IDatabaseProvider"/>.
/// Uses a stub connection so the application compiles without a SQLite NuGet reference.
/// Replace with <c>Microsoft.Data.Sqlite</c> for production use.
/// </summary>
public sealed class SqliteDatabaseProvider : IDatabaseProvider
{
    private readonly DatabaseOptions _options;
    private readonly ILogger<SqliteDatabaseProvider> _logger;
    private bool _connected;
    private bool _disposed;

    /// <summary>Initialises the provider with configuration and a logger.</summary>
    public SqliteDatabaseProvider(
        IOptions<DatabaseOptions> options,
        ILogger<SqliteDatabaseProvider> logger)
    {
        _options = options?.Value ?? throw new ArgumentNullException(nameof(options));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    /// <inheritdoc />
    public bool IsConnected => _connected;

    /// <inheritdoc />
    public async Task ConnectAsync(CancellationToken cancellationToken = default)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);

        if (_connected)
        {
            return;
        }

        _logger.LogInformation(LogMessages.ConnectingToDatabase, _options.ConnectionString);

        // TODO: open a real SqliteConnection here.
        await Task.Delay(0, cancellationToken).ConfigureAwait(false);
        _connected = true;
    }

    /// <inheritdoc />
    public async ValueTask DisposeAsync()
    {
        if (!_disposed)
        {
            _connected = false;
            _disposed = true;
        }

        await ValueTask.CompletedTask.ConfigureAwait(false);
    }
}
