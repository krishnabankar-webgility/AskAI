# Jira Workflow — Consolidated Skill

Single skill file for the `jira-automation` agent. Covers issue creation, subtasks, Original Estimate, worklogs, status transitions, and sprint lifecycle.

---

## 1. Issue Creation

### 1.1 Work type is mandatory

If the user does **not** specify a work type (Story, Bug, Task, etc.), **ask first** before creating anything.

### 1.2 Project and naming conventions

| Rule | Value |
|------|-------|
| **Project** | `UD` (all issues are `UD-xxxxx`) |
| **Summary prefix** | `CIM :` or `CIF :` — user will indicate which; if unclear, ask |
| **Summary source** | User-provided title, or fetched from a referenced Customer Issue |

If the user provides no title and no Customer Issue reference, ask for a one-line summary before creating.

### 1.3 Creating a Story (no subtasks by default)

When the user says **"create jira story"**:

1. Create a **Story** in project `UD`.
2. Status: **To Do** (do **not** transition after create).
3. **Do NOT create subtasks** unless the user **explicitly** asks for them.
4. **Ask for Story Points** if not provided. Story Points are needed for future OE calculations.

### 1.4 Creating a Story linked to a Customer Issue

When the user says **"create jira story for customer issue UD-xxxx"**:

1. Fetch the Customer Issue `UD-xxxx`: summary, description, Due Date, QA Date, labels, components.
2. Create a Story `UD-yyyy` with:
   - Summary: `CIM : <title from Customer Issue or user>` (or `CIF :` per user).
   - Description referencing the Customer Issue key.
   - **Link** the Story to the Customer Issue (e.g. "relates to" / project-standard link type).
3. Status: **To Do**.
4. No subtasks unless explicitly requested.
5. Ask for Story Points if not provided.

### 1.5 Creating a Story with subtasks

Only when the user **explicitly** requests subtasks:

1. Create the Story per §1.3 or §1.4.
2. Create **only** the subtasks the user specifies (names and count come from the user — there is **no fixed set**).
3. Each subtask is a child of the Story (standard Sub-task issue type).
4. Set **Original Estimate** on each subtask immediately after creation (see §2).

### 1.6 Default field values

Apply unless the user overrides:

| Field | Default |
|-------|---------|
| **Priority** | P2 (`{ "id": "3" }`) |
| **Team** | Desktop-Customization (`customfield_10075` → `{ "id": "11209" }`) |
| **Assignee** | Krishna Bankar (`712020:cb0bd6e5-b436-49f9-a0f5-6211a8cc8799`) |
| **Story Points** | From user input (`customfield_10053`) |
| **Due Date** | Copied from Customer Issue if available |
| **QA Date** | Copied from Customer Issue if available |
| **Sprint** | User-provided sprint name → resolve to numeric id (`customfield_10010`); if omitted, auto-detect active/next ~14–15 day customization sprint |

Set optional fields **only** when the user provides them. Do not force defaults the user did not mention (except Priority, Team, Assignee which are standard defaults).

### 1.7 Idempotency

Before creating, search for an existing Story linked to the same Customer Issue. If found, report the existing Story and offer to update instead of duplicating.

### 1.8 Field map (Jira Cloud / UD)

| Concept | API field |
|---------|-----------|
| Story Points | `customfield_10053` |
| Sprint | `customfield_10010` (numeric sprint id) |
| Team | `customfield_10075` |

Re-verify with `getJiraIssueTypeMetaWithFields` if the project changes.

### 1.9 Resolving sprint id

1. JQL: `project = UD AND sprint in openSprints()`, read `customfield_10010`.
2. Or `getJiraIssue` on a reference issue; read `customfield_10010[].id` / `name`.
3. If unresolvable, omit sprint and tell the user.

---

## 2. Original Estimate (OE)

### 2.1 Conversion formula

**1 Story Point = 8 hours.**

| SP | Total hours |
|----|-------------|
| 0.5 | 4h |
| 1 | 8h |
| 1.5 | 12h |
| 2 | 16h |
| 2.5 | 20h |
| 3 | 24h |

### 2.2 OE per subtask

