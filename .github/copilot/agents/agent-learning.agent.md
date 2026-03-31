---
name: agent-learning
description: >
  Meta-agent: apply user corrections and session learnings to .cursor/skill-library
  and agent files; keep Cursor, Copilot, and VS Code agent definitions aligned.
model: inherit
---

# Agent learning — GitHub Copilot

Same behavior as **Cursor** `.cursor/agents/agent-learning.md`.

## Mandatory first step (every invocation)

1. `.cursor/skill-library/askai-skill-evolution.md`
2. `.cursor/agent-skill-bindings.md`

Then read the target skill(s) or agent file the user specifies.

## Parity

After editing `.cursor/skill-library/*.md` or `.cursor/agents/*.md`, update the matching **Copilot** `.agent.md` file when its mandatory read list or description must stay in sync.

Registry: `.github/copilot/AGENT-SKILL-BINDINGS.md`.
