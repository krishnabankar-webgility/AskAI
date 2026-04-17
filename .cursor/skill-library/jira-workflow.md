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
| **Summary prefix (Story)** | Depends on **source issue type** when the Story is created **for** an existing UD issue: **`CIM :`** or **`CIF :`** — **only** when that source is a **Customer Issue** (see §1.4). **`Bug-Fix :`** — when the source is a **Bug** (see §1.4a). Do **not** use `CIM`/`CIF` for Bug-sourced Stories or `Bug-Fix :` for Customer-Issue-sourced Stories unless the user explicitly overrides. |
| **Summary source** | User-provided title, or fetched from a referenced Customer Issue or Bug |

If the user provides no title and no Customer Issue / Bug reference, ask for a one-line summary (and confirm prefix if needed) before creating.

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
5. Story Points: set **only** when the user supplies a value **or** §1.6b applies (Story + Sub-tasks bundle with estimated SP); otherwise leave as-is (see §1.10).

### 1.4a Creating a Story linked to a Bug

When the user asks to **create a jira story for** / **from** a **Bug** `UD-xxxx` (issue type **Bug**):

1. Fetch the Bug `UD-xxxx`: summary, description, labels, and any fields needed for context.
2. Create a Story `UD-yyyy` with:
   - Summary: **`Bug-Fix : <title from Bug or user>`** — do **not** use `CIM :` / `CIF :` (those are **Customer Issue** only — §1.2).
   - Description referencing the Bug key (import or link Bug detail; avoid invalid ADF pastes that trigger attachment validation errors).
   - **Link** the Story to the Bug (e.g. **Relates to** / project-standard link type).
3. Status: **To Do** (unless the user asks otherwise).
4. Subtasks, Story Points, and other defaults: follow §1.5 and §1.6b as applicable; use **`Bug-Fix :`** in the Story summary whenever the work is anchored to that Bug.

### 1.5 Creating a Story with subtasks

Only when the user **explicitly** requests subtasks:

1. Create the Story per §1.3, §1.4, or §1.4a (correct **summary prefix**: Customer Issue → `CIM`/`CIF`; Bug → `Bug-Fix :`).
2. Create **only** the subtasks the user specifies (names and count come from the user — there is **no fixed set**).
3. Each subtask is a child of the Story (standard Sub-task issue type).
4. Set **Original Estimate** on each subtask **only if** the Story has a numeric Story Points value (see §2 and §1.10). If SP is missing, create subtasks without OE unless the user later adds SP and asks to recalculate.

5. **Duplicate guard:** Before creating each Sub-task, list existing children (`fields.subtasks` or JQL `parent = STORYKEY`). **Do not** create a second Sub-task with the **same summary** (e.g. two **Analysis** rows on the same Story). If the user asks for a name that already exists, report the existing key and update or rename instead.

### 1.5b Sub-task sourced from a Jira comment (latest or linked comment)

When the user asks to **create** or **add** a Sub-task under a given Story/issue **based on the latest comment** on some issue, **or** pastes a Jira **comment URL** (e.g. `.../browse/UD-xxxxx?focusedCommentId=yyyyyy`):

1. **Resolve the comment**
   - If the user gives a **comment link**, parse **issue key** and **`focusedCommentId`** (comment id). Fetch that issue with `getJiraIssue` and locate the comment whose `id` matches (or use the comment API if available).
   - If the user says **“latest comment”** on issue **UD-xxxx**, fetch `getJiraIssue` for **UD-xxxx**, read `fields.comment.comments`, and take the comment with the **most recent** `created` (or `updated` if that is the team convention — default **created**).

2. **Extract text** from the comment body (ADF or markdown). Strip boilerplate like “(please, do not edit or duplicate)” from the **summary** if it would pollute the title, but **keep the full raw text** in the description.

3. **Sub-task `summary` (title):** Write a **short, actionable** one-line title (under Jira’s summary length limit). Rephrase from the comment — do **not** paste the entire comment as the title. Prefer a clear scope phrase (e.g. product area + outcome).

4. **Sub-task `description`:** Include:
   - **Source:** linked issue key, comment id, author, created timestamp, and a **permalink** to the comment (same site URL pattern the user uses).
   - **“Original comment”** section with the **full** comment content (verbatim or faithfully converted from ADF to markdown), preserving meaning, lists, and names.
   - Optional **“Rephrased scope”** bullet list if it helps readers scan what the Sub-task covers.

5. **Parent:** Create the Sub-task with `parent` = the user’s target Story/issue key (`createJiraIssue`, issue type **Sub-task**).

