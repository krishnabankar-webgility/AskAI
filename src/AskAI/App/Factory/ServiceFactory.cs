using AskAI.Core.Providers;
using AskAI.Core.Repositories;
using Microsoft.Extensions.DependencyInjection;

namespace AskAI.App.Factory;

/// <summary>
/// Factory that creates application services via the DI container (Factory Pattern).
/// Centralises service resolution and avoids service-locator anti-patterns in application code.
/// </summary>
public sealed class ServiceFactory
{
    private readonly IServiceProvider _serviceProvider;

    /// <summary>
    /// Initialises the factory with the application's <see cref="IServiceProvider"/>.
    /// </summary>
    public ServiceFactory(IServiceProvider serviceProvider)
    {
        _serviceProvider = serviceProvider ?? throw new ArgumentNullException(nameof(serviceProvider));
    }

    /// <summary>Resolves the registered <see cref="IAiProvider"/>.</summary>
    public IAiProvider CreateAiProvider() =>
        _serviceProvider.GetRequiredService<IAiProvider>();

    /// <summary>Resolves the registered <see cref="IDatabaseProvider"/>.</summary>
    public IDatabaseProvider CreateDatabaseProvider() =>
        _serviceProvider.GetRequiredService<IDatabaseProvider>();

    /// <summary>Resolves the registered <see cref="IConversationRepository"/>.</summary>
    public IConversationRepository CreateConversationRepository() =>
        _serviceProvider.GetRequiredService<IConversationRepository>();
}
