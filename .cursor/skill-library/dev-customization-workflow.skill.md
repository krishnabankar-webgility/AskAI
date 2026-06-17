# Customization workflow skill

Use this skill for **customer-specific customization** tasks in this repository. Load **`dev-customization-expertise.skill.md`** first for rules (including **Jira-in-code policy**, **call-site guards**, **mandatory code patterns**, and **completion checklist**); this file focuses on **workflow order** and **step-by-step execution**.

## Step-based implementation workflow (follow in strict order)

---

### STEP 0 — Read the Jira Ticket

Before anything else, read the provided Jira ticket and extract:

| Field | What to Look For |
|-------|-----------------|
| **Ticket Type** | CIM / Customization, FR / Feature Request, CFC / Feasibility Check |
| **Customer / Profile ID** | Mentioned in description or linked account |
| **Request Summary** | What the customer needs — in one clear sentence |
| **Business Logic** | Rules, conditions, field mappings, expected behaviour |
| **Affected Area** | Which module, transaction type, report, or flow is impacted |
| **Attachments / Screenshots** | Any reference files, DB queries, sample data |

> Present your understanding of the ticket and **wait for confirmation before proceeding.**

---

### STEP 1 — Check for Existing Customization Node Solution

> This step is **mandatory** for all ticket types: CIM, FR, and CFC.

#### 1.1 — Locate All Customization Nodes
- Open `CustomizationConstant.cs` in the **unify-enterprise** workspace.
- This file is the **single source of truth** for all customization nodes.
- Do **not** look for nodes anywhere else.

#### 1.2 — Find a Matching Node or Combination
Evaluate whether the customer request can be fulfilled by:

| Scenario | Description |
|----------|-------------|
| **Single Node** | One existing node fully covers the requirement |
| **Combination of Nodes** | Two or more nodes together fulfill the requirement |
| **Nodes + Extra Handling** | Existing node(s) with minor additional changes cover the requirement |

#### 1.3 — Understand the Node's Workflow
For any candidate node found:
- Review its definition in `CustomizationConstant.cs`
- Find **all references** of that node across the codebase
- Understand its complete workflow and solution flow end-to-end

#### 1.4 — Present Findings
- Always suggest existing solutions **first**, before proposing new implementation.
- Clearly explain how the existing node(s) can address the customer request.
- If a combination is needed, explain how they work together and what extra handling is required.

> **Present findings and wait for confirmation.**
> Proceed to Step 2 **only** if no existing solution can fulfill the request.

---

### STEP 2 — Code Analysis & Implementation Plan

> Reached only if Step 1 confirms no existing solution is applicable.

#### 2.1 — Code Analysis
- Identify all files, classes, and methods relevant to the implementation area.
- Understand the existing code flow end-to-end before proposing any changes.
- Document integration points where new logic will be injected.

#### 2.2 — Define New Customization Node

| Ticket Type | Node Definition Rule |
|-------------|---------------------|
| **CIM / Customization** | Define node **with `_` at the end** — Profile ID specific |
| **FR / Feature Request** | Define node **without `_` at the end** — all profiles |

- Add the new node to `CustomizationConstant.cs`.
- Naming convention must clearly describe what the customization does.

#### 2.3 — Prepare Implementation Plan
Present a structured plan covering:

1. New customization node name, type, and location in `CustomizationConstant.cs`
2. All files to be modified
3. Where the customization node condition will be applied
4. New method(s) to be created and their responsibilities
5. Business logic breakdown — step by step
6. Any DB changes, queries, or schema updates required
7. All transaction types or flows in scope
8. Build targets affected by the changes

> **Present the plan. Do NOT begin coding until it is reviewed and approved.**
> Incorporate feedback and re-present if corrections are requested.

---

### STEP 3 — Implementation

Once the plan is approved, begin code changes following these rules:

#### ✅ Mandatory Implementation Rules

**For ALL changes — CIM and FR:**
- Every new code change **must** be gated behind a customization node condition.
- **Zero direct changes** to existing code flow without a node condition — no exceptions.
- Follow the **modular pattern** strictly:
  ```
  [Customization Node Condition]
      → Call new dedicated method
          → All business logic lives inside the new method
  ```

**For CIM (Customization — Profile-Specific):**
- Node condition must include **Profile ID check** using the `_` suffix convention.
- Logic applies only to the specified customer profile.

**For FR (Feature Request — All Profiles):**
- Node condition applies **without Profile ID** — available to all profiles.
- No `_` suffix in node value.

#### ✅ Code Quality Rules
- Write **modular code** — one method per responsibility.
- Never embed business logic directly inside a node condition block — always delegate to a new method.
- Add **Kibana log statements** for all errors and exceptions — mandatory.
- Remove any unnecessary, redundant, or debug code before presenting changes.

#### ⚠️ Constraints
- Work on **current local branch only.**
- **No commits. No pushes. No PRs at this stage.**
- Present all code changes for review after implementation.

---

### STEP 4 — Build & Resolve Failures

After implementation:

1. **Rebuild** all projects and files where new changes were added.
2. Review build output for any errors, warnings, or failures.
3. **Resolve all build failures** before proceeding.
4. Re-build after fixes to confirm a clean build.

> Do **not** proceed to Step 5 until the build is clean.

---

### STEP 5 — Unit Tests

Once the build is clean:

1. Write **unit test code** covering:
   - The new customization node condition logic
   - All new methods and business logic
   - Edge cases and failure scenarios
2. **Re-build** the project including test code.
3. **Run all unit test cases.**
4. Resolve any test failures — fix and re-run until all tests pass.

> Do **not** proceed to Step 6 until all unit tests pass.

