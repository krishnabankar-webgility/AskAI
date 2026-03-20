using System.ComponentModel.DataAnnotations;

namespace AskAI.App.Configuration;

/// <summary>Strongly-typed configuration for the database provider.</summary>
public sealed class DatabaseOptions
{
    /// <summary>Configuration section name used when binding from appsettings.</summary>
    public const string SectionName = "Database";

    /// <summary>Connection string for the underlying database.</summary>
    [Required(AllowEmptyStrings = false)]
    public string ConnectionString { get; set; } = "Data Source=askai.db";

    /// <summary>
    /// Command timeout in seconds. Defaults to 30 s.
    /// </summary>
    [Range(1, 600)]
    public int CommandTimeoutSeconds { get; set; } = 30;
}
