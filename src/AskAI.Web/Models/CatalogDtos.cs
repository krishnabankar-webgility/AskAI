using System.Text.Json.Serialization;

namespace AskAI.Web.Models;

public sealed class CatalogResponse
{
    public required string RepoRoot { get; init; }
    public required IReadOnlyList<AgentCatalogDto> Agents { get; init; }
    public required IReadOnlyList<ArtifactDto> Skills { get; init; }
    public required IReadOnlyList<ArtifactDto> CopilotSkillMirrors { get; init; }
    public required IReadOnlyList<ArtifactDto> OrphanPrompts { get; init; }
}

public sealed class AgentCatalogDto
{
    public required string Id { get; init; }
    public string? DisplayName { get; init; }
    public string? Description { get; init; }
    public string? Model { get; init; }
    public required IReadOnlyList<string> BoundSkills { get; init; }
    public string? SummaryExcerpt { get; init; }
    public required AgentArtifactsDto Artifacts { get; init; }
    public required AgentInsightsDto Insights { get; init; }
}

public sealed class AgentArtifactsDto
{
    public ArtifactDto? CursorAgent { get; init; }
    public ArtifactDto? CopilotAgent { get; init; }
    public ArtifactDto? VsCodeAgentPicker { get; init; }
    public ArtifactDto? GitHubPrompt { get; init; }
}

public sealed class ArtifactDto
{
    public required string RelativePath { get; init; }
    public required string Label { get; init; }
}

public sealed class AgentInsightsDto
{
    public required IReadOnlyList<string> Capabilities { get; init; }
    public required IReadOnlyList<string> Weaknesses { get; init; }
    public string? Performance { get; init; }
    public required IReadOnlyList<string> Learnings { get; init; }
    public required IReadOnlyList<string> Suggestions { get; init; }
}

public sealed class RawDocumentResponse
{
    public required string RelativePath { get; init; }
    public required string Content { get; init; }
    public required string ContentType { get; init; }
}

public sealed class ChatRequest
{
    public string? Message { get; set; }
}

public sealed class ChatResponse
{
    public required string AnswerMarkdown { get; init; }
    public required IReadOnlyList<string> MatchedAgentIds { get; init; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Note { get; init; }
}
