# Skill: Jira worklogs and story completion

Use this skill for story-point-to-hours conversion, **Original Estimate** on subtasks, per-subtask worklogs, and closing Stories with consistent logging.

## 4. Worklog and Original Estimate logic

### 4.1 Conversion

- **1 Story Point = 4 hours** of work (total for the Story’s engineering effort).

Examples:

- `2 SP` → 8 hours total  
- `2.5 SP` → 10 hours total  

### 4.2 Canonical hours per subtask (formula)

Divide **total hours equally** across the **three** subtasks:

\[
\text{hours per subtask} = \frac{\text{Story Points} \times 4}{3}
\]

Round to **one decimal** when storing/logging if the tool allows; otherwise round to the nearest **0.25h**. **Use the same rounded value everywhere** (Original Estimate and worklogs) so the issue and automation stay consistent.

Convert that number to Jira duration strings for API calls (e.g. `4.75h`, or `4h 45m` when you prefer hours+minutes).

### 4.3 Original Estimate immediately after subtask create

**As soon as each subtask exists** (Analysis, Implementation, Unit Testing under the Story):

1. Compute **hours per subtask** from §4.2 using the Story’s **Story Points** (from the Story issue, same value as `customfield_10053` when applicable).  
2. Call **`editJiraIssue`** with **`fields.timetracking.originalEstimate`** set to that duration (Jira’s time-tracking field shape, e.g. `{ "timetracking": { "originalEstimate": "4h 45m" } }` — confirm shape with `getJiraIssueTypeMetaWithFields` / API if the project differs).  
3. Apply **once per subtask**; all three get the **same** OE under this workflow.

If `editJiraIssue` rejects `timetracking`, note the error on the Story and fall back to documenting the intended OE in the reply until the field is enabled or mapped correctly.

### 4.4 When to log work (aligned to Original Estimate)

**Source of truth:** The worklog amount should **match that subtask’s Original Estimate** (the value set in §4.3). If OE was never set, use the §4.2 formula once, set OE if possible, then log the same duration.

**Idempotency:** If the subtask **already has** work logged that satisfies the intent (total time spent ≥ OE, or the user explicitly logged differently), **do not add a duplicate** worklog unless the user asks to correct it.

- **When a subtask moves to Done:** Call **`addWorklogToJiraIssue`** with **`timeSpent`** equal to that subtask’s **Original Estimate** (same string you would use for OE, e.g. `4h 45m`). Optional short **`commentBody`** (e.g. “Auto: matches Original Estimate on Done”).  
- **When the Story moves to Done** (or the user asks to complete the Story):  
  1. For **each** child subtask that is **not Done** (e.g. **To Do**, **In Progress**, or any other non-terminal status), **transition it to Done** (respect workflow: chain transitions if the project requires **To Do → In Progress → Done**; use `getTransitionsForJiraIssue` / `transitionJiraIssue`). **Do not** leave subtasks open when the Story is completed—same hierarchy rule as `jira-sprint-lifecycle.md`.  
  2. For **each** subtask (including those just moved and any already Done): ensure a worklog equal to **Original Estimate** per the idempotency rule above — add **`addWorklogToJiraIssue`** only where time is still missing.  
  3. Then transition the **Story** to Done if not already.  

Always leave a brief **comment** on the Story when bulk-transitioning subtasks or backfilling worklogs for traceability.

## 5. Story completion rule

When the **Story** is set to **DONE** (or user asks to complete the Story):

1. **Sweep subtasks:** Move **every** subtask that is **not Done** to **Done** (Analysis, Implementation, Unit Testing — include **To Do** and **In Progress**; use legal transition chains per workflow).  
2. **Worklogs:** Apply **§4.4** so each subtask is credited **Original Estimate** hours without double-counting.  
3. **Story:** Transition the Story to **Done** when subtasks and logging are consistent with policy.
