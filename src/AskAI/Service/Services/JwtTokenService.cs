using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using AskAI.App.Configuration;
using AskAI.Core.Services;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace AskAI.Service.Services;

/// <summary>
/// Generates HMAC-SHA256 (HS256) signed JWT bearer tokens that carry
/// <c>subscriber_id</c>, <c>subscriber_email</c>, and <c>exp</c> claims,
/// matching the payload structure shown in the Visual Studio JWT Text Visualizer.
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

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_options.SecretKey));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim("subscriber_id", subscriberId.ToString()),
            new Claim("subscriber_email", subscriberEmail),
        };

        var now = DateTime.UtcNow;
        var expiry = now.AddMinutes(_options.ExpirationMinutes);

        var token = new JwtSecurityToken(
            issuer: _options.Issuer,
            audience: _options.Audience,
            claims: claims,
            notBefore: now,
            expires: expiry,
            signingCredentials: credentials);

        // Remove the standard 'typ' header — keep header lean (typ=JWT is the default).
        token.Header.Remove(JwtRegisteredClaimNames.Typ);
        token.Header[JwtRegisteredClaimNames.Typ] = "JWT";

        var tokenString = new JwtSecurityTokenHandler().WriteToken(token);

        _logger.LogInformation(
            "JWT generated successfully for subscriber_id={SubscriberId} (exp={Expiry:u})",
            subscriberId, expiry);

        return tokenString;
    }
}
