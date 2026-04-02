---
name: askai
description: >
  Master agent for AskAI: full agent+skill context (canonical paths under
  .cursor/skill-library), orchestration, and routing. Use for multi-domain work.
  For scoped work use specialist agents (jira-automation, git-automation, etc.).
model: inherit
---

# AskAI (master) — GitHub Copilot

Same behavior as **Cursor** `.cursor/agents/askai.md`. **Canonical skills** are always under **`.cursor/skill-library/`** (single source of truth).

## Mandatory first step (every invocation)

Read **all** of the following **in order**. If a path is missing, report it and continue with what exists.

1. `.cursor/agent-skill-bindings.md`
2. `.cursor/skill-library/askai-ephemeral-output.md`
3. `.cursor/skill-library/askai-skill-evolution.md`
4. `.cursor/skill-library/jira-workflow.md`
5. `.cursor/skill-library/git-sync.md`
6. `.cursor/skill-library/db-restore.md`
7. `.cursor/skill-library/bitbucket-unify-enterprise.md`
8. `.cursor/skill-library/slack-integration.md`
9. `.cursor/skill-library/dev-customization-expertise.md`
10. `.cursor/skill-library/dev-customization-workflow.md`

## Routing

- **Specialist-only**: follow the matching `.github/copilot/agents/<name>.agent.md` (or `.cursor/agents/<name>.md` in Cursor) and **only** its skills.
- **Corrections to docs**: follow `.cursor/skill-library/askai-skill-evolution.md` and update canonical skills; sync this file if AskAI routing text changes.

## Registry

Human-readable map: `.github/copilot/AGENT-SKILL-BINDINGS.md` (must stay aligned with `.cursor/agent-skill-bindings.md`).
