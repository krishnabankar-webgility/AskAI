using System.Text;
using AskAI.Web.Models;
using Microsoft.Extensions.Options;
using AskAI.Web.Options;

namespace AskAI.Web.Services;

public sealed class AgentCatalogService
{
    private readonly RepoRootResolver _repoRootResolver;
    private readonly AgentInsightsStore _insights;
    private readonly AgentCatalogOptions _options;
    private readonly ILogger<AgentCatalogService> _logger;
    private CatalogResponse? _cache;
    private string? _cacheRoot;

    public AgentCatalogService(
        RepoRootResolver repoRootResolver,
        AgentInsightsStore insights,
        IOptions<AgentCatalogOptions> options,
        ILogger<AgentCatalogService> logger)
    {
        _repoRootResolver = repoRootResolver;
        _insights = insights;
        _options = options.Value;
        _logger = logger;
    }

    public string GetRepoRoot() => _repoRootResolver.Resolve();

    public CatalogResponse GetCatalog(bool refresh = false)
    {
        var root = GetRepoRoot();
        if (!refresh && _cache is not null && string.Equals(_cacheRoot, root, StringComparison.OrdinalIgnoreCase))
            return _cache;

        var bindingsPath = Path.Combine(root, ".cursor", "agent-skill-bindings.md");
        if (!File.Exists(bindingsPath))
            throw new FileNotFoundException("Missing .cursor/agent-skill-bindings.md", bindingsPath);

        var bindingsMd = File.ReadAllText(bindingsPath);
        var skillMap = AgentSkillBindingsParser.ParseTable(bindingsMd);

        var cursorDir = Path.Combine(root, ".cursor", "agents");
        var cursorFiles = Directory.Exists(cursorDir)
            ? Directory.GetFiles(cursorDir, "*.md", SearchOption.TopDirectoryOnly)
            : Array.Empty<string>();

        var agents = new List<AgentCatalogDto>();
        var agentIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var path in cursorFiles.OrderBy(Path.GetFileName, StringComparer.OrdinalIgnoreCase))
        {
            var id = Path.GetFileNameWithoutExtension(path);
            agentIds.Add(id);
            agents.Add(BuildAgentDto(root, id, path, skillMap));
        }

        var vsCodeDir = Path.Combine(root, ".github", "agents");
        if (Directory.Exists(vsCodeDir))
        {
            foreach (var path in Directory.GetFiles(vsCodeDir, "*.agent.md", SearchOption.TopDirectoryOnly))
            {
                var id = Path.GetFileNameWithoutExtension(Path.GetFileNameWithoutExtension(path));
                if (agentIds.Contains(id))
                    continue;

                agentIds.Add(id);
                agents.Add(BuildVsCodeOnlyAgent(root, id, path, skillMap));
            }
        }

        agents.Sort((a, b) => string.Compare(a.Id, b.Id, StringComparison.OrdinalIgnoreCase));

