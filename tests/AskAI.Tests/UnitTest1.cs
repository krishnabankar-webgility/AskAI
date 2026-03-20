using AskAI.App.Configuration;
using AskAI.App.Factory;
using AskAI.Console.Commands;
using AskAI.Core.Commands;
using AskAI.Core.Models;
using AskAI.Core.Providers;
using AskAI.Core.Repositories;
using AskAI.Resources;
using AskAI.Service.Providers;
using AskAI.Service.Repositories;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using System.ComponentModel.DataAnnotations;

namespace AskAI.Tests;

// ---------------------------------------------------------------------------
// Core.Models
// ---------------------------------------------------------------------------

public class ConversationTests
{
    [Fact]
    public void Conversation_DefaultValues_AreValid()
    {
        var c = new Conversation { Prompt = "Hello", Reply = "World" };

        Assert.NotEqual(Guid.Empty, c.Id);
        Assert.Equal("Hello", c.Prompt);
        Assert.Equal("World", c.Reply);
        Assert.True(c.CreatedAt <= DateTimeOffset.UtcNow);
    }

    [Fact]
    public void Conversation_TwoInstances_HaveDifferentIds()
    {
        var c1 = new Conversation { Prompt = "P1", Reply = "R1" };
        var c2 = new Conversation { Prompt = "P2", Reply = "R2" };

        Assert.NotEqual(c1.Id, c2.Id);
    }
}

// ---------------------------------------------------------------------------
// Core.Commands – CommandHandlerOptions
// ---------------------------------------------------------------------------

public class CommandHandlerOptionsTests
{
    private sealed class TestOptions : CommandHandlerOptions { }

    [Fact]
    public void CommandHandlerOptions_DefaultVerbose_IsFalse()
    {
        var opts = new TestOptions();
        Assert.False(opts.Verbose);
    }
}

// ---------------------------------------------------------------------------
// Core.Commands – CommandHandler (Template Method pattern)
// ---------------------------------------------------------------------------

public class CommandHandlerTests
{
    private sealed class SuccessHandler : CommandHandler<CommandHandlerOptions>
    {
        public SuccessHandler(ILogger<SuccessHandler> logger) : base(logger) { }

        protected override Task<int> HandleAsync(
            CommandHandlerOptions options,
            CancellationToken cancellationToken) => Task.FromResult(0);
    }

    private sealed class FailingHandler : CommandHandler<CommandHandlerOptions>
    {
        public FailingHandler(ILogger<FailingHandler> logger) : base(logger) { }

        protected override Task<int> HandleAsync(
            CommandHandlerOptions options,
            CancellationToken cancellationToken) => throw new InvalidOperationException("boom");
    }

    private sealed class CancellingHandler : CommandHandler<CommandHandlerOptions>
    {
        public CancellingHandler(ILogger<CancellingHandler> logger) : base(logger) { }

        protected override async Task<int> HandleAsync(
            CommandHandlerOptions options,
            CancellationToken cancellationToken)
        {
            await Task.Delay(Timeout.Infinite, cancellationToken);
            return 0;
        }
    }

    [Fact]
    public async Task ExecuteAsync_NullOptions_ThrowsArgumentNullException()
    {
        var handler = new SuccessHandler(NullLogger<SuccessHandler>.Instance);
        await Assert.ThrowsAsync<ArgumentNullException>(
            () => handler.ExecuteAsync(null!));
    }

    [Fact]
    public async Task ExecuteAsync_ValidOptions_ReturnsZero()
    {
        var handler = new SuccessHandler(NullLogger<SuccessHandler>.Instance);
        var result = await handler.ExecuteAsync(new CommandHandlerOptions());
        Assert.Equal(0, result);
    }

    [Fact]
    public async Task ExecuteAsync_HandleThrows_ReturnsTwo()
    {
        var handler = new FailingHandler(NullLogger<FailingHandler>.Instance);
        var result = await handler.ExecuteAsync(new CommandHandlerOptions());
        Assert.Equal(2, result);
    }

