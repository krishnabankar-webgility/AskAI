namespace AskAI.Core.Commands;

/// <summary>
/// Base class for all command handler options. Inherit to define command-specific options.
/// </summary>
public class CommandHandlerOptions
{
    /// <summary>Gets or sets whether verbose output is enabled.</summary>
    public bool Verbose { get; set; }
}
