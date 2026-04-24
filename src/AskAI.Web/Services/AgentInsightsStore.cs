using System.Text.Json;

namespace AskAI.Web.Services;

public sealed class AgentInsightsStore
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true,
    };

    private readonly IWebHostEnvironment _env;
    private readonly ILogger<AgentInsightsStore> _logger;
    private InsightsFile? _cached;

    public AgentInsightsStore(IWebHostEnvironment env, ILogger<AgentInsightsStore> logger)
    {
        _env = env;
        _logger = logger;
    }

    public AgentInsightsRecord GetForAgent(string agentId)
    {
        var file = Load();
        if (file.Agents is not null &&
            file.Agents.TryGetValue(agentId, out var row) &&
            row is not null)
            return Merge(file.Defaults, row);

        return Merge(file.Defaults, null);
    }

    private InsightsFile Load()
    {
        if (_cached is not null)
            return _cached;

        var path = Path.Combine(_env.ContentRootPath, "Data", "agent-insights.json");
        if (!File.Exists(path))
        {
            _logger.LogWarning("Insights file missing at {Path}; using defaults only.", path);
            _cached = new InsightsFile { Defaults = AgentInsightsRecord.CreateTemplateDefaults() };
            return _cached;
        }

        try
        {
            var json = File.ReadAllText(path);
            _cached = JsonSerializer.Deserialize<InsightsFile>(json, JsonOptions) ?? new InsightsFile();

            _cached.Defaults ??= AgentInsightsRecord.CreateTemplateDefaults();
            if (_cached.Agents is { Count: > 0 })
            {
                var normalized = new Dictionary<string, AgentInsightsRecord>(StringComparer.OrdinalIgnoreCase);
                foreach (var kv in _cached.Agents)
                    normalized[kv.Key] = kv.Value;

                _cached.Agents = normalized;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to read insights file; using defaults.");
            _cached = new InsightsFile { Defaults = AgentInsightsRecord.CreateTemplateDefaults() };
        }

        return _cached;
    }

    private static AgentInsightsRecord Merge(AgentInsightsRecord? defaults, AgentInsightsRecord? specific)
    {
        defaults ??= AgentInsightsRecord.CreateTemplateDefaults();
        if (specific is null)
            return defaults;

        return new AgentInsightsRecord
        {
            Capabilities = Coalesce(specific.Capabilities, defaults.Capabilities),
            Weaknesses = Coalesce(specific.Weaknesses, defaults.Weaknesses),
            Performance = string.IsNullOrWhiteSpace(specific.Performance) ? defaults.Performance : specific.Performance,
            Learnings = Coalesce(specific.Learnings, defaults.Learnings),
            Suggestions = Coalesce(specific.Suggestions, defaults.Suggestions),
        };
    }

    private static List<string> Coalesce(List<string>? primary, List<string>? fallback)
    {
        if (primary is { Count: > 0 })
            return primary;

        return fallback ?? new List<string>();
    }
}

public sealed class InsightsFile
{
    public Dictionary<string, AgentInsightsRecord>? Agents { get; set; }
    public AgentInsightsRecord? Defaults { get; set; }
}

public sealed class AgentInsightsRecord
{
    public List<string>? Capabilities { get; set; }
    public List<string>? Weaknesses { get; set; }
    public string? Performance { get; set; }
    public List<string>? Learnings { get; set; }
    public List<string>? Suggestions { get; set; }

    public static AgentInsightsRecord CreateTemplateDefaults() => new()
    {
        Capabilities =
        [
            "Follows the repo’s declared skill read order before acting.",
            "Scoped to the AskAI agent/skill layout (Cursor + Copilot + VS Code mirrors).",
        ],
        Weaknesses =
        [
            "Quality depends on tools (MCP, git remotes, tokens) configured in the user environment.",
            "Large skill files can consume model context; prefer specialist agents when possible.",
        ],
        Performance =
            "No telemetry is collected in this dashboard; treat performance as workflow-dependent (API latency, model speed, parallel tool use).",
        Learnings =
        [
            "Keep `.cursor/agent-skill-bindings.md` and `.github/copilot/AGENT-SKILL-BINDINGS.md` aligned when adding agents.",
            "Use `/agent-learning` to persist corrections into skills after specialist runs.",
        ],
        Suggestions =
        [
            "Add measurable acceptance checks per agent in `Data/agent-insights.json`.",
            "Split very large skills into additional `skill-*.md` files and reference them from the agent read list.",
        ],
    };
}