Divide total hours **equally** across **all** subtasks of the Story (count is dynamic, not fixed):

```
hours_per_subtask = (Story Points × 8) / number_of_subtasks
```

Round to the nearest **0.25h**. Convert to Jira duration string (e.g. `4h`, `2h 30m`, `6h 45m`).

**All subtasks get the same OE** under this formula.

### 2.3 Setting OE

Immediately after each subtask is created:

1. Count total subtasks under the Story.
2. Compute `hours_per_subtask` from §2.2.
3. Set `fields.timetracking.originalEstimate` on each subtask via the Jira API.

If the API rejects the `timetracking` field, note the error on the Story and document the intended OE in the reply.

### 2.4 Recalculation on subtask changes

If subtasks are added or removed later, recalculate OE for **all** subtasks using the updated count and the same Story Points.

---

## 3. Marking Done and Worklogs

### 3.1 Marking a subtask Done

When the user asks to mark a **subtask** Done:

1. Transition the subtask to **Done** (respect workflow; chain transitions if needed).
2. **If the Story has Story Points and the subtask has an Original Estimate:**
   - Log work (`timeSpent`) equal to that subtask's **Original Estimate**.
   - Comment: `"Auto: worklog matches Original Estimate on Done"`.
3. **If the Story has no Story Points:**
   - Mark the subtask Done **without** logging work.

**Idempotency:** If the subtask already has work logged (total time spent >= OE), do **not** add a duplicate worklog.

### 3.2 Marking a Story Done

When the user asks to mark a **Story** Done:

1. **Only transition subtasks that are "In Progress" to Done.** Leave untouched subtasks (e.g. To Do) as-is.
2. For each subtask moved to Done: log work equal to its Original Estimate per §3.1.
3. Transition the **Story** to Done.
4. Add a traceability **comment** on the Story listing all actions performed.

> **Key difference from previous behavior:** Do NOT sweep all non-Done subtasks to Done. Only In Progress subtasks are moved to Done when the Story is completed.

### 3.3 Worklog value

The worklog `timeSpent` always equals the subtask's **Original Estimate** (the value set in §2.3). If OE was never set, compute it using §2.2 first, set OE, then log the same duration.

---

## 4. Status and Permissions

- You **may** change status (respect workflow transitions).
- You **may** add comments and replies.
- You **may** assign users.
- You **may** update story points.
- If a transition fails, capture the error, add a comment if appropriate, and tell the user what is missing.

---

## 5. Sprint Lifecycle

### 5.1 Sprint start

When the user says a sprint has started:

- Set the **first** Story (in sprint scope) to **In Progress**.
- Set that Story's **first** subtask (by creation order) to **In Progress**.
- Do not bulk-move every issue unless the user asks.

### 5.2 Sprint closure

When the user says a sprint has closed or asks to roll incomplete work forward:

| Story state | Action |
|-------------|--------|
| **In Progress** | Leave as-is or follow user instruction; default: do **not** force to Done |
| **To Do / incomplete** | Move Story and its open subtasks to the **next** ~14–15 day customization sprint |

If no such sprint exists:

- Create an Ad-hoc sprint (e.g. `Ad-hoc Desktop-Customization YYYY-MM-DD – YYYY-MM-DD`).
- Move the Story and applicable subtasks into it.

Preserve To Do subtasks as-is when moving; only change sprint membership.

### 5.3 Hierarchy consistency

- Keep Story → Subtasks hierarchy consistent; no orphan subtasks.
- Align status, sprint, and worklogs after each batch of changes.
- Avoid duplicate Stories for the same Customer Issue.
- Avoid duplicate sprints with the same intent (search before creating).

---

## 6. Output Format

After each operation, reply with:

1. **Issue key(s)** created or updated (Story, subtasks).
2. **Status** of each issue after the operation.
3. **Sprint** (name + dates if available).
4. **Original Estimate** per subtask (if set or changed).
5. **Worklogs** per subtask (hours logged, date).
6. **Actions performed** (creates, OE updates, transitions, worklogs, comments, links).
7. **Anything blocked** (permissions, workflow issues, missing fields).
