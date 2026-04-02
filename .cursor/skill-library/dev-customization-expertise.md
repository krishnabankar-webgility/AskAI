# Customization implementation — expertise and rules

Use with **`dev-customization-workflow.md`** for customer-specific customization work in this codebase.

## Purpose

- Implement customer-driven customizations with **minimum code changes**.
- **Reuse** existing architecture paths first (controllers, DTOs, API contracts, sync pipelines).
- Prefer **profile-level feature flags** so default behavior stays unchanged.

## Working style

- Read requirements **end-to-end** first; then map to architecture before coding.
- **Reorder tasks** when it reduces risk and dependency conflicts.
- Keep changes **isolated and explicit** for easier review and rollback.
- Use **existing methods and flows** before adding new ones.

## Must-follow rules

- **Non-impact first:** Wrap risky behavior in customization nodes + `profileID`.
- **Reuse first:** Prefer existing APIs, sync methods, mapping logic, and data models.
- **Small-change strategy:** If small edits are enough, avoid new abstractions.
- **Separate methods for larger changes:** Add helper methods when logic grows.
- **No scheduler changes** unless the user **explicitly** requests them.

## Logging and error handling

- Add **Kibana-style** logs for each customization flow:
  - **Info:** start/end summary, item counts, profile id.
  - **Debug:** intermediate branch decisions and filters.
  - **Exception / Error:** API failures, parsing failures, unexpected nulls.
- Keep exception boundaries clear and user-facing messages **actionable**.

## Architecture-first checklist

1. Identify current **data source** and **persistence** path.
2. Confirm where existing **sync payload** is created and transformed.
3. Reuse current **mapping/matching filters** used by existing sync.
4. Inject customization logic at the **narrowest safe** points.
5. Verify **old sync types** and existing behaviors remain **unchanged**.

## Prompt understanding

- The user may give tasks **out of sequence**; infer technical order from architecture.
- The user typically expects:
  - minimal code change,
  - high-confidence **non-impact** behavior,
  - explicit **high / mid / low-level** explanation after implementation.
- If wording is ambiguous, align implementation with the **latest clarified** instruction.

## Post-implementation routine

1. Run **lints / build / tests** relevant to changed modules.
2. Summarize implementation at:
   - **High level** — overall flow,
   - **Mid level** — components/files changed,
   - **Low level** — payload fields, flags, mapping rules, edge-case handling.
3. Provide **QA/UAT** pointers and **rollback-safe** notes.

## Domain-specific memory (UD-31982–style customizations)

- WooCommerce profile using **CIS flow**, not legacy cart flow.
- Sync trigger is **manual bulk action** from **Inventory → All Products**.
- Reuse **`UpdateProductOnStore`** contract for extension syncs.
- Prefer deriving request items from **existing mapped/matched** logic.
- Keep changes **profile gated** and **backward compatible**.
