using System.IdentityModel.Tokens.Jwt;
using System.Text;
using System.Text.Json;
using AskAI.App.Configuration;
using AskAI.Service.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace AskAI.Tests;

// ---------------------------------------------------------------------------
// Service.Services – JwtTokenService
//
// Reference token (from Visual Studio JWT Text Visualizer screenshot):
//   eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9
//   .eyJzdWJzY3JpYmVyX2lkIjo3OTY2NSwic3Vic2NyaWJlcl9lbWFpbCI6ImtyaXNobmEuYmFua2FyQHdlYmdpbGl0eS5jb20iLCJleHAiOjE3NzQ5NTk0NDh9
//   .GeVlRHni-TJkY7KJg_g6jXt3LXpmh_vCHQwL_tpNHcs
//
// Exact format requirements:
//   - Header:  {"typ":"JWT","alg":"HS256"}  (typ BEFORE alg)
//   - Payload: subscriber_id as JSON integer, subscriber_email as string, exp as unix int
//   - No nbf, iss, aud claims
// ---------------------------------------------------------------------------

public class JwtTokenServiceTests
{
    private const string ValidSecret = "super-secret-key-that-is-at-least-32-chars!";

    private static JwtTokenService Build(
        string? secret = null,
        int expirationMinutes = 60)
    {
        var opts = Options.Create(new JwtOptions
        {
            SecretKey          = secret ?? ValidSecret,
            Issuer             = "AskAI",
            Audience           = "AskAI",
            ExpirationMinutes  = expirationMinutes,
        });

        return new JwtTokenService(opts, NullLogger<JwtTokenService>.Instance);
    }

    // ── Constructor guards ──────────────────────────────────────────────────

    [Fact]
    public void Constructor_NullOptions_Throws() =>
        Assert.Throws<ArgumentNullException>(() =>
            new JwtTokenService(null!, NullLogger<JwtTokenService>.Instance));

    [Fact]
    public void Constructor_NullLogger_Throws()
    {
        var opts = Options.Create(new JwtOptions
        {
            SecretKey = ValidSecret, Issuer = "X", Audience = "X",
        });
        Assert.Throws<ArgumentNullException>(() => new JwtTokenService(opts, null!));
    }

    // ── Argument guards ─────────────────────────────────────────────────────

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void GenerateToken_BlankEmail_ThrowsArgumentException(string? email)
    {
        var svc = Build();
        Assert.ThrowsAny<ArgumentException>(() => svc.GenerateToken(1, email!));
    }

    // ── Token structure ─────────────────────────────────────────────────────

    [Fact]
    public void GenerateToken_ReturnsNonEmptyString()
    {
        var token = Build().GenerateToken(79665, "test@example.com");
        Assert.False(string.IsNullOrWhiteSpace(token));
    }

    [Fact]
    public void GenerateToken_HasThreeParts()
    {
        var token = Build().GenerateToken(79665, "test@example.com");
        Assert.Equal(3, token.Split('.').Length);
    }

    // ── Header ──────────────────────────────────────────────────────────────

    [Fact]
    public void GenerateToken_Header_IsTypFirstThenAlg()
    {
        var token = Build().GenerateToken(79665, "test@example.com");
        string headerJson = DecodeB64(token.Split('.')[0]);

        // Must be exactly {"typ":"JWT","alg":"HS256"} — typ first
        Assert.Equal("""{"typ":"JWT","alg":"HS256"}""", headerJson);
    }

    [Fact]
    public void GenerateToken_Header_AlgIsHS256()
    {
        var token = Build().GenerateToken(79665, "test@example.com");
        var doc   = JsonDocument.Parse(DecodeB64(token.Split('.')[0]));
        Assert.Equal("HS256", doc.RootElement.GetProperty("alg").GetString());
    }

    [Fact]
    public void GenerateToken_Header_TypIsJWT()
    {
        var token = Build().GenerateToken(79665, "test@example.com");
        var doc   = JsonDocument.Parse(DecodeB64(token.Split('.')[0]));
        Assert.Equal("JWT", doc.RootElement.GetProperty("typ").GetString());
    }

    // ── Payload ─────────────────────────────────────────────────────────────

    [Fact]
    public void GenerateToken_SubscriberId_IsJsonInteger()
    {
        var token = Build().GenerateToken(79665, "test@example.com");
        var doc   = JsonDocument.Parse(DecodeB64(token.Split('.')[1]));
        var prop  = doc.RootElement.GetProperty("subscriber_id");

        // Must be a JSON number, not a string
        Assert.Equal(JsonValueKind.Number, prop.ValueKind);
        Assert.Equal(79665L, prop.GetInt64());
    }

