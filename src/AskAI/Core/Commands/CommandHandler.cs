using Microsoft.Extensions.Logging;

namespace AskAI.Core.Commands;

/// <summary>
/// Abstract generic base class for command handlers. Provides common validation,
/// structured logging, and error handling following the Template Method pattern.
/// </summary>
/// <typeparam name="TOptions">The strongly-typed options for this command.</typeparam>
public abstract class CommandHandler<TOptions> : ICommandHandler<TOptions>
    where TOptions : CommandHandlerOptions
{
    private readonly ILogger _logger;

    /// <summary>Initializes a new instance of <see cref="CommandHandler{TOptions}"/>.</summary>
    /// <param name="logger">The logger instance.</param>
    protected CommandHandler(ILogger logger)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    /// <inheritdoc />
    public async Task<int> ExecuteAsync(TOptions options, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(options);

        Validate(options);

        _logger.LogInformation("Executing {CommandType}", GetType().Name);

        try
        {
            return await HandleAsync(options, cancellationToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning("Command {CommandType} was cancelled", GetType().Name);
            return 1;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Command {CommandType} failed", GetType().Name);
            return 2;
        }
    }

    /// <summary>
    /// Performs validation on <paramref name="options"/> before execution.
    /// Override to add command-specific validation logic.
    /// </summary>
    /// <param name="options">The options to validate.</param>
    protected virtual void Validate(TOptions options) { }

    /// <summary>Core implementation of the command logic.</summary>
    /// <param name="options">The validated command options.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Exit code.</returns>
    protected abstract Task<int> HandleAsync(TOptions options, CancellationToken cancellationToken);
}
