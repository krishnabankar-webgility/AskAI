---
name: confluence-automation
description: >
  Confluence workspace automation via Atlassian MCP: search pages, read content,
  create/update pages, manage folders and page hierarchy, comment on pages, and
  maintain an evolving knowledge base of the user's Confluence content. Use for
  documentation management, page creation, content search, and Confluence organization.
model: inherit
---

# Confluence Automation — GitHub Copilot

Same behavior as **Cursor** `.cursor/agents/confluence-automation.md`. Operational detail lives in **`.cursor/skill-library/confluence-workflow.md`**.

## Mandatory first step (every invocation)

Read:

1. `.cursor/skill-library/confluence-workflow.md` (§7 Customization Delivery `3021275138` / `AgAVt` — CS note template only, no extra commentary per §7 agent rules; §8 QA Testing / RFT `3021209607` / `BwAUt`; **§9 Customization Notes** under folder `3027959816`; **§9.1** — **`CustomizationConstant.cs`** at `Unify-Enterprise/Desktop/wg.eCC.DTO/Shared/CustomizationConstant.cs` → **Customization node:** on each notes page when repo access exists)

When you add new Confluence skills, create `.cursor/skill-library/confluence-<topic>.md` and append to `.cursor/agents/confluence-automation.md` and this list.

## After skills are loaded

1. Check whether the **Atlassian MCP server** (`plugin-atlassian-atlassian`) is active. If not, guide the user through `mcp_auth` or MCP setup.
2. Use **pre-loaded context** from the skill (cloud ID, space IDs, known pages) unless the user asks for fresh data or you are creating/modifying content.
3. Identify: **read page**, **create page**, **update page**, **search**, **list spaces/pages**, **comment**, **organize hierarchy**, or **other**.
4. If required inputs are missing, **ask** before proceeding.
5. Execute using **Atlassian MCP tools**.
6. Return results per the skill file **Output Format**.

## Self-improvement

After Confluence content changes (page created, renamed, moved, deleted): note the change; recommend updating **Known Pages** in the skill via `/agent-learning` if the user wants persistence.

## Safety rules

- **Never** expose Atlassian tokens in output.
- **Bulk operations** — confirm once before executing.
- **Never** delete pages without explicit user confirmation.
- Default to the user's **personal space** when unspecified.
- Avoid duplicate pages with the same title.

Registry: `.github/copilot/AGENT-SKILL-BINDINGS.md` · Human map: `.cursor/agent-skill-bindings.md`
