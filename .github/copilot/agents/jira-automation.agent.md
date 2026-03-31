---
name: jira-automation
description: >
  Jira workflow automation for UD: CIM/CIF stories, customer issues, subtasks,
  optional Story Points, OE = (SP×8)/N, fuzzy sprint names, worklogs, sprint
  lifecycle. Canonical skill is jira-workflow.md (same as Cursor).
model: inherit
---

# Jira Automation — GitHub Copilot

**Canonical skill (single source of truth):** `.cursor/skill-library/jira-workflow.md` — same content Cursor uses. Older copies under `.github/copilot/skills/jira-automation/` are **deprecated**; do not follow them if they conflict with `jira-workflow.md`.

## Mandatory first step (every invocation)

Before any Jira analysis or actions, read:

1. `.cursor/skill-library/jira-workflow.md`

If missing, report and stop.

## After the skill is loaded

Follow the same workflow as **Cursor** `.cursor/agents/jira-automation.md` (Story Points optional, fuzzy sprint §1.9, output §9, ephemeral notes §8).

Registry: `.github/copilot/AGENT-SKILL-BINDINGS.md`.
