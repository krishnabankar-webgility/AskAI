using AskAI.Web.Options;
using Microsoft.Extensions.Options;

namespace AskAI.Web.Services;

/// <summary>Resolves the AskAI repository root for catalog scanning.</summary>
public sealed class RepoRootResolver
{
    private readonly AgentCatalogOptions _options;
    private readonly ILogger<RepoRootResolver> _logger;

    public RepoRootResolver(IOptions<AgentCatalogOptions> options, ILogger<RepoRootResolver> logger)
    {
        _options = options.Value;
        _logger = logger;
    }

    public string Resolve()
    {
        if (!string.IsNullOrWhiteSpace(_options.RepoRoot))
        {
            var configured = Path.GetFullPath(_options.RepoRoot);
            if (!Directory.Exists(Path.Combine(configured, ".cursor", "agents")))
                throw new DirectoryNotFoundException(
                    $"AgentCatalog:RepoRoot is set to '{configured}' but '.cursor/agents' was not found.");

            return configured;
        }

        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            var agents = Path.Combine(dir.FullName, ".cursor", "agents");
            if (Directory.Exists(agents))
            {
                _logger.LogInformation("Resolved repo root to {Root}", dir.FullName);
                return dir.FullName;
            }

            dir = dir.Parent;
        }

        throw new DirectoryNotFoundException(
            "Could not locate AskAI repo root (folder with '.cursor/agents'). " +
            "Set AgentCatalog:RepoRoot in appsettings or the AGENT_CATALOG_REPO_ROOT environment variable.");
    }
}
