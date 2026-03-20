using AskAI.App.Configuration;
using AskAI.App.Factory;
using AskAI.Console.Commands;
using AskAI.Core.Providers;
using AskAI.Core.Repositories;
using AskAI.Resources;
using AskAI.Service.Providers;
using AskAI.Service.Repositories;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

var host = Host.CreateDefaultBuilder(args)
    .ConfigureServices((context, services) =>
    {
        // Configuration
        services.AddOptions<AiOptions>()
            .Bind(context.Configuration.GetSection(AiOptions.SectionName))
            .ValidateDataAnnotations()
            .ValidateOnStart();

        services.AddOptions<DatabaseOptions>()
            .Bind(context.Configuration.GetSection(DatabaseOptions.SectionName))
            .ValidateDataAnnotations()
            .ValidateOnStart();

        // Providers (Provider Pattern)
        services.AddSingleton<IAiProvider, SemanticKernelAiProvider>();
        services.AddSingleton<IDatabaseProvider, SqliteDatabaseProvider>();

        // Repository (Repository Pattern)
        services.AddSingleton<IConversationRepository, ConversationRepository>();

        // Command Handlers (Command Pattern)
        services.AddTransient<AskCommandHandler>();

        // Factory (Factory Pattern)
        services.AddSingleton<ServiceFactory>();
    })
    .Build();

var logger = host.Services.GetRequiredService<ILogger<Program>>();
logger.LogInformation(LogMessages.ApplicationStarting);

try
{
    var prompt = args.Length > 0 ? string.Join(' ', args) : "Hello, AskAI!";

    var handler = AskCommandHandler.SetupCommand(host);
    var options = new AskCommandOptions { Prompt = prompt };

    var exitCode = await handler.ExecuteAsync(options).ConfigureAwait(false);
    logger.LogInformation(LogMessages.ApplicationStopping);
    return exitCode;
}
catch (Exception ex)
{
    logger.LogCritical(ex, ErrorMessages.UnexpectedError);
    return 2;
}
