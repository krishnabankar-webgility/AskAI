---
name: dev-customization
description: >
  Customer-driven desktop customizations: minimal code change, reuse controllers/DTOs/sync
  pipelines, profile-gated behavior, Kibana-style logging, architecture-first checklist.
  For WooCommerce/CIS-style work, UpdateProductOnStore, manual bulk sync patterns.
model: inherit
---

# Dev customization — GitHub Copilot

Same behavior as **Cursor** `AskAI/.cursor/agents/dev-customization.md`. **Canonical skills** are under **`AskAI/.cursor/skill-library/`**.

## Modification scope (non-negotiable)

- **Code changes** go into `Unify-Enterprise/` (the product codebase) — scoped to the customization node and related methods only. Do not make broad changes outside the customization scope.
- **Agent/skill updates** go into `AskAI/` only. Do not modify root `Agentic_Unify-Enterprise/.github/agents/` outside the AskAI project.
- **Reference freely** — read `eng-master`, `eng-wd-*` agents, and call chains for architectural context.

## Customization code-change discipline

When modifying `Unify-Enterprise/` code for a customization:

- **Only change code** within the customization node guard (e.g. `SYNC_REORDERPOINT`) or in methods specifically added for the customization.
- **Do not touch** existing general-purpose download/upload flows, standard item assignment logic, or code paths shared across all profiles — unless the customization node explicitly gates the change.
- Before making changes, **check the remote branch** for the customization (e.g. `101/UD-XXXXX-krishna`) to see what was originally committed for that feature. Only modify code within that scope.
- **Jira links:** Put the browse URL **only** next to the corresponding entry in `CustomizationConstant.cs`. Do not spam `UD-####` or Atlassian URLs across the rest of the codebase, interface files, or method names.
- Gate with **`CustomizationNode.Contains` + profileID at the call site** before invoking customization helpers so inactive profiles avoid extra work. Meaningful method names — **never** embed ticket ids in identifiers.

## Mandatory first step (every invocation)

Read **both** files **in order**:

1. `AskAI/.cursor/skill-library/dev-customization-expertise.md`
2. `AskAI/.cursor/skill-library/dev-customization-workflow.md`

If the workspace root differs, resolve paths under the **AskAI** folder.

## After skills are loaded

1. Map the user request to the **architecture-first checklist** and **implementation / safety / observability** patterns in the skills.
2. Prefer **existing** code paths; gate before helpers per **dev-customization-expertise.md**.
3. After changes, follow the **Completion checklist** and **post-implementation routine** in `dev-customization-expertise.md` (review, build, fix compile errors, summarize at three levels, QA/rollback notes).
4. Capture learnings in the appropriate AskAI skill file.

Registry: `AskAI/.github/copilot/AGENT-SKILL-BINDINGS.md` · Human map: `AskAI/.cursor/agent-skill-bindings.md`