---

### STEP 6 — Code Review, Optimization & Push

#### 6.1 — Code Review & Optimization
Before any commit or push:
- Review all code changes for quality and clarity.
- Remove any unnecessary, unused, or redundant code.
- Confirm Kibana log statements are in place for all error and exception paths.
- **Wait for explicit confirmation from the user before committing or pushing.**

#### 6.2 — Git Safety Check (Mandatory Before Push)
Before syncing or pushing:

1. Run `git status` — review all changed files.
2. Verify `HEAD` is pointing to the **correct current local branch.**
3. Check that the **remote origin matches the current local branch.**
   - If the current branch has **no remote tracking branch** → publish/push the branch to remote first and set remote origin to current branch.
   - If remote origin points to a **different branch** → fix it before proceeding.
4. Only after the above checks pass — commit and push changes.

> 🚫 **NEVER push or merge code into `develop` or `master` — under any circumstances.**
> 🚫 **Never push without explicit user confirmation.**

---

### STEP 7 — Jira QA Comment

Once implementation is pushed to the remote branch:

Add a comment on the related Jira ticket using the template in `dev-customization-expertise.skill.md` (Jira QA Comment template section).

> This comment is the final step. Do **not** skip it.

---

## Intent parsing

- Extract explicit **must-haves** (API, payload fields, UI location, profile gating).
- Detect implied constraints (**minimum change**, reuse existing flow, non-impact behavior).
- Confirm **manual vs scheduler** expectations from the latest user clarification.

## Node discovery process (Step 1 reference)

When evaluating existing customization nodes:

1. **Search by feature area** in `CustomizationConstant.cs` using keywords:
   - Feature name (e.g., `SHIPTIME`, `PROFITABILITY`, `ZIPCODE`)
   - Transaction type (e.g., `INVOICE`, `SALESORDER`, `RECEIPT`)
   - Data source (e.g., `AMAZON`, `SHOPIFY`, `MAGENTO`)
   - Action type (e.g., `SYNC`, `DOWNLOAD`, `EXPORT`, `REPORT`)

2. **Review node definition** — read name, value, inline comments, note CIM vs FR type.

3. **Trace all references** — find every usage across the codebase, map where the node condition is checked, follow the code path end-to-end.

4. **Evaluate fit:**

| Evaluation | Question to Ask |
|-----------|----------------|
| Full match | Does this node alone fulfill the entire request? |
| Partial match | Does it cover most of the request with minor gaps? |
| Combination | Do two or more nodes together fulfill the request? |
| Nodes + handling | Do existing nodes plus small extra changes fulfill the request? |
| No match | No existing node is relevant — proceed to Step 2 |

### Presenting findings format

```
## Existing Node Analysis — [JIRA-ID]

### Candidate Node(s) Found:
- `NODE_NAME` — [Brief description of what it does]

### How It Addresses the Request:
[Explain clearly how the existing node(s) can fulfill the customer requirement]

### What Is Still Needed (if any):
[List any gaps — extra handling, minor changes, or config adjustments]

### Recommendation:
- [ ] Existing node(s) fully cover the request — no new implementation needed
- [ ] Existing node(s) + minor changes can cover the request
- [ ] No existing solution — proceed to new implementation (Step 2)
```

## Git workflow safety (critical before coding)

**Root cause (UD-32682 + UD-32643 incidents):** When a branch is created from `develop` using `git checkout -b <branch> origin/develop`, git sets the upstream tracking to `origin/develop`. VS Code "Sync Changes" then pushes commits directly to `origin/develop`, bypassing PR review. Bitbucket auto-closes the PR as "MERGED" even though the Merge button was never clicked.

### ⚠️ Critical Rules (Non-Negotiable)

- 🚫 **NEVER push or merge into `develop` or `master`**
- 🚫 **NEVER push without explicit user confirmation**
- ✅ **Always verify git status and remote origin BEFORE pushing**

### Pre-Push Checklist — Run Every Time

Execute these checks in order before any commit or push:

1. **Check Git Status**
   ```powershell
   git status
   ```
   - Review all changed files
   - Confirm only intended files are staged
   - No unexpected changes or untracked files should be included

2. **Verify Current Branch**
   ```powershell
   git branch
   # or
   git rev-parse --abbrev-ref HEAD
   ```
   - Confirm `HEAD` is pointing to the **correct current local branch**

3. **Check Remote Tracking Branch**
   ```powershell
   git branch -vv
   ```
   - Confirm remote origin is set to the **same branch as current local branch**
   - Remote should show: `[origin/<current-branch-name>]`
   - 🔴 Danger: `[origin/develop]` — **do NOT sync**

### Prevention — immediately after every new feature branch push

```powershell
git push -u origin <current-branch-name>
```

### Scenarios & Resolutions

| Scenario | Action |
|----------|--------|
| **Remote branch exists & matches** ✅ | Safe to proceed. Commit and push normally |
| **No remote tracking branch set** | `git push --set-upstream origin <current-branch-name>` |
| **Remote origin points to different branch** ⚠️ | `git branch --unset-upstream` then `git push --set-upstream origin <current-branch-name>` |
| **HEAD is detached or misaligned** ⚠️ | `git checkout <correct-branch-name>` then re-run checklist |

### Commit Message Convention

Always reference the Jira ticket ID:
```
UD-XXXXX: [Clear, concise description of what was implemented]
```

### After Push — Confirm

After pushing, verify the remote branch received the changes:
```powershell
git log origin/<branch-name> --oneline -5
```
Confirm the latest commit appears on the remote branch. Report push status before proceeding to Step 7 (Jira comment).

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
