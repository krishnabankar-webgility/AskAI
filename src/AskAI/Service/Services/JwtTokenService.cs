using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using AskAI.App.Configuration;
using AskAI.Core.Services;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace AskAI.Service.Services;

/// <summary>
/// Generates HMAC-SHA256 (HS256) signed JWT bearer tokens whose structure
/// exactly matches the unify-enterprise token format:
/// <list type="bullet">
///   <item>Header order: <c>typ</c> first, then <c>alg</c></item>
///   <item>Payload: only <c>subscriber_id</c> (integer), <c>subscriber_email</c>, <c>exp</c></item>
///   <item>No <c>nbf</c>, <c>iss</c>, or <c>aud</c> claims</item>
/// </list>
/// </summary>
public sealed class JwtTokenService : IJwtTokenService
{
    private readonly JwtOptions _options;
    private readonly ILogger<JwtTokenService> _logger;

    public JwtTokenService(IOptions<JwtOptions> options, ILogger<JwtTokenService> logger)
    {
        ArgumentNullException.ThrowIfNull(options);
        ArgumentNullException.ThrowIfNull(logger);

        _options = options.Value;
        _logger = logger;
    }

    /// <inheritdoc/>
    public string GenerateToken(long subscriberId, string subscriberEmail)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(subscriberEmail, nameof(subscriberEmail));

        _logger.LogInformation(
            "Generating JWT for subscriber_id={SubscriberId}, subscriber_email={SubscriberEmail}",
            subscriberId, subscriberEmail);

        var expiry = DateTime.UtcNow.AddMinutes(_options.ExpirationMinutes);
        var tokenString = BuildToken(subscriberId, subscriberEmail, expiry);

        _logger.LogInformation(
            "JWT generated successfully for subscriber_id={SubscriberId} (exp={Expiry:u})",
            subscriberId, expiry);

        return tokenString;
    }

    /// <summary>
    /// Overload that accepts an explicit expiry — used internally and by tests
    /// that need a deterministic <c>exp</c> value.
    /// </summary>
    internal string GenerateToken(long subscriberId, string subscriberEmail, DateTime expiresUtc)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(subscriberEmail, nameof(subscriberEmail));
        return BuildToken(subscriberId, subscriberEmail, expiresUtc);
    }

    // -----------------------------------------------------------------------
    // The library writes header fields in insertion order.
    // The correct token has { "typ":"JWT", "alg":"HS256" } — typ FIRST.
    // JwtSecurityToken inserts alg first by default, so we build the header
    // manually and hand-craft the compact serialization.
    // -----------------------------------------------------------------------
    private string BuildToken(long subscriberId, string subscriberEmail, DateTime expiresUtc)
    {
        var key         = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_options.SecretKey));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        // --- Header: typ first, then alg (matches the reference token) ---
        string headerJson  = """{"typ":"JWT","alg":"HS256"}""";
        string headerB64   = Base64UrlEncode(Encoding.UTF8.GetBytes(headerJson));

        // --- Payload: subscriber_id as integer, no nbf/iss/aud ---
        long expUnix = new DateTimeOffset(expiresUtc, TimeSpan.Zero).ToUnixTimeSeconds();
        var payloadObj = new
        {
            subscriber_id    = subscriberId,       // integer, not string
            subscriber_email = subscriberEmail,
            exp              = expUnix,
        };
        string payloadJson = JsonSerializer.Serialize(payloadObj);
        string payloadB64  = Base64UrlEncode(Encoding.UTF8.GetBytes(payloadJson));

        // --- Signature: HMAC-SHA256 over "header.payload" ---
        string signingInput = $"{headerB64}.{payloadB64}";
        var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_options.SecretKey));
        using var hmac  = new System.Security.Cryptography.HMACSHA256(signingKey.Key);
        byte[] sig      = hmac.ComputeHash(Encoding.UTF8.GetBytes(signingInput));
        string sigB64   = Base64UrlEncode(sig);

        return $"{headerB64}.{payloadB64}.{sigB64}";
    }

    private static string Base64UrlEncode(byte[] data) =>
        Convert.ToBase64String(data)
               .TrimEnd('=')
               .Replace('+', '-')
               .Replace('/', '_');
}
