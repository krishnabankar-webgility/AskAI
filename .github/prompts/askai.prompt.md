# AskAI — prompt routing (GitHub Copilot / VS Code)

Use this prompt when the user wants **orchestration** across Jira, Git, DB, Bitbucket, or Slack, or when the request does not name a single specialist.

**Load first**

1. `.cursor/agent-skill-bindings.md`
2. `.cursor/skill-library/askai-ephemeral-output.md`
3. `.cursor/skill-library/askai-skill-evolution.md`
4. All domain skills listed in `.cursor/agents/askai.md` **or** narrow to one domain per specialist agent.

**Invoke specialists**

- Jira → `jira-automation.prompt.md` or jira-automation agent  
- Git → `git-automation.prompt.md`  
- DB → `db-automation.prompt.md`  
- Bitbucket → `bitbucket-automation` agent  
- Slack → `slack-automation` agent  
- Doc/skill fixes only → `agent-learning` agent  

**Master agent files:** `.cursor/agents/askai.md`, `.github/copilot/agents/askai.agent.md`, `.github/agents/AskAI.agent.md`.
