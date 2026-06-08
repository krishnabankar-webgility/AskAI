# Skill: Dev Customization Workflow

## Purpose

Provide a reusable, ticket-agnostic workflow for customization requests from intake to verified delivery.

## Required ticket inputs

Extract only these inputs from the request source (ticket/spec/notes):

1. Customization objective
2. Customer/profile scope
3. Source fields and where they appear in the flow
4. Target fields and destination objects
5. Transaction/use-case types in scope
6. Supporting references (screenshots, mappings, DB notes)

## Step-by-step workflow

### Step 1 — Requirement understanding

1. Read the request end to end.
2. Summarize source → target movement and expected behavior.
3. Present understanding and wait for user confirmation.

### Step 2 — Architecture and code analysis

1. Trace source-to-target data flow.
2. Identify exact implementation files and extension points.
3. Locate analogous existing customization patterns.
4. Document findings and wait for confirmation.

### Step 3 — Implementation plan

Prepare a concise plan with:

1. Customization toggle/config and profile binding
2. Storage/capture change points
3. Consumption/assignment change points
4. Use-case/transaction coverage
5. New methods vs existing methods touched
6. Verification queries/checks

Share plan and wait for explicit approval before coding.

### Step 4 — Implementation

1. Implement only after plan approval.
2. Add gating at call sites before invoking customization helpers.
3. Keep business logic inside dedicated helper methods.
4. Restrict changes to approved customization scope.
5. Present code changes for review.

### Step 5 — Test and review loop

1. Run existing build/test checks.
2. Share verification outcomes.
3. If feedback arrives, iterate from implementation step.

### Step 6 — Commit readiness

Only when user confirms implementation is approved:

1. Re-check branch alignment.
2. Prepare clear commit message tied to request context.
3. Confirm final change list before commit/push workflow.

### Step 7 — Optional downstream actions

For CI/build trigger or release-adjacent actions:

1. Require explicit user confirmation.
2. Trigger configured automation workflow.
3. Report status and any follow-up actions.

## Golden rules

1. Plan before code.
2. Approval before commit.
3. Confirmation before build trigger.
4. Keep custom logic gated and modular.
5. Keep changes minimal and reversible.
