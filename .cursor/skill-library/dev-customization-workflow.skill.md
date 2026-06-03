# Customization workflow skill

Use this skill for **customer-specific customization** tasks in this repository. Load **`dev-customization-expertise.md`** first for rules (including **Jira-in-code policy**, **call-site guards**, and **completion checklist**); this file focuses on **workflow order**.

## Decision order (follow top to bottom)

1. **Parse intent:** Must-haves (API, payload, UI, profile gate), implied constraints (minimal change, non-impact).
2. **Locate architecture:** Data source → transform → persistence; find the narrowest injection point.
3. **Choose gate:** `CustomizationConstant.<NODE>_` + `profileID`; confirm constant's Jira link exists only in `CustomizationConstant.cs` when adding a new node.
4. **Choose shape:** Few guarded lines inline vs named helper — see expertise **Naming and structure**.
5. **Implement** without touching unrelated profiles or shared flows.
6. **Verify:** Expertise **Completion checklist** (review → build → fix errors → summarize).

## Intent parsing

- Extract explicit **must-haves** (API, payload fields, UI location, profile gating).
- Detect implied constraints (**minimum change**, reuse existing flow, non-impact behavior).
- Confirm **manual vs scheduler** expectations from the latest user clarification.

## Git workflow safety (critical before coding)

**Root cause (UD-32682 + UD-32643 incidents):** When a branch is created from `develop` using `git checkout -b <branch> origin/develop`, git sets the upstream tracking to `origin/develop`. VS Code "Sync Changes" then pushes commits directly to `origin/develop`, bypassing PR review. Bitbucket auto-closes the PR as "MERGED" even though the Merge button was never clicked.

### Rule: always sync with the feature branch's own remote — never with `origin/develop`

**Prevention — immediately after every new feature branch push:**
```powershell
git push -u origin <current-branch-name>
```
The `-u` flag sets upstream to `origin/<current-branch-name>`. VS Code Sync will now target the feature branch, not develop.

**Detection — before every Sync, verify tracking:**
```powershell
git status
```
- ✅ `Your branch is ... 'origin/UD-XXXXX-feature'` — safe
- 🔴 `Your branch is ... 'origin/develop'` — **do NOT sync** — fix first

```powershell
# Also check with:
git branch -vv
# Expected: * UD-XXXXX-feature [origin/UD-XXXXX-feature] ...
# Danger:   * UD-XXXXX-feature [origin/develop] ...
```

**Auto-fix — if wrong upstream detected:**
```powershell
git branch --set-upstream-to=origin/UD-XXXXX-feature
```

**Agent behavior:**
- Always verify upstream tracking before any sync or push operation.
- If upstream is not `origin/<current-branch-name>` — auto-correct it before proceeding.
- Never sync a feature branch to `origin/develop` or any base branch.
- Apply `git push -u origin <branch>` immediately after every new feature branch push.

> ⚠️ **Rule of Thumb:** If VS Code shows outgoing changes on a feature branch and tracked upstream is `origin/develop` — **do not click Sync**. It will push directly to `develop`. Always verify first.

**After push:** Verify in Bitbucket that the PR shows your new commit(s) only on the feature branch — not on `develop`.

## Implementation pattern

- Add or extend **constants and enums** only when required by the existing flow.
- Wire **UI control visibility** to customization node + `profileID`.
- Keep **button / manual actions** in existing user control/controller paths.
- **Reuse** existing sync endpoint and **DTO contract**.
- Restrict request item list to **existing mapped/matched** item logic.

## Safety pattern

- **Preserve** original state values after temporary overrides.
- **Avoid global side effects** when setting sync mode or filters.
- Return **informative user messages** for empty-result sync operations.

## Observability pattern

- Log **start/end** with profile id and total records.
- Log **skip reasons** (no mapped/matched items, missing data).
- Log and **bubble exceptions** with context.

## Null vs zero discipline

When a customization syncs a **nullable field** from QBD to an online store:

1. **Distinguish absent from zero** at the download level — assign `Nothing` / `null` when the SDK property is absent.
2. **Persist null** through the DAL — use `DBNull.Value` or `NULL` in SQL, not `"0"`.
3. **Exclude null items** from the sync payload — do not send a default value; skip them entirely.
4. **Audit DTO type changes** across all consumers before committing — especially NetSuite, POS, Canada/Australia VB files, and DAL insert/update paths.