        var skills = ListMarkdownFiles(Path.Combine(root, ".cursor", "skill-library"), ".md")
            .Select(p => ToArtifact(root, p, "Canonical skill"))
            .OrderBy(a => a.RelativePath, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var copilotSkillsRoot = Path.Combine(root, ".github", "copilot", "skills");
        var copilotMirrors = Directory.Exists(copilotSkillsRoot)
            ? Directory.GetFiles(copilotSkillsRoot, "*.md", SearchOption.AllDirectories)
                .Where(p => !p.Contains($"{Path.DirectorySeparatorChar}DEPRECATED", StringComparison.OrdinalIgnoreCase) &&
                            !Path.GetFileName(p).Equals("DEPRECATED.md", StringComparison.OrdinalIgnoreCase))
                .Select(p => ToArtifact(root, p, "Copilot skill mirror"))
                .OrderBy(a => a.RelativePath, StringComparer.OrdinalIgnoreCase)
                .ToList()
            : new List<ArtifactDto>();

        var promptsDir = Path.Combine(root, ".github", "prompts");
        var prompts = Directory.Exists(promptsDir)
            ? Directory.GetFiles(promptsDir, "*.prompt.md", SearchOption.TopDirectoryOnly)
            : Array.Empty<string>();

        var orphanPrompts = new List<ArtifactDto>();
        foreach (var p in prompts)
        {
            var baseName = Path.GetFileNameWithoutExtension(Path.GetFileNameWithoutExtension(p));
            if (!agentIds.Contains(baseName))
                orphanPrompts.Add(ToArtifact(root, p, "GitHub prompt"));
        }

        orphanPrompts.Sort((a, b) => string.Compare(a.RelativePath, b.RelativePath, StringComparison.OrdinalIgnoreCase));

        _cacheRoot = root;
        _cache = new CatalogResponse
        {
            RepoRoot = root,
            Agents = agents,
            Skills = skills,
            CopilotSkillMirrors = copilotMirrors,
            OrphanPrompts = orphanPrompts,
        };

        _logger.LogInformation("Catalog rebuilt with {AgentCount} agents.", agents.Count);
        return _cache;
    }

    public AgentCatalogDto? GetAgent(string id)
    {
        var catalog = GetCatalog();
        return catalog.Agents.FirstOrDefault(a => a.Id.Equals(id, StringComparison.OrdinalIgnoreCase));
    }

    public RawDocumentResponse? TryReadDocument(string relativePath)
    {
        var root = GetRepoRoot();
        if (!CatalogPathSecurity.TryNormalizeAndAuthorize(root, relativePath, out var full))
            return null;

        if (!File.Exists(full))
            return null;

        return new RawDocumentResponse
        {
            RelativePath = GetRelativePathFromRoot(root, full).Replace('\\', '/'),
            Content = File.ReadAllText(full),
            ContentType = "text/markdown; charset=utf-8",
        };
    }

    public IReadOnlyList<string> SearchableCorpusChunks()
    {
        var root = GetRepoRoot();
        var catalog = GetCatalog();
        var sb = new StringBuilder(_options.BotContextCharBudget);
        foreach (var agent in catalog.Agents)
        {
            sb.AppendLine($"# Agent {agent.Id}");
            sb.AppendLine(agent.Description ?? agent.SummaryExcerpt ?? string.Empty);
            sb.AppendLine(string.Join(", ", agent.BoundSkills));
            sb.AppendLine();
            if (sb.Length > _options.BotContextCharBudget)
                break;
        }

        return new[] { sb.ToString() };
    }

    private AgentCatalogDto BuildAgentDto(
        string root,
        string id,
        string cursorPath,
        IReadOnlyDictionary<string, IReadOnlyList<string>> skillMap)
    {
        var md = File.ReadAllText(cursorPath);
        var parsed = FrontMatterParser.Parse(md);
        var bound = skillMap.TryGetValue(id, out var list)
            ? list
            : skillMap.TryGetValue(NormalizeAgentKey(id), out var list2)
                ? list2
                : Array.Empty<string>();

        var copilotAbs = Path.Combine(root, ".github", "copilot", "agents", $"{id}.agent.md");

        var promptRel = $".github/prompts/{id}.prompt.md";
        var promptAbs = Path.Combine(root, ".github", "prompts", $"{id}.prompt.md");

        var vsRel = FindVsCodeAgent(root, id);

        var insights = _insights.GetForAgent(id);
        return new AgentCatalogDto
        {
            Id = id,
            DisplayName = parsed.Name ?? id,
            Description = parsed.Description,
            Model = parsed.Model,
            BoundSkills = bound,
            SummaryExcerpt = BuildExcerpt(parsed.Body),
            Artifacts = new AgentArtifactsDto
            {
                CursorAgent = ToArtifact(root, cursorPath, "Cursor subagent"),
                CopilotAgent = File.Exists(copilotAbs)
                    ? new ArtifactDto { RelativePath = NormalizeRel(root, copilotAbs), Label = "GitHub Copilot agent" }
                    : null,
                VsCodeAgentPicker = vsRel is not null
                    ? new ArtifactDto { RelativePath = vsRel, Label = "VS Code / GitHub agent picker" }
                    : null,
                GitHubPrompt = File.Exists(promptAbs)
                    ? new ArtifactDto { RelativePath = NormalizeRel(root, promptAbs), Label = "GitHub prompt" }
                    : null,
            },
            Insights = MapInsights(insights),
        };
    }

