using System.Text.RegularExpressions;

namespace AskAI.Web.Services;

/// <summary>Parses the canonical skills table from <c>.cursor/agent-skill-bindings.md</c>.</summary>
public static class AgentSkillBindingsParser
{
    private static readonly Regex BacktickedMarkdown = new(
        @"`([^`]+\.md)`",
        RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);

    public static IReadOnlyDictionary<string, IReadOnlyList<string>> ParseTable(string markdown)
    {
        var map = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
        using var reader = new StringReader(markdown);
        var inSkillsSection = false;

        while (reader.ReadLine() is { } line)
        {
            if (line.StartsWith("## Canonical skills", StringComparison.Ordinal))
            {
                inSkillsSection = true;
                continue;
            }

            if (inSkillsSection && line.StartsWith("## ", StringComparison.Ordinal))
                break;

            if (!inSkillsSection || !line.StartsWith('|'))
                continue;

            if (line.Contains("---|", StringComparison.Ordinal) ||
                line.Contains("Agent (`/name`)", StringComparison.Ordinal))
                continue;

            var cells = line.Split('|', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            if (cells.Length < 2)
                continue;

            var agentCell = cells[0];
            var skillsCell = cells[1];

            var agentMatch = Regex.Match(agentCell, @"`([^`]+)`");
            var agent = agentMatch.Success
                ? agentMatch.Groups[1].Value.Trim()
                : agentCell.Trim().Trim('`');

            if (agent.Length == 0)
                continue;

            var skills = new List<string>();
            foreach (Match m in BacktickedMarkdown.Matches(skillsCell))
            {
                var file = m.Groups[1].Value.Trim();
                if (file.EndsWith(".md", StringComparison.OrdinalIgnoreCase))
                    skills.Add(file);
            }

            if (skills.Count > 0)
                map[agent] = skills;
        }

        return map.ToDictionary(
            static k => k.Key,
            static v => (IReadOnlyList<string>)v.Value,
            StringComparer.OrdinalIgnoreCase);
    }
}