    [Fact]
    public async Task ExecuteAsync_Cancelled_ReturnsOne()
    {
        var handler = new CancellingHandler(NullLogger<CancellingHandler>.Instance);
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        var result = await handler.ExecuteAsync(new CommandHandlerOptions(), cts.Token);
        Assert.Equal(1, result);
    }
}

// ---------------------------------------------------------------------------
// Console.Commands – AskCommandOptions
// ---------------------------------------------------------------------------

public class AskCommandOptionsTests
{
    [Fact]
    public void AskCommandOptions_ValidPrompt_PassesValidation()
    {
        var opts = new AskCommandOptions { Prompt = "What is the weather?" };
        var ctx = new ValidationContext(opts);
        var results = new List<ValidationResult>();

        var valid = Validator.TryValidateObject(opts, ctx, results, true);
        Assert.True(valid);
    }

    [Fact]
    public void AskCommandOptions_DefaultSave_IsTrue()
    {
        var opts = new AskCommandOptions { Prompt = "Any" };
        Assert.True(opts.Save);
    }
}

// ---------------------------------------------------------------------------
// Console.Commands – AskCommandHandler
// ---------------------------------------------------------------------------

public class AskCommandHandlerTests
{
    private static AskCommandHandler BuildHandler(
        IAiProvider? ai = null,
        IConversationRepository? repo = null)
    {
        ai ??= Mock.Of<IAiProvider>(p =>
            p.GetCompletionAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()) ==
            Task.FromResult("mocked reply"));

        repo ??= Mock.Of<IConversationRepository>();

