using System.Resources;

namespace AskAI.Resources;

/// <summary>
/// Provides strongly-typed access to log message strings via <see cref="ResourceManager"/>.
/// </summary>
public static class LogMessages
{
    private static readonly ResourceManager _resourceManager =
        new ResourceManager("AskAI.Resources.LogMessages", typeof(LogMessages).Assembly);

    /// <summary>Gets the "SendingPrompt" log message format string.</summary>
    public static string SendingPrompt =>
        _resourceManager.GetString(nameof(SendingPrompt)) ?? "Sending prompt to AI provider";

    /// <summary>Gets the "ConversationSaved" log message format string.</summary>
    public static string ConversationSaved =>
        _resourceManager.GetString(nameof(ConversationSaved)) ?? "Conversation saved";

    /// <summary>Gets the "InvokingAiModel" log message format string.</summary>
    public static string InvokingAiModel =>
        _resourceManager.GetString(nameof(InvokingAiModel)) ?? "Invoking AI model";

    /// <summary>Gets the "ConnectingToDatabase" log message format string.</summary>
    public static string ConnectingToDatabase =>
        _resourceManager.GetString(nameof(ConnectingToDatabase)) ?? "Connecting to database";

    /// <summary>Gets the "ApplicationStarting" log message.</summary>
    public static string ApplicationStarting =>
        _resourceManager.GetString(nameof(ApplicationStarting)) ?? "AskAI application starting";

    /// <summary>Gets the "ApplicationStopping" log message.</summary>
    public static string ApplicationStopping =>
        _resourceManager.GetString(nameof(ApplicationStopping)) ?? "AskAI application stopping";
}
