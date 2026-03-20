using System.Resources;

namespace AskAI.Resources;

/// <summary>
/// Provides strongly-typed access to error message strings via <see cref="ResourceManager"/>.
/// </summary>
public static class ErrorMessages
{
    private static readonly ResourceManager _resourceManager =
        new ResourceManager("AskAI.Resources.ErrorMessages", typeof(ErrorMessages).Assembly);

    /// <summary>Gets the "PromptRequired" error message.</summary>
    public static string PromptRequired =>
        _resourceManager.GetString(nameof(PromptRequired)) ?? "A prompt is required.";

    /// <summary>Gets the "AiProviderFailure" error message.</summary>
    public static string AiProviderFailure =>
        _resourceManager.GetString(nameof(AiProviderFailure)) ?? "AI provider failed.";

    /// <summary>Gets the "DatabaseConnectionFailure" error message.</summary>
    public static string DatabaseConnectionFailure =>
        _resourceManager.GetString(nameof(DatabaseConnectionFailure)) ?? "Database connection failed.";

    /// <summary>Gets the "InvalidConfiguration" error message format string.</summary>
    public static string InvalidConfiguration =>
        _resourceManager.GetString(nameof(InvalidConfiguration)) ?? "Configuration is invalid: {0}";

    /// <summary>Gets the "UnexpectedError" error message.</summary>
    public static string UnexpectedError =>
        _resourceManager.GetString(nameof(UnexpectedError)) ?? "An unexpected error occurred.";
}
