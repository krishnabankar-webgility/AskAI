using Microsoft.Extensions.Hosting;

namespace AskAI.Core.Commands;

/// <summary>
/// Defines the contract for a typed command handler following the Command pattern.
/// </summary>
/// <typeparam name="TOptions">The strongly-typed options for this command.</typeparam>
public interface ICommandHandler<TOptions> where TOptions : CommandHandlerOptions
{
    /// <summary>Executes the command asynchronously with the provided options.</summary>
    /// <param name="options">The command options.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Exit code; 0 indicates success.</returns>
    Task<int> ExecuteAsync(TOptions options, CancellationToken cancellationToken = default);
}
