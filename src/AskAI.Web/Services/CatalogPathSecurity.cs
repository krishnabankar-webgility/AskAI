namespace AskAI.Web.Services;

/// <summary>Restricts file reads to known agent/skill/prompt locations under the repo root.</summary>
public static class CatalogPathSecurity
{
    private static readonly string[] AllowedRelativePrefixes =
    [
        ".cursor/agents/",
        ".cursor/skill-library/",
        ".cursor/agent-skill-bindings.md",
        ".github/agents/",
        ".github/copilot/agents/",
        ".github/copilot/skills/",
        ".github/prompts/",
        ".github/copilot/AGENT-SKILL-BINDINGS.md",
        "AGENTS.md",
        "README.md",
    ];

    public static bool TryNormalizeAndAuthorize(string repoRoot, string relativePath, out string fullPath)
    {
        fullPath = string.Empty;
        if (string.IsNullOrWhiteSpace(relativePath))
            return false;

        var trimmed = relativePath.Trim().Replace('\\', '/');
        if (trimmed.Contains("..", StringComparison.Ordinal))
            return false;

        if (trimmed.StartsWith('/'))
            trimmed = trimmed[1..];

        var matched = AllowedRelativePrefixes.Any(prefix =>
            trimmed.Equals(prefix, StringComparison.OrdinalIgnoreCase) ||
            trimmed.StartsWith(prefix, StringComparison.OrdinalIgnoreCase));

        if (!matched)
            return false;

        var combined = Path.GetFullPath(Path.Combine(repoRoot, trimmed.Replace('/', Path.DirectorySeparatorChar)));
        var root = Path.GetFullPath(repoRoot);
        if (!combined.StartsWith(root, PathInternalStringComparison))
            return false;

        fullPath = combined;
        return true;
    }

    private static readonly StringComparison PathInternalStringComparison =
        OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
}
