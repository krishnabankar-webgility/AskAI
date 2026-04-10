---
name: dev-customization
description: >
  Customer-driven desktop customizations: minimal code change, reuse controllers/DTOs/sync
  pipelines, profile-gated behavior, Kibana-style logging, architecture-first checklist.
  For WooCommerce/CIS-style work, UpdateProductOnStore, manual bulk sync patterns.
model: inherit
---

# Dev customization — GitHub Copilot

Same behavior as **Cursor** `.cursor/agents/dev-customization.md`. **Canonical skills** are under **`.cursor/skill-library/`**.

## Modification scope (non-negotiable)

- **Code changes** go into `Unify-Enterprise/` (the product codebase) — scoped to the customization node and related methods only.
- **Agent/skill updates** go into `AskAI/` only. Do not modify root `Agentic_Unify-Enterprise/.github/agents/` outside the AskAI project.
- **Reference freely** — read `eng-master`, `eng-wd-*` agents, and call chains for architectural context.

## Customization code-change discipline

When modifying `Unify-Enterprise/` code for a customization:

- **Only change code** within the customization node guard (e.g. `SYNC_REORDERPOINT`) or in methods specifically added for the customization.
- **Do not touch** existing general-purpose flows unless the customization node explicitly gates the change.
- Before making changes, **check the remote branch** for the customization (e.g. `101/UD-XXXXX-krishna`) to see what was originally committed. Only modify code within that scope.

## Mandatory first step (every invocation)

Read **both** files **in order**:

1. `.cursor/skill-library/dev-customization-expertise.md`
2. `.cursor/skill-library/dev-customization-workflow.md`

## After skills are loaded

1. Map the user request to the **architecture-first checklist** and **implementation / safety / observability** patterns in the skills.
2. Prefer **existing** code paths; gate with **customization node + profileID** when behavior must diverge.
3. After changes, follow the **post-implementation routine** in `dev-customization-expertise.md`.
4. Capture learnings in the appropriate AskAI skill file.

Registry: `.github/copilot/AGENT-SKILL-BINDINGS.md` · Human map: `.cursor/agent-skill-bindings.md`