    private AgentCatalogDto BuildVsCodeOnlyAgent(
        string root,
        string id,
        string vsCodePath,
        IReadOnlyDictionary<string, IReadOnlyList<string>> skillMap)
    {
        var md = File.ReadAllText(vsCodePath);
        var parsed = FrontMatterParser.Parse(md);
        var bound = skillMap.TryGetValue(id, out var list) ? list : Array.Empty<string>();
        var insights = _insights.GetForAgent(id);

        return new AgentCatalogDto
        {
            Id = id,
            DisplayName = parsed.Name ?? id,
            Description = parsed.Description,
            Model = parsed.Model,
            BoundSkills = bound,
            SummaryExcerpt = BuildExcerpt(parsed.Body),
            Artifacts = new AgentArtifactsDto
            {
                CursorAgent = null,
                CopilotAgent = null,
                VsCodeAgentPicker = ToArtifact(root, vsCodePath, "VS Code / GitHub agent picker"),
                GitHubPrompt = null,
            },
            Insights = MapInsights(insights),
        };
    }

    private static string? FindVsCodeAgent(string root, string id)
    {
        var direct = Path.Combine(root, ".github", "agents", $"{id}.agent.md");
        if (File.Exists(direct))
            return NormalizeRel(root, direct);

        var match = Directory.GetFiles(Path.Combine(root, ".github", "agents"), "*.agent.md", SearchOption.TopDirectoryOnly)
            .FirstOrDefault(p => p.Contains(id, StringComparison.OrdinalIgnoreCase));

        return match is not null ? NormalizeRel(root, match) : null;
    }

    private static string NormalizeAgentKey(string id) =>
        id.Replace("_", "-", StringComparison.Ordinal);

    private static AgentInsightsDto MapInsights(AgentInsightsRecord r) => new()
    {
        Capabilities = r.Capabilities ?? new List<string>(),
        Weaknesses = r.Weaknesses ?? new List<string>(),
        Performance = r.Performance,
        Learnings = r.Learnings ?? new List<string>(),
        Suggestions = r.Suggestions ?? new List<string>(),
    };

    private static IEnumerable<string> ListMarkdownFiles(string directory, string pattern)
    {
        if (!Directory.Exists(directory))
            yield break;

        foreach (var file in Directory.GetFiles(directory, pattern, SearchOption.TopDirectoryOnly))
            yield return file;
    }

    private static ArtifactDto ToArtifact(string repoRoot, string fullPath, string label) =>
        new()
        {
            RelativePath = GetRelativePathFromRoot(repoRoot, fullPath),
            Label = label,
        };

    private static string NormalizeRel(string repoRoot, string fullPath) =>
        GetRelativePathFromRoot(repoRoot, fullPath);

    private static string GetRelativePathFromRoot(string repoRoot, string fullPath) =>
        Path.GetRelativePath(repoRoot, fullPath).Replace('\\', '/');

    private static string? BuildExcerpt(string body, int maxLen = 420)
    {
        var text = body.Replace("\r\n", "\n", StringComparison.Ordinal).Trim();
        if (text.Length == 0)
            return null;

        var flat = string.Join(
            " ",
            text.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));

        return flat.Length <= maxLen ? flat : flat[..maxLen].TrimEnd() + "…";
    }
}
