using System.ComponentModel.DataAnnotations;

namespace AskAI.App.Configuration;

/// <summary>Strongly-typed configuration for JWT bearer token generation.</summary>
public sealed class JwtOptions
{
    /// <summary>Configuration section name used when binding from appsettings.</summary>
    public const string SectionName = "Jwt";

    /// <summary>HMAC-SHA256 secret key used to sign tokens (must be ≥ 32 bytes / 256 bits).</summary>
    [Required(AllowEmptyStrings = false)]
    [MinLength(32, ErrorMessage = "Jwt:SecretKey must be at least 32 characters (256 bits) for HS256.")]
    public string SecretKey { get; set; } = string.Empty;

    /// <summary>Token issuer (iss claim).</summary>
    [Required(AllowEmptyStrings = false)]
    public string Issuer { get; set; } = "AskAI";

    /// <summary>Token audience (aud claim).</summary>
    [Required(AllowEmptyStrings = false)]
    public string Audience { get; set; } = "AskAI";

    /// <summary>Token lifetime in minutes. Defaults to 60.</summary>
    [Range(1, 10080)]
    public int ExpirationMinutes { get; set; } = 60;
}
