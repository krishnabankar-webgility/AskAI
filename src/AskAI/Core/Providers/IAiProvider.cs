namespace AskAI.Core.Providers;

/// <summary>
/// Abstraction for AI inference services (Provider Pattern).
/// Implementations may target OpenAI, Azure OpenAI, Semantic Kernel, etc.
/// </summary>
public interface IAiProvider
{
    /// <summary>Sends a prompt and returns the AI-generated reply.</summary>
    /// <param name="prompt">The user prompt.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The AI-generated text response.</returns>
    Task<string> GetCompletionAsync(string prompt, CancellationToken cancellationToken = default);
}
