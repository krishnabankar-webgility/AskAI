namespace AskAI.Core.Services;

/// <summary>Generates signed JWT bearer tokens.</summary>
public interface IJwtTokenService
{
    /// <summary>
    /// Creates a signed HS256 JWT bearer token for the given subscriber.
    /// </summary>
    /// <param name="subscriberId">Numeric subscriber identifier (subscriber_id claim).</param>
    /// <param name="subscriberEmail">Subscriber e-mail address (subscriber_email claim).</param>
    /// <returns>The compact serialized JWT string.</returns>
    string GenerateToken(long subscriberId, string subscriberEmail);
}