        return new AskCommandHandler(ai, repo, NullLogger<AskCommandHandler>.Instance);
    }

    [Fact]
    public void Constructor_NullAiProvider_Throws()
    {
        Assert.Throws<ArgumentNullException>(() =>
            new AskCommandHandler(null!, Mock.Of<IConversationRepository>(),
                NullLogger<AskCommandHandler>.Instance));
    }

    [Fact]
    public void Constructor_NullRepository_Throws()
    {
        Assert.Throws<ArgumentNullException>(() =>
            new AskCommandHandler(Mock.Of<IAiProvider>(), null!,
                NullLogger<AskCommandHandler>.Instance));
    }

    [Fact]
    public async Task ExecuteAsync_ValidPrompt_ReturnsZero()
    {
        var handler = BuildHandler();
        var result = await handler.ExecuteAsync(new AskCommandOptions { Prompt = "Hello" });
        Assert.Equal(0, result);
    }

    [Fact]
    public async Task ExecuteAsync_SaveTrue_CallsRepository()
    {
        var repoMock = new Mock<IConversationRepository>();
        var handler = BuildHandler(repo: repoMock.Object);

        await handler.ExecuteAsync(new AskCommandOptions { Prompt = "Save me", Save = true });

        repoMock.Verify(
            r => r.AddAsync(It.IsAny<Conversation>(), It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task ExecuteAsync_SaveFalse_DoesNotCallRepository()
    {
        var repoMock = new Mock<IConversationRepository>();
        var handler = BuildHandler(repo: repoMock.Object);

        await handler.ExecuteAsync(new AskCommandOptions { Prompt = "Don't save", Save = false });

        repoMock.Verify(
            r => r.AddAsync(It.IsAny<Conversation>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }
}

// ---------------------------------------------------------------------------
// App.Configuration – AiOptions
// ---------------------------------------------------------------------------

public class AiOptionsTests
{
    [Fact]
    public void AiOptions_DefaultModelId_IsGpt4o()
    {
        var opts = new AiOptions();
        Assert.Equal("gpt-4o", opts.ModelId);
    }

    [Fact]
    public void AiOptions_EmptyModelId_FailsValidation()
    {
        var opts = new AiOptions { ModelId = string.Empty };
        var ctx = new ValidationContext(opts);
        var results = new List<ValidationResult>();

        var valid = Validator.TryValidateObject(opts, ctx, results, true);
        Assert.False(valid);
        Assert.Contains(results, r => r.MemberNames.Contains(nameof(AiOptions.ModelId)));
    }

    [Fact]
    public void AiOptions_MaxTokensOutOfRange_FailsValidation()
    {
        var opts = new AiOptions { MaxTokens = 0 };
        var ctx = new ValidationContext(opts);
        var results = new List<ValidationResult>();

        var valid = Validator.TryValidateObject(opts, ctx, results, true);
        Assert.False(valid);
    }
}

// ---------------------------------------------------------------------------
// App.Configuration – DatabaseOptions
// ---------------------------------------------------------------------------

public class DatabaseOptionsTests
{
    [Fact]
    public void DatabaseOptions_EmptyConnectionString_FailsValidation()
    {
        var opts = new DatabaseOptions { ConnectionString = string.Empty };
        var ctx = new ValidationContext(opts);
        var results = new List<ValidationResult>();

        var valid = Validator.TryValidateObject(opts, ctx, results, true);
        Assert.False(valid);
    }

    [Fact]
    public void DatabaseOptions_DefaultCommandTimeout_IsThirtySeconds()
    {
        var opts = new DatabaseOptions();
        Assert.Equal(30, opts.CommandTimeoutSeconds);
    }
}

// ---------------------------------------------------------------------------
// App.Factory – ServiceFactory
// ---------------------------------------------------------------------------

public class ServiceFactoryTests
{
    [Fact]
    public void Constructor_NullServiceProvider_Throws()
    {
        Assert.Throws<ArgumentNullException>(() => new ServiceFactory(null!));
    }

    [Fact]
    public void CreateAiProvider_ResolvesRegisteredInstance()
    {
        var aiProvider = Mock.Of<IAiProvider>();
        var services = new ServiceCollection();
        services.AddSingleton(aiProvider);
        services.AddSingleton<IConversationRepository>(Mock.Of<IConversationRepository>());
        services.AddSingleton<IDatabaseProvider>(Mock.Of<IDatabaseProvider>());

        var factory = new ServiceFactory(services.BuildServiceProvider());
        var resolved = factory.CreateAiProvider();

        Assert.Same(aiProvider, resolved);
    }
}

// ---------------------------------------------------------------------------
// Service.Providers – SqliteDatabaseProvider
// ---------------------------------------------------------------------------

public class SqliteDatabaseProviderTests
{
    private static SqliteDatabaseProvider Build(string cs = "Data Source=:memory:")
    {
        var opts = Options.Create(new DatabaseOptions { ConnectionString = cs });
        return new SqliteDatabaseProvider(opts, NullLogger<SqliteDatabaseProvider>.Instance);
    }

    [Fact]
    public void IsConnected_BeforeConnect_IsFalse()
    {
        var provider = Build();
        Assert.False(provider.IsConnected);
    }

    [Fact]
    public async Task ConnectAsync_SetsIsConnectedTrue()
    {
        var provider = Build();
        await provider.ConnectAsync();
        Assert.True(provider.IsConnected);
    }

    [Fact]
    public async Task ConnectAsync_CalledTwice_DoesNotThrow()
    {
        var provider = Build();
        await provider.ConnectAsync();
        await provider.ConnectAsync();
        Assert.True(provider.IsConnected);
    }

    [Fact]
    public async Task DisposeAsync_AfterConnect_ResetsConnection()
    {
        var provider = Build();
        await provider.ConnectAsync();
        await provider.DisposeAsync();
        Assert.False(provider.IsConnected);
    }
}

// ---------------------------------------------------------------------------
// Service.Providers – SemanticKernelAiProvider
// ---------------------------------------------------------------------------

public class SemanticKernelAiProviderTests
{
    private static SemanticKernelAiProvider Build(string modelId = "gpt-4o")
    {
        var opts = Options.Create(new AiOptions { ModelId = modelId });
        return new SemanticKernelAiProvider(opts, NullLogger<SemanticKernelAiProvider>.Instance);
    }

    [Fact]
    public async Task GetCompletionAsync_ValidPrompt_ReturnsNonEmptyString()
    {
        var provider = Build();
        var result = await provider.GetCompletionAsync("Tell me a joke");
        Assert.False(string.IsNullOrWhiteSpace(result));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task GetCompletionAsync_BlankPrompt_Throws(string? prompt)
    {
        var provider = Build();
        await Assert.ThrowsAnyAsync<ArgumentException>(
            () => provider.GetCompletionAsync(prompt!));
    }
}

// ---------------------------------------------------------------------------
// Service.Repositories – ConversationRepository
// ---------------------------------------------------------------------------

public class ConversationRepositoryTests
{
    private static ConversationRepository BuildRepo(IDatabaseProvider? db = null)
    {
        db ??= Mock.Of<IDatabaseProvider>(p => p.IsConnected == true);
        return new ConversationRepository(db, NullLogger<ConversationRepository>.Instance);
    }

    [Fact]
    public async Task AddAsync_NullConversation_Throws()
    {
        var repo = BuildRepo();
        await Assert.ThrowsAsync<ArgumentNullException>(() => repo.AddAsync(null!));
    }

    [Fact]
    public async Task AddAsync_Valid_IncreasesCount()
    {
        var repo = BuildRepo();
        await repo.AddAsync(new Conversation { Prompt = "P", Reply = "R" });
        var all = await repo.GetAllAsync();
        Assert.Single(all);
    }

    [Fact]
    public async Task GetByIdAsync_ExistingId_ReturnsConversation()
    {
        var repo = BuildRepo();
        var conv = new Conversation { Prompt = "P", Reply = "R" };
        await repo.AddAsync(conv);

        var found = await repo.GetByIdAsync(conv.Id);
        Assert.NotNull(found);
        Assert.Equal(conv.Id, found!.Id);
    }

    [Fact]
    public async Task GetByIdAsync_NonExistingId_ReturnsNull()
    {
        var repo = BuildRepo();
        var found = await repo.GetByIdAsync(Guid.NewGuid());
        Assert.Null(found);
    }

    [Fact]
    public async Task GetAllAsync_MultipleItems_OrderedByCreatedAtDescending()
    {
        var repo = BuildRepo();
        var older = new Conversation { Prompt = "P1", Reply = "R1" };
        await Task.Delay(5);
        var newer = new Conversation { Prompt = "P2", Reply = "R2" };

        await repo.AddAsync(older);
        await repo.AddAsync(newer);

        var all = await repo.GetAllAsync();
        Assert.Equal(newer.Id, all[0].Id);
    }
}

// ---------------------------------------------------------------------------
// Resources – LogMessages / ErrorMessages (Resource Pattern)
// ---------------------------------------------------------------------------

public class ResourceTests
{
    [Fact]
    public void LogMessages_AllProperties_ReturnNonEmptyStrings()
    {
        Assert.False(string.IsNullOrWhiteSpace(LogMessages.SendingPrompt));
        Assert.False(string.IsNullOrWhiteSpace(LogMessages.ConversationSaved));
        Assert.False(string.IsNullOrWhiteSpace(LogMessages.InvokingAiModel));
        Assert.False(string.IsNullOrWhiteSpace(LogMessages.ConnectingToDatabase));
        Assert.False(string.IsNullOrWhiteSpace(LogMessages.ApplicationStarting));
        Assert.False(string.IsNullOrWhiteSpace(LogMessages.ApplicationStopping));
    }

    [Fact]
    public void ErrorMessages_AllProperties_ReturnNonEmptyStrings()
    {
        Assert.False(string.IsNullOrWhiteSpace(ErrorMessages.PromptRequired));
        Assert.False(string.IsNullOrWhiteSpace(ErrorMessages.AiProviderFailure));
        Assert.False(string.IsNullOrWhiteSpace(ErrorMessages.DatabaseConnectionFailure));
        Assert.False(string.IsNullOrWhiteSpace(ErrorMessages.InvalidConfiguration));
        Assert.False(string.IsNullOrWhiteSpace(ErrorMessages.UnexpectedError));
    }
}
