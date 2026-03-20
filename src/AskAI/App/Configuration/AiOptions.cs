using System.ComponentModel.DataAnnotations;

namespace AskAI.App.Configuration;

/// <summary>Strongly-typed configuration for the AI provider.</summary>
public sealed class AiOptions
{
    /// <summary>Configuration section name used when binding from appsettings.</summary>
    public const string SectionName = "Ai";

    /// <summary>The AI model identifier (e.g. "gpt-4o").</summary>
    [Required(AllowEmptyStrings = false)]
    public string ModelId { get; set; } = "gpt-4o";

    /// <summary>API endpoint override; leave empty to use the provider default.</summary>
    public string? Endpoint { get; set; }

    /// <summary>Maximum tokens to generate per response.</summary>
    [Range(1, 32768)]
    public int MaxTokens { get; set; } = 2048;
}
