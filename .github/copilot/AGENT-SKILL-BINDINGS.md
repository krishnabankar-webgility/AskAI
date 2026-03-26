# GitHub Copilot Agents → Skills Map

This directory contains **GitHub Copilot custom agents** and their associated **skills**. Unlike Cursor, GitHub Copilot uses a different mechanism for agent discovery, but the same logical structure applies here.

## Agent Structure

```
.github/copilot/
├── agents/
│   ├── db-automation.agent.md
│   ├── git-automation.agent.md
│   ├── jira-automation.agent.md
│   ├── slack-automation.agent.md
│   └── [other agents].agent.md
├── skills/
│   ├── db-automation/
│   │   ├── db-restore.md
│   │   └── [other db skills].md
│   ├── git-automation/
│   │   └── git-sync.md
│   ├── jira-automation/
│   │   ├── jira-story-workflow.md
│   │   ├── jira-worklogs.md
│   │   ├── jira-sprint-lifecycle.md
│   │   └── jira-create-ud-issue.md
│   ├── slack-automation/
│   │   └── slack-integration.md
│   └── [other agent folders]/
└── AGENT-SKILL-BINDINGS.md (this file)
```

## Agent → Skills Map

| Agent (`.agent.md`) | Skills Folder | Skill Files | Purpose |
|--|--|--|--|
| `db-automation` | `skills/db-automation/` | `db-restore.md` | SQL Server database restore, DDL/DML operations |
| `git-automation` | `skills/git-automation/` | `git-sync.md` | Git commit/push/merge and branch sync (e.g. `develop` with `master`) |
| `jira-automation` | `skills/jira-automation/` | `jira-story-workflow.md`, `jira-worklogs.md`, `jira-sprint-lifecycle.md`, `jira-create-ud-issue.md` | Jira workflow automation: story creation, subtasks, worklogs, sprint lifecycle |
| `slack-automation` | `skills/slack-automation/` | `slack-integration.md` | Slack workspace automation: send messages, read channels, list users, post notifications |

## How It Works with GitHub Copilot

1. **Agent files** (`.agent.md`) are **custom Copilot agents** that appear in GitHub Copilot chat when enabled.
2. **Skills** (in subfolders) are **instruction documents** that agents read as mandatory context before responding.
3. When you invoke a Copilot agent, it automatically loads all skills from its corresponding folder.
4. Skills are **not shared globally** — each agent has its own skill set to avoid context bloat.

## Adding a New Agent + Skills

1. **Create the agent file:**  
   `.github/copilot/agents/my-new-agent.agent.md`

2. **Create a skills folder:**  
   `.github/copilot/skills/my-new-agent/`

3. **Add skill files to the folder:**  
   `.github/copilot/skills/my-new-agent/skill1.md`  
   `.github/copilot/skills/my-new-agent/skill2.md`

4. **In the agent file**, reference the skills:
   ```markdown
   ## Mandatory First Step
   Before responding, read all of the following skill files in order:
   1. `.github/copilot/skills/my-new-agent/skill1.md`
   2. `.github/copilot/skills/my-new-agent/skill2.md`
   ```

5. **Update this file** to reflect the new agent and skills.

## Differences from Cursor

| Aspect | Cursor (`.cursor/`) | GitHub Copilot (`.github/copilot/`) |
|--|--|--|
| **Agent files** | `.cursor/agents/*.md` | `.github/copilot/agents/*.agent.md` |
| **Skills storage** | `.cursor/skill-library/*.md` | `.github/copilot/skills/<agent-name>/*.md` |
| **Discovery** | Cursor detects `.md` files | Copilot detects `.agent.md` files |
| **Skill format** | Plain `.md` | Plain `.md` (same content, different path) |
| **Global skills** | `.cursor/skills/<name>/SKILL.md` | Not used in Copilot (use agent-specific skills instead) |

## Best Practices

- **Keep skills focused:** One skill per `.md` file.
- **Use relative paths:** Always reference skills from the agent file using relative paths (`.github/copilot/skills/...`).
- **Avoid duplication:** Do not copy the same skill into multiple agent folders; instead, reference it from a shared location if needed.
- **Document in this file:** Update the table above when adding new agents or skills.
- **Use agent names in folder names:** `skills/my-agent/` for agent `my-agent`.

## Notes

- These agents are **GitHub Copilot custom agents** and will work in VS Code with the Copilot extension.
- To use them, ensure your workspace is open in VS Code and Copilot is enabled.
- All references to "Cursor" in original skill files have been replaced with "Copilot".
