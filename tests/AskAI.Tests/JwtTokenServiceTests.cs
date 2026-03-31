using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using AskAI.App.Configuration;
using AskAI.Service.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace AskAI.Tests;

// ---------------------------------------------------------------------------
// Service.Services – JwtTokenService
// ---------------------------------------------------------------------------

public class JwtTokenServiceTests
{
    private const string ValidSecret = "super-secret-key-that-is-at-least-32-chars!";
    private const string DefaultIssuer = "TestIssuer";
    private const string DefaultAudience = "TestAudience";

    private static JwtTokenService Build(
        string? secret = null,
        string? issuer = null,
        string? audience = null,
        int expirationMinutes = 60)
    {
        var opts = Options.Create(new JwtOptions
        {
            SecretKey = secret ?? ValidSecret,
            Issuer = issuer ?? DefaultIssuer,
            Audience = audience ?? DefaultAudience,
            ExpirationMinutes = expirationMinutes,
        });

        return new JwtTokenService(opts, NullLogger<JwtTokenService>.Instance);
    }

    // ---- Constructor guards ----

    [Fact]
    public void Constructor_NullOptions_Throws()
    {
        Assert.Throws<ArgumentNullException>(() =>
            new JwtTokenService(null!, NullLogger<JwtTokenService>.Instance));
    }

    [Fact]
    public void Constructor_NullLogger_Throws()
    {
        var opts = Options.Create(new JwtOptions
        {
            SecretKey = ValidSecret,
            Issuer = DefaultIssuer,
            Audience = DefaultAudience,
        });
        Assert.Throws<ArgumentNullException>(() => new JwtTokenService(opts, null!));
    }

    // ---- GenerateToken argument guards ----

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void GenerateToken_BlankEmail_ThrowsArgumentException(string? email)
    {
        var svc = Build();
        Assert.ThrowsAny<ArgumentException>(() => svc.GenerateToken(1, email!));
    }

    // ---- Token structure ----

    [Fact]
    public void GenerateToken_ReturnsNonEmptyString()
    {
        var svc = Build();
        var token = svc.GenerateToken(79665, "test@example.com");
        Assert.False(string.IsNullOrWhiteSpace(token));
    }

    [Fact]
    public void GenerateToken_IsValidJwt_WithThreeParts()
    {
        var svc = Build();
        var token = svc.GenerateToken(79665, "test@example.com");
        var parts = token.Split('.');
        Assert.Equal(3, parts.Length);
    }

    [Fact]
    public void GenerateToken_Header_HasAlgHS256AndTypJWT()
    {
        var svc = Build();
        var token = svc.GenerateToken(79665, "test@example.com");

        var handler = new JwtSecurityTokenHandler();
        var jwt = handler.ReadJwtToken(token);

        Assert.Equal("HS256", jwt.Header.Alg);
        Assert.Equal("JWT", jwt.Header.Typ);
    }

    // ---- Claims ----

    [Fact]
    public void GenerateToken_ContainsSubscriberIdClaim()
    {
        var svc = Build();
        var token = svc.GenerateToken(79665, "krishna.bankar@webgility.com");

        var handler = new JwtSecurityTokenHandler();
        var jwt = handler.ReadJwtToken(token);

        var claim = jwt.Claims.FirstOrDefault(c => c.Type == "subscriber_id");
        Assert.NotNull(claim);
        Assert.Equal("79665", claim.Value);
    }

    [Fact]
    public void GenerateToken_ContainsSubscriberEmailClaim()
    {
        var svc = Build();
        var token = svc.GenerateToken(79665, "krishna.bankar@webgility.com");

        var handler = new JwtSecurityTokenHandler();
        var jwt = handler.ReadJwtToken(token);

        var claim = jwt.Claims.FirstOrDefault(c => c.Type == "subscriber_email");
        Assert.NotNull(claim);
        Assert.Equal("krishna.bankar@webgility.com", claim.Value);
    }

    [Fact]
    public void GenerateToken_ContainsExpClaim_InFuture()
    {
        var svc = Build(expirationMinutes: 60);
        var before = DateTime.UtcNow;
        var token = svc.GenerateToken(79665, "test@example.com");
        var after = DateTime.UtcNow;

        var handler = new JwtSecurityTokenHandler();
        var jwt = handler.ReadJwtToken(token);

        Assert.True(jwt.ValidTo > before.AddMinutes(59));
        Assert.True(jwt.ValidTo < after.AddMinutes(61));
    }

    // ---- Signature verification ----

    [Fact]
    public void GenerateToken_PassesSignatureVerification()
    {
        var svc = Build();
        var token = svc.GenerateToken(79665, "test@example.com");

        var handler = new JwtSecurityTokenHandler();
        var validationParams = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = DefaultIssuer,
            ValidateAudience = true,
            ValidAudience = DefaultAudience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(ValidSecret)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.Zero,
        };

        var principal = handler.ValidateToken(token, validationParams, out var validatedToken);

        Assert.NotNull(principal);
        Assert.NotNull(validatedToken);
    }

    [Fact]
    public void GenerateToken_DifferentSecret_FailsVerification()
    {
        var svc = Build();
        var token = svc.GenerateToken(79665, "test@example.com");

        var handler = new JwtSecurityTokenHandler();
        var validationParams = new TokenValidationParameters
        {
            ValidateIssuer = false,
            ValidateAudience = false,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes("wrong-secret-key-that-is-at-least-32-chars!!")),
            ValidateLifetime = false,
        };

        Assert.ThrowsAny<SecurityTokenException>(
            () => handler.ValidateToken(token, validationParams, out _));
    }

    // ---- Expiration configuration ----

    [Theory]
    [InlineData(30)]
    [InlineData(60)]
    [InlineData(1440)]
    public void GenerateToken_ExpirationReflectsConfiguration(int minutes)
    {
        var svc = Build(expirationMinutes: minutes);
        var before = DateTime.UtcNow;
        var token = svc.GenerateToken(1, "a@b.com");

        var handler = new JwtSecurityTokenHandler();
        var jwt = handler.ReadJwtToken(token);

        var expectedExp = before.AddMinutes(minutes);
        Assert.True(Math.Abs((jwt.ValidTo - expectedExp).TotalSeconds) < 5,
            $"ValidTo={jwt.ValidTo:u} expected ≈ {expectedExp:u}");
    }
}
