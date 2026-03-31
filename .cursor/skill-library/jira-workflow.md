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
4. **Story Points:** If the user **provides** a value, set `customfield_10053` on the Story. If they **do not** provide SP, **leave the field unchanged** (do not clear an existing value; do not invent a default). Optionally mention that SP enables automatic Original Estimate on subtasks — do **not** block issue creation on missing SP.

### 1.4 Creating a Story linked to a Customer Issue

When the user says **"create jira story for customer issue UD-xxxx"**:

1. Fetch the Customer Issue `UD-xxxx`: summary, description, Due Date, QA Date, labels, components.
2. Create a Story `UD-yyyy` with:
   - Summary: `CIM : <title from Customer Issue or user>` (or `CIF :` per user).
   - Description referencing the Customer Issue key.
   - **Link** the Story to the Customer Issue (e.g. "relates to" / project-standard link type).
3. Status: **To Do**.
4. No subtasks unless explicitly requested.
5. Story Points: set **only** when the user supplies a value; otherwise leave as-is (see §1.10).

### 1.5 Creating a Story with subtasks

Only when the user **explicitly** requests subtasks:

1. Create the Story per §1.3 or §1.4.
2. Create **only** the subtasks the user specifies (names and count come from the user — there is **no fixed set**).
3. Each subtask is a child of the Story (standard Sub-task issue type).
4. Set **Original Estimate** on each subtask **only if** the Story has a numeric Story Points value (see §2 and §1.10). If SP is missing, create subtasks without OE unless the user later adds SP and asks to recalculate.

### 1.6 Default field values

Apply unless the user overrides:

| Field | Default |
|-------|---------|
| **Priority** | P2 (`{ "id": "3" }`) |
| **Team** | Desktop-Customization (`customfield_10075` → `{ "id": "11209" }`) |
| **Assignee** | Krishna Bankar (`712020:cb0bd6e5-b436-49f9-a0f5-6211a8cc8799`) |
| **Story Points** | Set **only** when the user explicitly gives a number; otherwise leave unchanged (§1.10) |
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

### 1.9 Resolving sprint id (exact and fuzzy names)

When the user gives a **sprint name** (or partial phrase such as “customization 8 april”):

1. List **candidate sprints** from open (and if needed future) sprints the team uses — e.g. JQL `project = UD AND sprint in openSprints()` on sample issues, or board/sprint APIs — and collect `name`, `id`, `startDate`, `endDate`.
2. **Normalize** both sides for comparison: lowercase, collapse spaces, strip punctuation where helpful, treat `adhock`/`ad hoc`/`adhoc` as equivalent for matching *story titles* (not for sprint names unless user typo is obvious).
3. **Fuzzy match:** If no exact string match, score candidates by:
   - shared tokens (e.g. `customization`, `april`, `2026`, `08`, `8`);
   - date proximity (user said “8 april” → sprint name containing April and the 8th or a range covering early April);
   - preference for **active** `Customization-*` sprints on the Desktop-Customization board when the user’s wording sounds like a customization sprint.
4. **Decision:**
   - **Single strong match** (clear best candidate): assign `customfield_10010` to that sprint’s **numeric id** and state in the reply: *user phrase* → *actual Jira sprint name* (id **N**).
   - **Ambiguous** (two or more plausible): **do not assign**; list the top matches and ask the user to pick one or give the exact name.
   - **None:** say no match; offer to omit sprint or create/move per §5.2 if appropriate.

For **exact** names, still verify the id via `getJiraIssue` or sprint metadata before writing the field.

### 1.10 Story Points (optional)

- **Set** `customfield_10053` **only** when the user explicitly provides a number (or clearly says “set story points to X”).
- **Do not** overwrite existing SP with a guess. **Do not** require SP to complete create/rename/subtask operations.
- When SP exists on the Story **and** subtasks exist, apply §2 for Original Estimate and later worklogs as written.

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

**Precondition:** The Story has a **non-null numeric Story Points** value (from user input or already on the issue). If SP is missing, **skip** OE unless the user adds SP and asks to (re)apply estimates.

Immediately after subtasks are created or when subtask count changes:

1. Re-read Story SP from `customfield_10053`.
2. Count total subtasks under the Story.
3. Compute `hours_per_subtask` from §2.2.
4. Set `fields.timetracking.originalEstimate` on each subtask via the Jira API.

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

## 6. Finding issues by summary and updating subtasks

When the user describes an issue by **title fragment** (e.g. “adhock story”, “ad hoc”) and **scope** (e.g. current sprint, assigned to me):

1. Build JQL: `project = UD`, `assignee` = user’s account id when they say “assigned to me”, `sprint in openSprints()` when they say current sprint, and `summary ~ "fragment"` (try alternate spellings: `adhock`, `ad hoc`, `adhoc`, `Adhock-Story`).
2. If multiple hits, list keys and summaries and ask; if one clear match, proceed.
3. **Rename sub-task:** `editJiraIssue` on the sub-task issue key; update `summary` only (preserve parent link).
4. **Add subtasks:** `createJiraIssue` with `issueTypeName` Sub-task and `parent` = Story key; then apply §2 if SP exists on the Story.
5. Summarize keys and sprint (§1.9 fuzzy rules apply when assigning or confirming sprint).

---

## 7. Skill maintenance

When a session surfaces a **repeatable rule**, **API quirk**, or **better JQL** (e.g. fuzzy sprint matching, optional SP), **update this file** in the same PR or follow-up commit so the `jira-automation` agent stays accurate. Prefer small, concrete edits over one-off chat-only instructions.

---

## 8. Session notes file (scratch, not agent training)

Ephemeral analysis, one-off session summaries, or notes that **must not** become skill text may be written to:

- `logs/agent-session-notes.log` (entire `logs/` folder is typically gitignored by the Visual Studio template), **or**
- `.cursor/agent-session-notes.log` (also gitignored in this repo).

Agents should **not** treat those files as authoritative workflow; they are for the human or for “show me what you did” scratch space. Override the file freely.

---

## 9. Output Format

After each operation, reply with:

1. **Issue key(s)** created or updated (Story, subtasks).
2. **Status** of each issue after the operation.
3. **Sprint** (name + id + dates if available). If fuzzy match was used, state **user phrase → resolved sprint name (id)**.
4. **Story Points** (whether set, unchanged, or skipped per user).
5. **Original Estimate** per subtask (if set or changed; if skipped due to missing SP, say so).
6. **Worklogs** per subtask (hours logged, date).
7. **Actions performed** (creates, OE updates, transitions, worklogs, comments, links).
8. **Anything blocked** (permissions, workflow issues, missing fields).
