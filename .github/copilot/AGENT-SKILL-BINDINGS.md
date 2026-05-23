# GitHub Copilot Agents → Skills Map

**Canonical skills** live in **`.cursor/skill-library/*.skill.md`**. Copilot `.agent.md` files reference those paths so **Cursor, VS Code Copilot, and GitHub stay aligned**.

**Identification:** agents **`<name>.agent.md`**, skills **`<name>.skill.md`**, optional prompts **`<name>.prompt.md`**, Cursor rules load **`.mdc`** with a paired **`<name>.rule.md`** stub for humans (see `.cursor/rules/`).

## Layout

```
.cursor/
├── agents/              # Cursor subagents (*.agent.md — e.g. KrishnaAiGen.agent.md)
├── skill-library/       # CANONICAL skills (*.skill.md)
.github/
├── agents/
│   ├── KrishnaAiGen.agent.md          # VS Code picker — master (synced from copilot/agents)
│   ├── KrishnaAIGen-autonomous.agent.md  # VS Code — autonomous tooling variant
│   └── …                              # other AskAI specialists (synced from copilot/agents)
├── copilot/
│   ├── agents/*.agent.md              # GitHub Copilot agents (mirror Cursor names)
│   └── skills/                        # Legacy — prefer .cursor/skill-library
├── prompts/
│   └── *.prompt.md                    # optional routing prompts
```

## Agent → Skills

| Agent (`.agent.md`) | Canonical skills (`.cursor/skill-library/`) |
|---------------------|-----------------------------------------------|
| `KrishnaAiGen` | Bindings + meta skills always; domain packs loaded **via routing** (see master agent §B). Optional full sweep lists `jira-workflow.skill.md`, `git-sync.skill.md`, `db-restore.skill.md`, `bitbucket-unify-enterprise.skill.md`, `slack-integration.skill.md`, `dev-customization-expertise.skill.md`, `dev-customization-workflow.skill.md`, `confluence-workflow.skill.md`, `daily-work-update.skill.md`, `wd-es-kibana.skill.md`. |
| `agent-learning` | `krishnaaigen-skill-evolution.skill.md` + files being edited |
| `jira-automation` | `jira-workflow.skill.md` (§1.6c, §3.1.1, §3.7–§3.8, §7) |
| `git-automation` | `git-sync.skill.md` |
| `db-automation` | `db-restore.skill.md` |
| `bitbucket-automation` | `git-sync.skill.md`, `bitbucket-unify-enterprise.skill.md` |
| `slack-automation` | `slack-integration.skill.md` |
| `dev-customization` | `dev-customization-expertise.skill.md`, `dev-customization-workflow.skill.md` |
| `confluence-automation` | `confluence-workflow.skill.md` |
| `daily-work-update` | `daily-work-update.skill.md`, `slack-integration.skill.md`, `jira-workflow.skill.md` (§3, §7, §7.6 only), `bitbucket-unify-enterprise.skill.md`, `git-sync.skill.md`, `krishnaaigen-ephemeral-output.skill.md` |
| `sys-troubleshoot` | `vpn-smb-access.skill.md`, `network-profile-fix.skill.md`, `sys-cleanup-optimization.skill.md` |
| `wd-es-kibana` | `wd-es-kibana.skill.md`, `slack-integration.skill.md` (Slack MCP fallback only) |
| `wd-jenkins-build` | `wd-jenkins-build.skill.md`, `vpn-smb-access.skill.md` (if network share fails), `slack-integration.skill.md` (Slack posting) |

## Deprecated

The folder **`.github/copilot/skills/jira-automation/`** (split Jira docs) is **deprecated** in favor of **`.cursor/skill-library/jira-workflow.skill.md`**. Update automation in one place only.

## Parity rule

When you add, remove, or rename an agent or skill:

1. Update `.cursor/agent-skill-bindings.md` and this file.
2. Update `.cursor/agents/*.agent.md` and `.github/copilot/agents/*.agent.md` together; sync `.github/agents/*.agent.md` for VS Code.
3. Update `AGENTS.md` (AskAI section) if user-facing commands change.

## Differences from older Copilot layout

| Aspect | Current practice |
|--------|------------------|
| Skills | **`.cursor/skill-library/*.skill.md`** only |
| Copilot `.agent.md` | Thin wrapper + mandatory read list pointing at `.cursor/...` |
| `.github/copilot/skills/` | Legacy; do not duplicate new workflows there |
