using AskAI.Web.Models;
using AskAI.Web.Options;
using AskAI.Web.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<AgentCatalogOptions>(builder.Configuration.GetSection(AgentCatalogOptions.SectionName));
builder.Services.PostConfigure<AgentCatalogOptions>(opts =>
{
    var fromEnv = Environment.GetEnvironmentVariable("AGENT_CATALOG_REPO_ROOT");
    if (!string.IsNullOrWhiteSpace(fromEnv))
        opts.RepoRoot = fromEnv;
});
builder.Services.AddSingleton<RepoRootResolver>();
builder.Services.AddSingleton<AgentInsightsStore>();
builder.Services.AddSingleton<AgentCatalogService>();
builder.Services.AddSingleton<AgentHelpBotService>();

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.AllowAnyHeader().AllowAnyMethod().AllowAnyOrigin());
});

var app = builder.Build();

app.UseCors();
app.UseDefaultFiles();
app.UseStaticFiles();

app.MapGet("/api/health", () => Results.Ok(new { status = "ok", ts = DateTimeOffset.UtcNow }));

app.MapGet("/api/catalog", (AgentCatalogService catalog, bool? refresh) =>
    Results.Ok(catalog.GetCatalog(refresh == true)));

app.MapGet("/api/catalog/agents/{id}", (string id, AgentCatalogService catalog) =>
{
    var agent = catalog.GetAgent(id);
    return agent is null ? Results.NotFound() : Results.Ok(agent);
});

app.MapGet("/api/raw", (string path, AgentCatalogService catalog) =>
{
    if (string.IsNullOrWhiteSpace(path))
        return Results.BadRequest("Missing path.");

    var doc = catalog.TryReadDocument(path);
    return doc is null ? Results.NotFound() : Results.Ok(doc);
});

app.MapPost("/api/chat", (ChatRequest request, AgentHelpBotService bot) =>
{
    var answer = bot.Ask(request.Message);
    return Results.Ok(answer);
});

app.MapFallbackToFile("index.html");

app.Run();
