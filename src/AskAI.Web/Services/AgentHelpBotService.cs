using System.Text;
using System.Text.RegularExpressions;
using AskAI.Web.Models;

namespace AskAI.Web.Services;

/// <summary>
/// Lightweight catalog assistant: keyword scoring over agents and skills (no external LLM required).
/// </summary>
public sealed class AgentHelpBotService
{
    private readonly AgentCatalogService _catalog;
    private static readonly Regex TokenRegex = new(@"[a-z0-9][a-z0-9-]{1,}", RegexOptions.Compiled | RegexOptions.IgnoreCase);

    public AgentHelpBotService(AgentCatalogService catalog) => _catalog = catalog;

    public ChatResponse Ask(string? message)
    {
        if (string.IsNullOrWhiteSpace(message))
        {
            return new ChatResponse
            {
                AnswerMarkdown =
                    "Ask about **agents** (for example Jira, Git, Slack), **skills** under `.cursor/skill-library/`, or **where prompts live**. I match your question against this repository’s catalog.",
                MatchedAgentIds = Array.Empty<string>(),
                Note = "Keyword catalog assistant (no LLM).",
            };
        }

        var catalog = _catalog.GetCatalog();
        var msg = message.Trim();

        var agentScores = new List<(AgentCatalogDto Agent, double Score)>();
        foreach (var agent in catalog.Agents)
        {
            var blob = string.Join(
                    '\n',
                    agent.Id,
                    agent.DisplayName ?? string.Empty,
                    agent.Description ?? string.Empty,
                    agent.SummaryExcerpt ?? string.Empty,
                    string.Join(' ', agent.BoundSkills))
                .ToLowerInvariant();

            var score = ScoreBlob(blob, msg);
            if (score > 0)
                agentScores.Add((agent, score));
        }

        agentScores.Sort((a, b) => b.Score.CompareTo(a.Score));
        var topAgents = agentScores.Take(5).ToList();

        var skillScores = new List<(ArtifactDto Skill, double Score)>();
        foreach (var skill in catalog.Skills)
        {
            var blob = skill.RelativePath.ToLowerInvariant();
            var score = ScoreBlob(blob, msg);
            if (score > 0)
                skillScores.Add((skill, score));
        }

        skillScores.Sort((a, b) => b.Score.CompareTo(a.Score));
        var topSkills = skillScores.Take(5).ToList();

        var sb = new StringBuilder();

        if (topAgents.Count == 0 && topSkills.Count == 0)
        {
            sb.AppendLine("I did not find strong keyword matches. Try naming an agent (`jira-automation`), a skill file (`jira-workflow.skill.md`), or a topic like **Bitbucket**, **Slack**, or **Confluence**.");
            sb.AppendLine();
            sb.AppendLine("### Browse");
            sb.AppendLine("- Open the **Agents** tab and filter by **Cursor / Copilot / VS Code**.");
            sb.AppendLine("- Use **Skills** and **Prompts** to open markdown in the preview pane.");
        }
        else
        {
            if (topAgents.Count > 0)
            {
                sb.AppendLine("### Agents");
                foreach (var (agent, _) in topAgents)
                {
                    sb.AppendLine($"#### [{agent.Id}](#agent/{Uri.EscapeDataString(agent.Id)})");
                    sb.AppendLine(agent.Description ?? agent.SummaryExcerpt ?? "_No description excerpt._");
                    if (agent.BoundSkills.Count > 0)
                        sb.AppendLine($"**Skills:** `{string.Join("`, `", agent.BoundSkills)}`");
                    sb.AppendLine();
                }
            }

            if (topSkills.Count > 0)
            {
                sb.AppendLine("### Skills");
                foreach (var (skill, _) in topSkills)
                {
                    sb.AppendLine($"- `{skill.RelativePath}` — [open preview](#doc/{Uri.EscapeDataString(skill.RelativePath)})");
                }

                sb.AppendLine();
            }
        }

        var matchedIds = topAgents.Select(a => a.Agent.Id).Distinct(StringComparer.OrdinalIgnoreCase).ToList();

        return new ChatResponse
        {
            AnswerMarkdown = sb.ToString().TrimEnd(),
            MatchedAgentIds = matchedIds,
            Note = "Keyword catalog assistant (no LLM). Configure a model-backed provider later if you want generative answers.",
        };
    }

    private static double ScoreBlob(string blobLower, string message)
    {
        var tokens = TokenRegex.Matches(message.ToLowerInvariant())
            .Select(m => m.Value)
            .Where(t => t.Length >= 2)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        double score = 0;
        foreach (var t in tokens)
        {
            var weight = t.Length >= 5 ? 4.0 : t.Length >= 3 ? 2.0 : 1.0;
            var idx = 0;
            while (true)
            {
                var j = blobLower.IndexOf(t, idx, StringComparison.Ordinal);
                if (j < 0)
                    break;

                score += weight;
                idx = j + Math.Max(1, t.Length);
            }
        }

        return score;
    }
}
