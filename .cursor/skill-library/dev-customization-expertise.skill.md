# Customization Implementation — Expertise and Rules

Use with **`dev-customization-workflow.skill.md`** for customer-specific customization work in this codebase.

## Purpose

- Implement customer-driven customizations with **minimum code changes**.
- **Reuse** existing architecture paths first (controllers, DTOs, API contracts, sync pipelines).
- Prefer **profile-level feature flags** so default behavior stays unchanged.

## Trigger conditions

Activate this agent when:
- A Jira ticket has type **CIM** (Customization), **FR** (Feature Request), or **CFC** (Feasibility Check)
- The user says "start implementation", "implement this", "check feasibility", "analyze FR"
- The user mentions `CustomizationConstant.cs`, customization nodes, or requests code analysis / unit tests / branch push for any dev task

## Jira and traceability in code (strict)

- **One place for the Jira link per customization node:** `Unify-Enterprise/.../wg.eCC.DTO/Shared/CustomizationConstant.cs` — place the `// https://webgility.atlassian.net/browse/UD-…` (or short product note) **immediately above the const** for that node only.
- **Do not** scatter the same Jira URL, story id, or `UD-####` in method names, regions, inline comments across production files, or interface declarations. Use **neutral, meaningful** comments when behavior needs explanation.

## Ticket type → node definition rule

| Ticket Type | Node Definition Rule | Example |
|-------------|---------------------|---------|
| **CIM / Customization** | Define node **with `_` at the end** — Profile ID specific | `SYNC_CUSTOM_SHIPTIME_` |
| **FR / Feature Request** | Define node **without `_` at the end** — all profiles | `ENABLE_PROFITABILITY_ZIPCODE` |
| **CFC / Feasibility Check** | Analysis only — no node created until converted to CIM/FR | N/A |

## Naming and structure

- **Method and type names must be meaningful** (domain language: profile, QB transaction, posting, sync). **Never** embed ticket ids (`UD-32081`, etc.) in identifiers.
- **Gate at the call site:** `if (CommonUtility.CustomizationNode.Contains(CustomizationConstant.<NODE> + profileId)) { … }` **before** calling customization helpers so idle profiles never pay for parsing or helper entry. Helpers should assume the caller gated **or** document that they are only for customization paths — **do not** hide the only `CustomizationNode.Contains` check inside a helper that is invoked unconditionally from hot paths.
- **Small vs large changes:** A few lines in an existing method → wrap in the customization `if` inline. Larger logic → **new private/static helper** in the appropriate layer (e.g. `CommonUtility`, controller, DAL) and **call only under the guard**.
- **`IOrder` / interface surfaces:** Do **not** add block comments or Jira URLs on interface method declarations; document on the implementation if needed.

## Node naming patterns

| Prefix | Typical Use |
|--------|------------|
| `SYNC_CUSTOM_` | Custom field sync customizations (CIM) |
| `ENABLE_` | Feature toggles (FR) |
| `DOWNLOAD_` | Data download customizations |
| `EXPORT_` | Report or data export customizations |
| `POST_` | Transaction posting customizations |
| `AMAZON_` | Amazon platform-specific customizations |
| `SHOPIFY_` | Shopify platform-specific customizations |

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

### Kibana logging — mandatory code pattern

Every new method handling errors or exceptions **must** include Kibana log statements:

```csharp
// Error logging
KibanaLogger.LogError("MethodName", exception, profileId);

// Info / Trace logging (for key operations)
KibanaLogger.LogInfo("MethodName", "Operation description", profileId);
```

| Scenario | Log Level |
|----------|-----------|
| Exception caught in try/catch | Error |
| Validation failure | Warning |
| Key business operation start/end | Info |
| Unexpected null or empty value | Warning |

## Mandatory code structure pattern

### CIM — Profile-Specific Condition
```csharp
// Customization node condition — Profile ID specific
if (IsCustomizationEnabled(CustomizationConstant.NODE_NAME_, profileId))
{
    ApplyCustomFeatureName(params);
}

// New dedicated method — all business logic here
private void ApplyCustomFeatureName(params)
{
    try
    {
        // Business logic
    }
    catch (Exception ex)
    {
        KibanaLogger.LogError("ApplyCustomFeatureName", ex, profileId);
    }
}
```

