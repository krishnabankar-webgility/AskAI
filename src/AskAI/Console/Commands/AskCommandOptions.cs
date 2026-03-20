using System.ComponentModel.DataAnnotations;
using AskAI.Core.Commands;

namespace AskAI.Console.Commands;

/// <summary>Options for the <c>ask</c> command.</summary>
public sealed class AskCommandOptions : CommandHandlerOptions
{
    /// <summary>The user's question or prompt to send to the AI.</summary>
    [Required(AllowEmptyStrings = false)]
    public required string Prompt { get; init; }

    /// <summary>When <c>true</c>, the conversation is stored for later retrieval.</summary>
    public bool Save { get; init; } = true;
}