    [Fact]
    public void GenerateToken_SubscriberEmail_IsCorrect()
    {
        var token = Build().GenerateToken(79665, "krishna.bankar@webgility.com");
        var doc   = JsonDocument.Parse(DecodeB64(token.Split('.')[1]));
        Assert.Equal("krishna.bankar@webgility.com",
            doc.RootElement.GetProperty("subscriber_email").GetString());
    }

    [Fact]
    public void GenerateToken_Payload_HasNoExtraStandardClaims()
    {
        var token = Build().GenerateToken(79665, "test@example.com");
        var doc   = JsonDocument.Parse(DecodeB64(token.Split('.')[1]));

        var keys = doc.RootElement.EnumerateObject().Select(p => p.Name).ToHashSet();
        // Only these three — no nbf, iss, aud, jti, sub, etc.
        Assert.Equal(new HashSet<string> { "subscriber_id", "subscriber_email", "exp" }, keys);
    }

    [Fact]
    public void GenerateToken_Exp_IsInFuture()
    {
        var before = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var token  = Build(expirationMinutes: 60).GenerateToken(1, "a@b.com");
        var doc    = JsonDocument.Parse(DecodeB64(token.Split('.')[1]));
        long exp   = doc.RootElement.GetProperty("exp").GetInt64();

        Assert.True(exp > before + 59 * 60, $"exp={exp} should be > {before + 59 * 60}");
        Assert.True(exp < before + 61 * 60, $"exp={exp} should be < {before + 61 * 60}");
    }

    [Theory]
    [InlineData(30)]
    [InlineData(60)]
    [InlineData(1440)]
    public void GenerateToken_ExpirationReflectsConfiguration(int minutes)
    {
        var before = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var token  = Build(expirationMinutes: minutes).GenerateToken(1, "a@b.com");
        var doc    = JsonDocument.Parse(DecodeB64(token.Split('.')[1]));
        long exp   = doc.RootElement.GetProperty("exp").GetInt64();

        long expectedExp = before + minutes * 60;
        Assert.True(Math.Abs(exp - expectedExp) < 5,
            $"exp={exp} expected ≈ {expectedExp}");
    }

    // ── Signature ───────────────────────────────────────────────────────────

    [Fact]
    public void GenerateToken_PassesSignatureVerification()
    {
        // We use the Microsoft library's validator against our hand-crafted token.
        var svc   = Build();
        var token = svc.GenerateToken(79665, "test@example.com");

        var handler = new JwtSecurityTokenHandler();
        var vp = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey         = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(ValidSecret)),
            ValidateIssuer           = false,
            ValidateAudience         = false,
            ValidateLifetime         = true,
            ClockSkew                = TimeSpan.Zero,
        };

        var principal = handler.ValidateToken(token, vp, out var validatedToken);
        Assert.NotNull(principal);
        Assert.NotNull(validatedToken);
    }

    [Fact]
    public void GenerateToken_WrongSecret_FailsVerification()
    {
        var token = Build().GenerateToken(79665, "test@example.com");

        var handler = new JwtSecurityTokenHandler();
        var vp = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey         = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes("wrong-secret-key-that-is-at-least-32-chars!!")),
            ValidateIssuer   = false,
            ValidateAudience = false,
            ValidateLifetime = false,
        };

        Assert.ThrowsAny<SecurityTokenException>(
            () => handler.ValidateToken(token, vp, out _));
    }

    // ── Deterministic output (given fixed exp) ───────────────────────────────

    [Fact]
    public void GenerateToken_KnownInputs_ProducesExactHeaderAndPayload()
    {
        // Fix the expiry to the value from the screenshot so we can assert
        // the exact header+payload base64 segments (signature depends on secret).
        var svc   = Build();
        var expiry = DateTimeOffset.FromUnixTimeSeconds(1774959448).UtcDateTime;
        // Use internal overload for deterministic exp
        var token = svc.GenerateToken(79665, "krishna.bankar@webgility.com", expiry);

        var parts = token.Split('.');
        Assert.Equal("eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9", parts[0]);
        Assert.Equal("eyJzdWJzY3JpYmVyX2lkIjo3OTY2NSwic3Vic2NyaWJlcl9lbWFpbCI6ImtyaXNobmEuYmFua2FyQHdlYmdpbGl0eS5jb20iLCJleHAiOjE3NzQ5NTk0NDh9", parts[1]);
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private static string DecodeB64(string b64url)
    {
        b64url += new string('=', (4 - b64url.Length % 4) % 4);
        byte[] bytes = Convert.FromBase64String(b64url.Replace('-', '+').Replace('_', '/'));
        return Encoding.UTF8.GetString(bytes);
    }
}