### FR — All Profiles Condition
```csharp
// Feature request node condition — all profiles
if (IsFeatureEnabled(CustomizationConstant.FEATURE_NODE_NAME))
{
    ApplyFeatureName(params);
}

// New dedicated method — all business logic here
private void ApplyFeatureName(params)
{
    try
    {
        // Business logic
    }
    catch (Exception ex)
    {
        KibanaLogger.LogError("ApplyFeatureName", ex);
    }
}
```

### 🚫 Never Do This
```csharp
// BAD — Logic directly in existing flow without node condition
existingObject.Field = newValue;  // ← NEVER

// BAD — Business logic inline inside node condition block
if (IsCustomizationEnabled(...))
{
    // ← Don't put logic here directly
    var x = Calculate();
    obj.Field = x;
}
```

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

## Completion checklist (after implementation, bugfix, or story — follow in order)

1. **Self-review:** Syntax, null paths, duplication, unnecessary branches; prefer concise C# (including LINQ/lambdas **where they improve clarity**, not density for its own sake).
2. **Build:** Run the same clean/build the team uses for `Unify-Enterprise` (e.g. Visual Studio **Build Solution** or `dotnet build` / `MSBuild` on the appropriate `.sln`). Fix **all** compile errors introduced or exposed by the change.
3. **Lint / analyzers:** Address new warnings that indicate real issues; do not broaden scope to pre-existing noise unless asked.
4. **Unit tests:** Write tests covering the new node condition logic, all new methods, edge cases, and failure scenarios. Run and resolve all failures.
5. **Code review & optimization:** Remove unnecessary/unused/redundant code. Confirm Kibana log statements are in place for all error and exception paths.
6. **Git safety check:** Verify branch tracking before any push (see `dev-customization-workflow.skill.md`).
7. **Jira QA comment:** Add structured QA comment on the Jira ticket after push (see template below).
8. **Summarize** at high / mid / low level and note QA/rollback as in the post-implementation routine below.

## Pre-commit code review checklist

Before presenting code changes for review:

- [ ] New node defined in `CustomizationConstant.cs`
- [ ] Node naming follows CIM (`_`) or FR (no `_`) convention
- [ ] All new logic is behind a customization node condition
- [ ] Node condition block only calls a new method — no inline logic
- [ ] New method(s) created with single responsibility
- [ ] Kibana log statements added for all errors and exceptions
- [ ] No unnecessary, redundant, or debug code remains
- [ ] Build is clean — no errors or warnings
- [ ] Unit tests written and passing

## Post-implementation routine

1. Run **lints / build / tests** relevant to changed modules.
2. Summarize implementation at:
   - **High level** — overall flow,
   - **Mid level** — components/files changed,
   - **Low level** — payload fields, flags, mapping rules, edge-case handling.
3. Provide **QA/UAT** pointers and **rollback-safe** notes.

## Jira QA Comment template (mandatory after push)

After implementation is pushed to the remote branch, add a comment on the Jira ticket:

```
## ✅ Implementation Complete — QA & Unit Testing Notes

### 🔧 Customization Node(s) Used
- `NODE_NAME` — [What it does, CIM/FR type]

### 🧪 Unit Test Cases
| # | Test Case | Expected Result |
|---|-----------|----------------|
| 1 | [Description of test scenario] | [What should happen] |
| 2 | [Edge case or failure scenario] | [Expected handled result] |

### 📋 Impact Areas
- **Module(s):** [List affected modules]
- **Transaction Type(s):** [Sales Order / Invoice / Receipt / Report / etc.]
- **Flow(s):** [Order download / Transaction posting / Report generation / etc.]
- **File(s) Modified:** [List key files changed]

### ⚙️ QA Setup Notes
- **Profile ID(s) for Testing:** [Profile ID(s) where node is enabled]
- **apiConfig Node:** [Node name as configured in apiConfig]
- **DB Table(s) Affected:** [List any DB tables involved]
- **Pre-conditions:** [Any setup steps QA must perform before testing]

### 🔗 Remote Branch
`<branch-name>` — pushed and ready for QA.
```