6. **After create:** Run **§2.4** if the parent Story has Story Points (redistribute OE across **all** Sub-tasks).

7. **Do not** create issue links between the new Sub-task and the source issue unless the user explicitly asks (parent hierarchy is enough). Optionally mention the source issue key in the description only.

### 1.6 Default field values

Apply unless the user overrides:

| Field | Default |
|-------|---------|
| **Priority** | P2 default (`{ "id": "3" }`); **P1** = `{ "id": "2" }` when the user requests |
| **Team** | Desktop-Customization (`customfield_10075` → `{ "id": "11209" }`) |
| **Assignee** | Krishna Bankar (`712020:cb0bd6e5-b436-49f9-a0f5-6211a8cc8799`) |
| **Story Points** | Set **only** when the user explicitly gives a number; otherwise leave unchanged (§1.10) |
| **Due Date** | Copied from Customer Issue if available |
| **QA Date** | Copied from Customer Issue if available |
| **Sprint** | **Optional.** Set only when the user explicitly asks for a sprint, gives a sprint name, or legacy workflow requires it. **Kanban default (WD Product):** omit `customfield_10010` — work is visible on the **[WD Product Kanban board (894)](https://webgility.atlassian.net/jira/software/c/projects/UD/boards/894)** without sprint membership. If the user says sprint is **N/A** or they track on Kanban only, **never** auto-assign a sprint. If a sprint name **is** provided, resolve to numeric id (`customfield_10010`) per §1.9. |

Set optional fields **only** when the user provides them. Do not force defaults the user did not mention (except Priority, Team, Assignee which are standard defaults).

### 1.6a WD Product Kanban (board 894)

- **Primary board for Desktop / Webgility Desktop customization visibility:** [UD board 894](https://webgility.atlassian.net/jira/software/c/projects/UD/boards/894).
- Issues in project **UD** with **Team = Desktop-Customization** typically appear here per board filter; **no sprint** is required for them to show on the Kanban backlog/columns (verify filter if an issue is missing).
- When documenting in descriptions, you may note: *Sprint: N/A — WD Product Kanban board 894* if the user wants explicit traceability.

### 1.6b New Story + Sub-tasks (Desktop customization — default bundle)

When the user asks to **create a Story with subtasks** (from a **Customer Issue** and/or a **Bug**), apply these **defaults** unless they override:

| Item | Rule |
|------|------|
| **Story summary prefix** | **Customer Issue** source → `CIM :` / `CIF :` per §1.2. **Bug** source → **`Bug-Fix :`** per §1.4a — never mix prefixes. |
| **Assignee** | Krishna Bankar (`712020:cb0bd6e5-b436-49f9-a0f5-6211a8cc8799`) on the Story and on each Sub-task |
| **Priority** | P2 (`priority` → `{ "id": "3" }`) |
| **Priority Rank** | `1` → `customfield_10150` → `{ "id": "10339" }` |
| **Team** | Desktop-Customization (`customfield_10075` → `{ "id": "11209" }`) |
| **Type** | **Customization** (`customfield_10298` → `{ "id": "10882" }`) when the source is a Customer Issue; when the Story tracks a **Bug**, prefer **Bug** (`customfield_10298` → `{ "id": "10880" }`) unless the user says otherwise |
| **StoryType** | **Implementation** (`customfield_10427` → `{ "id": "11224" }`) when the work is implementation (not Feasibility-only) |
| **Story Points** | **Estimate** total effort to complete **all** Sub-tasks (scope from Customer Issue description, feasibility/quote comments, or typical split). Set `customfield_10053` on the **Story**, then run §2.4 for Original Estimate on Sub-tasks. Prefer half-point increments when needed (e.g. `3.5`). |
| **Story-only fields from Customer Issue** | Copy onto the **Story only** (not Sub-tasks) when present on the Customer Issue: **Due date** `customfield_10062`, **Due date to QA** `customfield_10183`, **MRR** `customfield_10113`, **Subscriber ID** `customfield_10226`, **Revenue Received** `customfield_10130`. Re-verify field ids with create/edit meta if the project schema changes. |
| **Sub-tasks** | Use **`parent`** only — **never** add Sub-tasks under **Linked work items** (§1.11). **Never** duplicate the same Sub-task summary on the same Story (§1.5). |

Import from **Customer Issue**: copy **summary** (with `CIM :` / `CIF :` prefix per §1.2 only), **description** (ADF), and the fields above; link Story ↔ Customer Issue per §1.4. Import from **Bug**: use **`Bug-Fix :`** summary prefix (§1.4a), not `CIM`/`CIF`; link Story ↔ Bug.

### 1.7 Idempotency

Before creating, search for an existing Story linked to the same Customer Issue. If found, report the existing Story and offer to update instead of duplicating.

### 1.8 Field map (Jira Cloud / UD)

| Concept | API field |
|---------|-----------|
| Story Points | `customfield_10053` |
| Sprint | `customfield_10010` (numeric sprint id) |
| Team | `customfield_10075` |
| **Priority Rank** (1–10) | `customfield_10150` — **not** the same as **Priority** (P0–P4); see §1.8a |
| **Type** (e.g. Customization) | `customfield_10298` |
| **StoryType** (e.g. Implementation) | `customfield_10427` |
| **Due date** (custom) | `customfield_10062` |
| **Due date to QA** | `customfield_10183` |
| **MRR** | `customfield_10113` |
| **Subscriber ID** | `customfield_10226` |
| **Revenue Received** | `customfield_10130` |

Re-verify with `getJiraIssueTypeMetaWithFields` if the project changes.

### 1.8a Priority vs Priority Rank (UD)

- **Priority** (system field `priority`): **P0**, **P1**, **P2**, **P3**, **P4**, or **None** — urgency / triage. Example: user says “make it **P1**” → set `priority` to `{ "name": "P1" }` (id `2`).
- **Priority Rank** (`customfield_10150`, label **Priority Rank**): dropdown values **`"1"`** through **`"10"`** (option ids **`10339`**–**`10348`** in the current UD metadata). Used for **ordering / sequencing** in the backlog. **Do not** treat “priority rank 1” as “set Priority to P1” — they are different fields.
- When the user says **“Priority Rank = 1”** / **“priority rank 1”**, set `customfield_10150` to `{ "id": "10339" }`. For rank **N** (1–10), option id is **`10338 + N`** (re-verify if options change).

### 1.9 Resolving sprint id (exact and fuzzy names)

**Precondition:** The user (or workflow) actually wants a **Sprint** field set. If the user is on **Kanban-only** workflow (§1.6), **skip** this section unless they later ask to add or move issues into a sprint.

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

- **Set** `customfield_10053` when (a) the user explicitly provides a number, **or** (b) the user (or §1.6b) asks for a **new Story with Sub-tasks** — then **estimate** SP from scope / Customer Issue / feasibility output (state the rationale briefly in the reply).
- **Do not** overwrite existing SP with a guess when updating an old issue unless the user asks.
- **Do not** require SP to complete create/rename/subtask operations that are not OE-driven.
- When SP exists on the Story **and** subtasks exist, apply §2 for Original Estimate and later worklogs as written.

### 1.11 Sub-tasks and parent Story — parent only (no issue links)

- Sub-tasks are tied to the parent **only** via the standard **parent** field (Sub-task issue type + `parent` = parent issue key). Jira lists them under the parent’s **Subtasks** panel — no extra linking is needed.
- **Never** create Jira **issue links** of **any** type (e.g. **Relates to**, Blocks, Clones, Duplicate) **between a Sub-task and its own parent** (Story, Bug, Task, or any issue type that is the Sub-task’s `parent`). This applies **in every project and every Jira site** the agent touches — not only UD. Duplicate links show the same keys again under **Linked work items**, which is redundant.
- **Never** use `createIssueLink` (or REST link creation) to connect an issue to one of its **own** Sub-tasks (or the reverse). If automation is tempted to “associate” work, use **parent** only when creating Sub-tasks, or link the **parent** to **unrelated** issues (e.g. Customer Issue) per §1.4.
- **Do** create issue links when this skill **explicitly** requires them for **other** relationships (e.g. Story ↔ Customer Issue in §1.4). Those linked peers must **not** be Sub-tasks of the issue you are linking from.

#### 1.11.1 Removing redundant Story ↔ Sub-task issue links (cleanup)

When working on a Story that has Sub-tasks, or when the user asks to **clean links**, **remove duplicate hierarchy links**, or **stop showing sub-tasks under Linked work items**:

1. **Build the child set:** From `getJiraIssue` on the Story, collect every Sub-task **key** from `fields.subtasks` (or use JQL `parent = STORYKEY` if needed). Call this set **S**.

2. **Scan the Story’s `fields.issuelinks`:** For each link object, read `id`, `type.name`, and the **other** issue:
   - If the link has `outwardIssue`, the peer key is `outwardIssue.key`; if `inwardIssue`, use `inwardIssue.key` (the Story itself is the current issue).
   - If that peer key is in **S** (or `getJiraIssue` on the peer shows `fields.parent.key` equals the Story key and `issuetype.subtask` is true), the link is **redundant** — it only duplicates the parent/child relationship already shown under **Subtasks**.

3. **Scan each Sub-task in S** (optional but thorough): On each sub-task’s `fields.issuelinks`, if the **other** issue is the **parent Story** key, treat that link as **redundant** as well.

4. **Delete each redundant link** by **issue link id** (not issue key):
   - Prefer an MCP/tool that deletes issue links if available (e.g. `deleteIssueLink`).
   - Otherwise use Jira REST Cloud: **`DELETE`**  
     `https://{site}.atlassian.net/rest/api/3/issueLink/{linkId}`  
     (or `https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/issueLink/{linkId}`) with credentials that have **Link Issues** / delete link permission on that project. The `linkId` is the string `id` on each link in `issuelinks`.
   - If the API returns permission errors, remove the links in the Jira UI (**Linked work items** → remove) or ask an admin to grant link permissions to the API user; do not leave redundant links in place silently.

5. **Do not remove** links where the peer is **not** a Sub-task of this Story (e.g. Story ↔ Customer Issue, Story ↔ another Story, or cross-project references).

6. After cleanup, **re-fetch** the Story and confirm redundant links are gone; mention removed **link id(s)** and peer key(s) in the session output (§10).

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
4. Set `fields.timetracking.originalEstimate` on **each** subtask via the Jira API (same value on all).

If the API rejects the `timetracking` field, note the error on the Story and document the intended OE in the reply.

### 2.4 Recalculation on subtask changes (mandatory)

Whenever the user asks to **add**, **remove**, **delete**, or **move** a sub-task under an existing Story (or you perform any of these as part of the request), you **must** recalculate and **push updated Original Estimate** to **every** sub-task that still belongs to the affected Story(ies), using the current Story Points and **§2.2**.

| Action | What to do after the operation succeeds |
|--------|----------------------------------------|
| **Add** sub-task(s) | Re-fetch all subtasks under the Story; **N** = new count; set **identical** new OE on **all N** subtasks (including existing ones). |
| **Remove / delete** sub-task(s) | Re-fetch remaining subtasks; **N** = count; if **N ≥ 1**, set new OE on **all N**; if **N = 0**, skip OE (no subtasks left). |
| **Move** sub-task (reparent to another Story/issue) | Run full recalculation separately for **source** Story (remaining subtasks) **and** **target** Story (all subtasks including the moved one). If the new parent is not a UD Story or has no SP, still recalc where SP exists; report gaps. |

**Procedure (repeat for each affected Story with numeric SP):**

1. `getJiraIssue` on the Story; read `customfield_10053` and `subtasks` (or JQL `parent = STORYKEY` / equivalent) so the child list is **current**.
2. **N** = number of Sub-task children. If **N = 0**, stop OE updates for that Story.
3. Compute `hours_per_subtask = (SP × 8) / N`, round to **0.25h**, convert to Jira duration string (§2.2).
4. **editJiraIssue** (or API) **`timetracking.originalEstimate`** on **each** of the **N** subtasks — **overwrite** previous OE so all match the new split.

**If Story Points are missing** on an affected Story: do **not** invent SP; skip OE redistribution for that Story and state clearly in the reply. If the user supplies SP in the same session, run the procedure immediately after setting SP.

**Worklogs:** Updating OE does **not** rewrite existing worklogs. If a sub-task already has time logged, mention in the reply that totals may need manual review.

**Delete via API/UI:** If delete is not available to the automation, instruct the user to delete in Jira, then ask them to request “recalculate subtask estimates for STORY-KEY” or run the same §2.4 steps once deletion is done.

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
4. Add a brief traceability **comment** on the Story (transitions, worklogs, sprint/SP, Customer Issue link if any). **Do not** add issue links between the Story and its Sub-tasks (§1.11). **Do not** paste a full sub-task key list **only** to associate children with the Story — they are already visible under **Subtasks**; mention sub-task keys only when documenting **this session’s** concrete actions (e.g. which keys transitioned or received worklogs).

> **Key difference from previous behavior:** Do NOT sweep all non-Done subtasks to Done. Only In Progress subtasks are moved to Done when the Story is completed.

### 3.3 Worklog value

The worklog `timeSpent` always equals the subtask's **Original Estimate** (the value set in §2.3). If OE was never set, compute it using §2.2 first, set OE, then log the same duration.

### 3.4 Remaining estimate when worklog equals OE (Done transition)

When adding a worklog on a Done transition where **`timeSpent` should equal Original Estimate**, always set **`remainingEstimateSeconds`: `0`** in the worklog API payload so **Remaining** is zeroed out. Jira may otherwise leave a positive remaining estimate (e.g. prior remaining time minus logged time).

- **REST worklog (`POST` / `PUT` /issue/{key}/worklog):** include `"remainingEstimateSeconds": 0` in the JSON body when logging the full OE.
- **Atlassian MCP `addWorklogToJiraIssue`:** the tool schema may not expose `remainingEstimateSeconds`. If after logging, **`getJiraIssue`** shows `timeSpent` = `originalEstimate` but remaining time is still non-zero, run **`editJiraIssue`** with `fields.timetracking.remainingEstimate` = **`"0h"`** (or `"0m"`) and re-verify `timetracking`.

### 3.5 Closing a parent issue as **Closed** — sub-task sweep

When the user says an issue is **closed**, asks to **close** it, or uses phrases like **“set status to Closed”** (the workflow status **Closed**, distinct from **Done** where both exist):

**Trigger phrases (non-exhaustive):** *close*, *closed*, *set to Closed*, *status is closed*, *close the story*.

1. **Target issue:** Resolve the issue key (Story, Bug, Task, or other). Fetch `getJiraIssue` for the parent and read **`subtasks`** (or `parent = KEY` JQL) so the child list is current.

2. **Parent transition to Closed:**
   - Use **`getTransitionsForJiraIssue`** on the parent; choose the transition whose **`to.name`** is **Closed** (in UD this is often the global transition **Closed** — verify `id` per issue).
   - **Idempotency:** If the parent’s **`status.name`** is already **Closed**, **skip** the parent transition and continue with sub-task steps only.

3. **Sub-tasks — by current status** (apply to **each** Sub-task under that parent):

   | Sub-task `status.name` | Action |
   |------------------------|--------|
   | **To Do** | Transition to **Closed** (use `getTransitionsForJiraIssue` on that sub-task; pick transition whose **`to.name`** is **Closed**). **Do not** add a worklog unless the user explicitly asks. |
   | **In Progress** | Transition to **Closed** (same as To Do — closing the parent means open subtasks are **Closed**, not swept to **Done**). **Do not** add a worklog on In Progress → Closed unless the user explicitly asks. |
   | **Done** | **No change** (remains **Done**). |
   | **Closed** | **No change** (idempotent). |

4. **Any other status** (e.g. Ready For Testing, Blocked, or any status that is **not** To Do, In Progress, Done, or Closed): **Leave untouched** — do **not** auto-transition. List those keys and statuses in the reply (and in the optional parent comment).

5. **Comment (recommended):** Add a short traceability **comment on the parent** listing: parent skipped or transitioned to Closed; which sub-task keys were transitioned to **Closed** vs left as-is; **§1.11** — no issue links to sub-tasks.

6. If **Closed** is not available from a sub-task’s current status, report the error and list **`getTransitionsForJiraIssue`** candidates for that key.

**Relationship to §3.2:** §3.2 applies when the user asks to mark a **Story Done** (typically status **Done**). §3.5 applies when the user explicitly wants **Closed** and the sub-task cleanup rules above.

### 3.6 “Open” a Jira — parent and Sub-tasks back to **To Do** (reopen for work)

When the user asks to **open** an issue, **reopen** it, or **mark it To Do** so work can continue (issue may be **Done**, **Closed**, **In Progress**, or any other status):

**Trigger phrases (non-exhaustive):** *open*, *open the jira*, *open UD-xxxx*, *reopen*, *set to To Do*, *move to To Do*, *put back in To Do*.

1. **Target issue:** Resolve the issue key. Fetch `getJiraIssue` for the parent and read **`subtasks`** (or `parent = KEY` JQL).

2. **Parent → To Do:**
   - Use **`getTransitionsForJiraIssue`** on the parent. Choose a transition (or **chain** transitions) so the parent ends in **`status.name`** **To Do**.
   - **Idempotency:** If the parent is already **To Do**, **skip** the parent transition.
   - **No direct path:** Many workflows require intermediate steps (e.g. **Closed** → **Reopened** → **To Do**, or **Done** → **Reopened** → **To Do**). Apply the shortest valid chain; if automation cannot reach **To Do**, report available transitions and the blocking status.

3. **Sub-tasks — only if Closed:**
   - For **each** Sub-task under that parent: if **`status.name`** is **Closed**, transition it to **To Do** (same rules: **`getTransitionsForJiraIssue`**, chain if needed).
   - **All other Sub-task statuses** (**Done**, **In Progress**, **To Do**, **Ready For Testing**, **Blocked**, etc.): **leave unchanged** — do **not** move them to **To Do** as part of this action.

4. **Comment (optional):** Brief note on the parent: parent reopened to **To Do**; which Sub-task keys moved from **Closed** → **To Do**; **§1.11** — no issue links for hierarchy.

5. If a required transition is unavailable (permissions or workflow), report the error and list **`getTransitionsForJiraIssue`** candidates.

**Relationship to §3.5:** §3.5 closes work; §3.6 **opens** work again. Sub-task handling differs: §3.6 only touches Sub-tasks in **Closed**; §3.5 sweeps **To Do** / **In Progress** to **Closed**.

---

## 4. Status and Permissions

- You **may** change status (respect workflow transitions).
- You **may** add comments and replies.
- You **may** assign users.
- You **may** update story points.
- If a transition fails, capture the error, add a comment if appropriate, and tell the user what is missing.

---

## 5. Sprint Lifecycle

Use this section when the team is actively using **Jira Sprints** (Scrum boards, sprint assignment, closure). If work is tracked only on **Kanban** (§1.6a) with **no sprint**, skip bulk sprint moves unless the user explicitly requests them.

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
3. **Rename sub-task:** `editJiraIssue` on the sub-task issue key; update `summary` only (preserve parent link). Renaming **does not** change **N** — no OE recalculation unless another structural change happened in the same request.
4. **Add subtasks:** `createJiraIssue` with `issueTypeName` Sub-task and `parent` = Story key; then **mandatory §2.4** (recompute OE on **all** subtasks under that Story when SP exists).
5. **Remove / delete subtask:** After the sub-task is removed or deleted (API or user-confirmed), **mandatory §2.4** on the parent Story for all remaining subtasks.
6. **Move subtask** (change parent to another Story): After parent update, **mandatory §2.4** on **both** source and destination Stories (each Story’s SP × 8 split across **its** current subtasks).
7. Summarize keys, **new OE per subtask** after any §2.4 run, and sprint (§1.9 fuzzy rules apply when assigning or confirming sprint).

---

## 7. Comment for QA Testing (Ready For Testing / RFT)

When the user asks to add a **Comment for QA Testing**, **RFT (Ready For Testing)** comment, or **customization testing comment** for QA, follow these rules strictly.

**Confluence mirror (CS templates / Public → template):** [Comment for QA Testing](https://webgility.atlassian.net/wiki/spaces/~712020cb0bd6e5b43649f9a0f56211a8cc8799/pages/3021209607/Comment+for+QA+Testing) · page ID `3021209607` · tiny `BwAUt` — use `getConfluencePage` when drafting so wording matches the published template.

**Exemplars in Jira (match structure and tone):**

- [UD-31982 — focusedCommentId=236780](https://webgility.atlassian.net/browse/UD-31982?focusedCommentId=236780) — single-customer-issue style.
- [UD-32268 — focusedCommentId=238017](https://webgility.atlassian.net/browse/UD-32268?focusedCommentId=238017) — **umbrella / multi-enhancement**: first bullet is **bold** theme line + **nested sub-bullets** for each enhancement; separate top-level bullets for **Build No**, **Local Branch**, **Customization Nodes** (comma-separated `NODE_<ProfileID>`), **Testing Env**, **Accounting**, **Store**; **Limitations** may include nested bullets with **Confluence links**; **Test Cases** may say one case per enhancement line; **CC** often **@Hitesh Devashrayee** and **@Arvind Chavan** (plus others per user).

### 7.1 Where to post

**Default:** Post the RFT comment on the **Customer Issue** (e.g. UD-31982, issue type "Customer Issue"), **not** on the dev Story — the Customer Issue is what QA usually monitors. Identify it from `issuelinks` on the Story (type "Relates", linked Customer Issue).

**Exception:** If the user **explicitly** names a target issue key (e.g. Story **UD-32268**) or says to post on the Story/umbrella issue, post there. Do not override an explicit target.

### 7.2 When to add the comment

Add **only** when the Jira issue status is (or is being transitioned to) **Ready For Testing**. The user will explicitly ask to post this comment.

### 7.3 Comment format (mandatory template)

Use this **structure** in ADF (headings, bullets, nested lists, mentions). Always **draft first in chat**, show to the user, ask for explicit confirmation, then post using `addCommentToJiraIssue` (prefer **markdown** with `[~accountid:…]` mentions, or **ADF** with `mention` nodes). Match live **UD-31982** or **UD-32268** exemplars above.

**Greeting:** `Hi @Alok Mendhe ,` (mention node; default QA lead — user may override).

**Customization Details:** (paragraph or bold label `Customization Details:` then bullet list)

- **Single enhancement:** one bullet per line — what it does; **Customization Node** with `<ProfileID>`; **Build No**; **Local Branch** (if user provides); **Testing Env**; **Accounting**; **Store**.
- **Multiple enhancements (umbrella / RN-style):** First bullet: **bold** one-line theme (e.g. `Sales Order to partial invoice customization enhancements :`), then **nested sub-bullets** — one line per enhancement (marketplace tax, group-item posting, Create Invoice button, invoice number UI, refund posting, late payment + open invoices, Shopify payout / extra node with sub-bullet for node name, etc.). Follow with **separate** top-level bullets: **Build No:** `#xxxx`, **Local Branch:** `101/...`, **Customization Nodes:** `NODE1_<ProfileID>, NODE2_<ProfileID>, ...`, **Testing Env:** (e.g. `CIS-QA.`), **Accounting:**, **Store:**.

**### Limitations:** (heading level 3)

- Bullets from Customer Issue or user; nested bullets allowed (e.g. limitation + **Note:** with Confluence link `https://webgility.atlassian.net/wiki/...`).

**Impacted Area:** (bold label + bullets)

- Product-level bullets (e.g. existing SO→partial invoice customization, Post to QBD, customization UI settings).

**Test Cases:**

- e.g. “In Customization Details each enhancement take as a case.” or user-provided matrix.

**CC:** Mentions — default often **@Hitesh Devashrayee**; add **@Arvind Chavan** and others when the user or exemplar includes them.

Optional blocks when user provides evidence: **QBD Items**, **WD Sync ReorderPoint**, **WooCommerce item** (see legacy template in git history if needed).

**ADF note:** Render `### Limitations:` as a heading node; use **nested `bulletList`** under the first `listItem` when listing many enhancements (see UD-32268). Omit optional evidence blocks if empty. **Never** paste placeholder Unicode arrows; use ASCII `->` or words like “to”.

### 7.4 How to gather the data

| Field | Source | Rule |
|-------|--------|------|
| **To (@mention at top)** | Default: `@Alok Mendhe` (`712020:aa018f8d-2c6b-43a1-a859-ce6dd2544059`) | Greeting line: `Hi @Alok Mendhe ,`. User may change the person. Use ADF `mention` node. |
| **Customization Details** | Customer Issue description → "Customization Details" section | Bullet(s): what the customization does. For **umbrella** issues, use **nested sub-bullets** under one bold theme line (see §7.3 / UD-32268). |
| **Customization Node(s)** | Branch diff or user provides | One or more `NODE_<ProfileID>` — list under **Customization Nodes** comma-separated when multiple. |
| **Build No** | User provides | e.g. `#6198`. **Never invent.** If not shared, ask. |
| **Local Branch** | User provides | e.g. `101/UD-29932-user/krishna_2`. Optional line in comment when user shares it. |
| **Testing Env** | User provides | e.g. `CIS-QA.`, `CISQA2`, `Local`. If not shared, ask. |
| **Accounting** | Customer Issue description → "Accounting" field | e.g. "QuickBooks Desktop Enterprise US." |
| **Store** | Customer Issue description → "Store" field | e.g. "WooCommerce". |
| **Limitations** | Customer Issue description → "Limitations" section | Bullet list, copy from the Customer Issue. |
| **Impacted Area** | Agent-drafted, then user-confirmed | Agent shares its understanding of impacted areas. User confirms, edits, or adds. Include screenshots inline if user shares them. **Do not finalize without user confirmation.** |
| **QBD Items / WD Sync / WooCommerce item** | User provides optional evidence | Optional blocks after **Impacted Area** for screenshots or one-line notes (see §7.3). Omit entire blocks if nothing to show. |
| **Test Cases** | Agent-drafted, then user-confirmed | Agent drafts test cases based on the customization functionality flow. May include sub-bullets for value-specific scenarios (empty / 0 / > 0). User confirms, edits, or adds. **Do not finalize without user confirmation.** |
| **Screenshots** | User provides | Embed inline within **Impacted Area** or under **QBD Items** / **WD Sync** / **WooCommerce item** as in §7.3. If user does not share screenshots, omit those blocks. |
| **CC (@mention at bottom)** | Often `@Hitesh Devashrayee` (`5a4d00c0fed274297effdf04`) and `@Arvind Chavan` (`625e632060d67c0068d8080b`) on customization umbrella RFTs. Also: `@Tanay Khandelwal` (`60194dca47a954006935667c`), `@Aditya Farkya` (`712020:330a4c36-5f24-465a-9a87-837a5f664b74`) when user asks. | Always at the bottom. User may add/remove CC names. |

### 7.5 Workflow — always draft first, then post

1. **Identify target issue**: If the user named a key (Story or Customer Issue), use that. Otherwise, from the Story's `issuelinks`, find the linked **Customer Issue** and use that key.
2. **Gather**: Pull Customization Details, Accounting, Store, and Limitations from the Customer Issue (or Story) description; for umbrella work, list enhancements as **nested** bullets per §7.3.
3. **Ask for missing fields**: If Build No, Testing Env, Local Branch, or Customization Node(s) are not provided, present each missing field and let the user provide or skip.
4. **Draft Impacted Area**: Share your understanding of impacted areas based on the customization implementation. Ask the user to confirm or update.
5. **Draft Test Cases**: Share your understanding of test cases from the customization functionality flow. Ask the user to confirm or update.
6. **Draft full comment**: Present the complete comment to the user **in chat first** for review.
7. **Confirm CC**: Show the CC list and ask if the user wants to add or remove anyone.
8. **Post**: Only after the user **explicitly confirms**, post the comment to the **target issue** using `addCommentToJiraIssue`. Use markdown or ADF with proper mentions so Jira sends notifications.

### 7.6 @mention account IDs (known)

| Person | Email | Account ID |
|--------|-------|------------|
| Krishna Bankar | krishna.bankar@webgility.com | `712020:cb0bd6e5-b436-49f9-a0f5-6211a8cc8799` |
| Alok Mendhe | alok.mendhe@webgility.com | `712020:aa018f8d-2c6b-43a1-a859-ce6dd2544059` |
| Hitesh Devashrayee | hiteshd@webgility.com | `5a4d00c0fed274297effdf04` |
| Tanay Khandelwal | — | `60194dca47a954006935667c` |
| Aditya Farkya | — | `712020:330a4c36-5f24-465a-9a87-837a5f664b74` |
| Arvind Chavan | — | `625e632060d67c0068d8080b` |

When the user provides other names for CC or To, resolve them using `lookupJiraAccountId` before posting.

### 7.7 What NOT to do

- **Do not** post on the dev Story **when the team expects RFT on the Customer Issue** — unless the user **explicitly** chose a Story/umbrella key (§7.1).
- **Do not** add verbose implementation details, file-level diffs, RCA, or code-level analysis unless the user explicitly asks.
- **Do not** post the comment without showing the user first and getting explicit confirmation.
- **Do not** fabricate Build No, Testing Env, or any field the user has not provided.
- **Do not** skip the "draft first" step — always show in chat before posting to Jira.

---

## 8. Skill maintenance

When a session surfaces a **repeatable rule**, **API quirk**, or **better JQL** (e.g. fuzzy sprint matching, optional SP), **update this file** in the same PR or follow-up commit so the `jira-automation` agent stays accurate. Prefer small, concrete edits over one-off chat-only instructions.

---

## 9. Session notes file (scratch, not agent training)

Ephemeral analysis, one-off session summaries, or notes that **must not** become skill text may be written to:

- **`local/ephemeral/`** (gitignored root folder for arbitrary one-off files — see `krishnaaigen-ephemeral-output.md`),
- `logs/agent-session-notes.log` (entire `logs/` folder is typically gitignored by the Visual Studio template), **or**
- `.cursor/agent-session-notes.log` (also gitignored in this repo).

Agents should **not** treat those files as authoritative workflow; they are for the human or for “show me what you did” scratch space. Override the file freely.

---

## 10. Output Format

After each operation, reply with:

1. **Issue key(s)** created or updated (Story, subtasks).
2. **Status** of each issue after the operation.
3. **Sprint** (name + id + dates if set). If **omitted** for Kanban (board 894), state **Sprint: none / N/A** explicitly. If fuzzy match was used, state **user phrase → resolved sprint name (id)**.
4. **Story Points** (whether set, unchanged, or skipped per user).
5. **Original Estimate** per subtask (if set or changed; if skipped due to missing SP, say so). After **add/remove/delete/move** subtasks, list **every** subtask key with its **new** OE after §2.4.
6. **Worklogs** per subtask (hours logged, date).
7. **Actions performed** (creates, deletes/moves, **OE redistribution** on all affected subtasks, transitions, worklogs, comments, links).
8. **Redundant Story↔Sub-task issue links removed** (§1.11.1): link id(s) and peer key(s), or *none / not applicable*.
9. **Anything blocked** (permissions, workflow issues, missing fields).
