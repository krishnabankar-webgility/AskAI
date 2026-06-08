using System.Text;

namespace AskAI.Web.Services;

public sealed record ParsedMarkdown(string? Name, string? Model, string? Description, string Body);

/// <summary>Parses a small subset of YAML front matter used by Cursor/Copilot agent markdown files.</summary>
public static class FrontMatterParser
{
    public static ParsedMarkdown Parse(string markdown)
    {
        ArgumentNullException.ThrowIfNull(markdown);
        if (!markdown.StartsWith("---", StringComparison.Ordinal))
            return new ParsedMarkdown(null, null, null, markdown);

        var close = markdown.IndexOf("\n---", 3, StringComparison.Ordinal);
        if (close < 0)
            return new ParsedMarkdown(null, null, null, markdown);

        var yaml = markdown[3..close].Trim('\r', '\n');
        var body = markdown[(close + "\n---".Length)..].TrimStart('\r', '\n');

        string? name = null;
        string? model = null;
        string? description = null;

        var lines = yaml.Split(["\r\n", "\n"], StringSplitOptions.None);
        string? activeKey = null;
        var descriptionBuilder = new StringBuilder();

        foreach (var raw in lines)
        {
            var line = raw.TrimEnd();
            if (string.IsNullOrWhiteSpace(line))
            {
                if (activeKey == "description" && descriptionBuilder.Length > 0)
                    descriptionBuilder.Append(' ');
                continue;
            }

            var isIndented = raw.Length > 0 && (raw[0] == ' ' || raw[0] == '\t');
            if (!isIndented && raw.Contains(':', StringComparison.Ordinal))
            {
                var colon = line.IndexOf(':');
                if (colon <= 0)
                    continue;

                var key = line[..colon].Trim();
                var value = line[(colon + 1)..].Trim();

                if (key.Equals("name", StringComparison.OrdinalIgnoreCase))
                {
                    activeKey = "name";
                    name = value;
                }
                else if (key.Equals("model", StringComparison.OrdinalIgnoreCase))
                {
                    activeKey = "model";
                    model = value;
                }
                else if (key.Equals("description", StringComparison.OrdinalIgnoreCase))
                {
                    activeKey = "description";
                    descriptionBuilder.Clear();
                    if (value is not ("" or ">"))
                        descriptionBuilder.Append(value).Append(' ');
                }
            }
            else if (activeKey == "description" && isIndented)
            {
                descriptionBuilder.Append(line.Trim()).Append(' ');
            }
        }

        description = descriptionBuilder.Length > 0
            ? descriptionBuilder.ToString().Trim()
            : null;

        return new ParsedMarkdown(name, model, description, body);
    }
}