## Golden Rules (always apply)

| Rule | Detail |
|------|--------|
| 🔍 Existing First | Always check `CustomizationConstant.cs` for existing nodes before any new implementation |
| 🔒 Node Always | Every new code change must be behind a customization node condition |
| 🧱 Modular Code | Node condition → new method call → business logic inside the method |
| 🏷️ CIM Node | Ends with `_` — Profile ID specific |
| 🏷️ FR Node | No `_` — applies to all profiles |
| 📋 Plan Before Code | Never start coding without an approved implementation plan |
| 🏗️ Build After Changes | Always rebuild and resolve failures before moving forward |
| 🧪 Test Before Push | Unit tests must pass before any commit or push |
| 📝 Kibana Logs | All errors and exceptions must have Kibana log statements |
| ✅ Confirm Before Push | Never commit or push without explicit user confirmation |
| 🔀 Git Safety | Always verify git status and remote origin before pushing |
| 🚫 No develop/master | Never push or merge into develop or master — ever |
| 💬 Jira Comment | Always add QA comment on Jira after push — final mandatory step |

## Domain-specific memory (UD-31982–style customizations)

- WooCommerce profile using **CIS flow**, not legacy cart flow.
- Sync trigger is **manual bulk action** from **Inventory → All Products**.
- Reuse **`UpdateProductOnStore`** contract for extension syncs.
- Prefer deriving request items from **existing mapped/matched** logic.
- Keep changes **profile gated** and **backward compatible**.

## Nullable-field discipline for QBD download DTOs

When customization flows introduce **nullable semantics** (e.g. "no value" vs "value is 0"), follow these rules:

- **DB schema is truth:** If the DB column is `nvarchar NULL` or `float NULL`, the DTO property should be nullable (`double?`, `string`). Do not silently convert absent values to `0`.
- **Download path:** In QuickBooksCommon.vb / QuickBooksCanada.vb / QuickBooksAustralia.vb, when a QBD SDK property (e.g. `ItemInventoryRet.ReorderPoint`) is `Nothing`, assign `Nothing` to the DTO — not `0`.
- **Assembly / BuildPoint:** `GetAssemblyBuildPoint` returns `Double?` — `Nothing` when BuildPoint is absent.
- **DAL save:** In `AccountingSoftwareDAL`, check `.HasValue` before saving; store `DBNull.Value` when null.
- **Consumers:** For NetSuite or other integrations that require non-nullable `double`, use `.GetValueOrDefault()`.
- **Sync exclusion:** When building sync payloads (e.g. `BuildReorderPointSyncItems`), skip items where the source value is `NULL` / `DBNull.Value` rather than sending a default.
- **Cross-file blast radius:** Changing a DTO field type (e.g. `double` → `double?`) requires auditing all consumers: VB factories, Canada/Australia helpers, NetSuite parsers, POS files, DAL insert+update paths.

## Reorder Point / Build Point sync (SYNC_REORDERPOINT_)

- **Customization node:** `SYNC_REORDERPOINT_{ProfileID}` — profile-gated, WooCommerce only.
- **Flow:** Button click → full QB item download → `GetQuickBooksItemsForReorderPoint` → `GetStoreItemsForReorderPoint` → `BuildReorderPointSyncItems` → `SynchronizeItems` via CIS.
- **CustomFields:** The `ServiceSynchronizeItemsDTO.CustomFields` property carries the ReorderPoint value to CIS, which maps it to WooCommerce's **Low stock threshold** field.
- **Key files:** `ctrlStoreProducts.cs`, `QuickBooksCommon.vb`, `InventoryController.cs`, `InventoryDAL.cs`, `AccountingSoftwareDAL.cs`, `QBItemDTO.cs`.
- **Three scenarios:**
  1. QBD has ReorderPoint/BuildPoint > 0 → syncs the value.
  2. QBD has no ReorderPoint/BuildPoint → DB stores `NULL` → item **excluded** from sync.
  3. QBD has ReorderPoint/BuildPoint = 0 → syncs `"0"` (clears the threshold on WooCommerce).
