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

### 1.11 Sub-tasks and parent Story — parent only (no issue links)

- Sub-tasks are tied to the Story **only** via the standard **parent** relationship (Sub-task issue type + `parent` = Story key on create; see §1.5 and §6). Jira lists them under the Story’s **Subtasks** panel — no extra linking is needed.
- **Do not** create Jira **issue links** (e.g. Relates to, Blocks, implements) **between a Sub-task and its parent Story**. That duplicates hierarchy and clutters the **Links** section.
- **Do** create issue links when this skill **explicitly** requires them for **other** relationships (e.g. Story ↔ Customer Issue in §1.4).

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
3. **Rename sub-task:** `editJiraIssue` on the sub-task issue key; update `summary` only (preserve parent link). Renaming **does not** change **N** — no OE recalculation unless another structural change happened in the same request.
4. **Add subtasks:** `createJiraIssue` with `issueTypeName` Sub-task and `parent` = Story key; then **mandatory §2.4** (recompute OE on **all** subtasks under that Story when SP exists).
5. **Remove / delete subtask:** After the sub-task is removed or deleted (API or user-confirmed), **mandatory §2.4** on the parent Story for all remaining subtasks.
6. **Move subtask** (change parent to another Story): After parent update, **mandatory §2.4** on **both** source and destination Stories (each Story’s SP × 8 split across **its** current subtasks).
7. Summarize keys, **new OE per subtask** after any §2.4 run, and sprint (§1.9 fuzzy rules apply when assigning or confirming sprint).

---

## 7. Comment for QA Testing (Ready For Testing / RFT)

When the user asks to add a **Comment for QA Testing**, **RFT (Ready For Testing)** comment, or **customization testing comment** for QA, follow these rules strictly.

**Confluence mirror (CS templates / Public → template):** [Comment for QA Testing](https://webgility.atlassian.net/wiki/spaces/~712020cb0bd6e5b43649f9a0f56211a8cc8799/pages/3021209607/Comment+for+QA+Testing) · page ID `3021209607` · tiny `BwAUt` — use `getConfluencePage` when drafting so wording matches the published template.

**Exemplar in Jira:** [UD-31982 — focusedCommentId=236780](https://webgility.atlassian.net/browse/UD-31982?focusedCommentId=236780) (same structure as below).

### 7.1 Where to post

Post the RFT comment on the **Customer Issue** (e.g. UD-31982, issue type "Customer Issue"), **not** on the dev Story (e.g. UD-32097). The Customer Issue is the one QA monitors. Identify it from `issuelinks` on the Story (type "Relates", linked Customer Issue).

### 7.2 When to add the comment

Add **only** when the Jira issue status is (or is being transitioned to) **Ready For Testing**. The user will explicitly ask to post this comment.

### 7.3 Comment format (mandatory template)

Use this **structure** in ADF (headings, bullets, mentions). Always **draft first in chat**, show to the user, ask for explicit confirmation, then post using `addCommentToJiraIssue`. Match the live pattern from [UD-31982 RFT comment](https://webgility.atlassian.net/browse/UD-31982?focusedCommentId=236780): greeting line, `Customization Details:` with hyphen bullets, `### Limitations:` heading, `Impacted Area :` with bullets, optional evidence blocks, `Test Cases :`, `CC :`.

```
Hi @<QA Lead — default: Alok Mendhe> ,
Customization Details:

- <what the customization does — pull from Customer Issue description>
- Customization Node : <NODE_NAME> with profileID
- Build No : #<number> from <branch>
- Testing Env : <environment name — e.g. CISQA2>
- Accounting: <from Customer Issue — e.g. QuickBooks Desktop Enterprise US>
- Store: <from Customer Issue — e.g. WooCommerce>
### Limitations:

- <limitation 1 — from Customer Issue description>
- <limitation 2>
- ...
Impacted Area : 

- <area 1 — e.g. Product module / navigation path>
- <area 2 — may include inline screenshots if user shares them>
- ...
QBD Items : 

<optional screenshots or short evidence — omit section if empty>

WD Sync ReorderPoint :
<optional line or screenshot>

WooCommerce item : 
<optional line or screenshot>

Test Cases : 

- <test case 1>
- <test case 2 — sub-scenarios for empty / 0 / > 0 where applicable>
  - <sub-case>
  - <sub-case>
- ...

CC : @Hitesh Devashrayee @<additional CC the user specifies e.g. Tanay Khandelwal, Aditya Farkya>
```

**ADF note:** Render `### Limitations:` as a heading node; use list items for bullets under `Customization Details`, `Impacted Area`, and `Test Cases`. Omit optional blocks (`QBD Items` / `WD Sync` / `WooCommerce item`) if the user has no evidence to attach.

### 7.4 How to gather the data

| Field | Source | Rule |
|-------|--------|------|
| **To (@mention at top)** | Default: `@Alok Mendhe` (`712020:aa018f8d-2c6b-43a1-a859-ce6dd2544059`) | Greeting line: `Hi @Alok Mendhe ,`. User may change the person. Use ADF `mention` node. |
| **Customization Details** | Customer Issue description → "Customization Details" section | Bullet: what the customization does. Pull the text from the Customer Issue description. |
| **Customization Node** | Branch diff or user provides | `SYNC_REORDERPOINT` with profileID, etc. If known from implementation, pre-fill. If not, ask. |
| **Build No** | User provides | e.g. `#6190 from my local branch : 101/UD-31982-krishna`. **Never invent.** If not shared, ask. |
| **Testing Env** | User provides | e.g. `CISQA2`, `Local`, `Staging`. If not shared, ask. |
| **Accounting** | Customer Issue description → "Accounting" field | e.g. "QuickBooks Desktop Enterprise US." |
| **Store** | Customer Issue description → "Store" field | e.g. "WooCommerce". |
| **Limitations** | Customer Issue description → "Limitations" section | Bullet list, copy from the Customer Issue. |
| **Impacted Area** | Agent-drafted, then user-confirmed | Agent shares its understanding of impacted areas. User confirms, edits, or adds. Include screenshots inline if user shares them. **Do not finalize without user confirmation.** |
| **QBD Items / WD Sync / WooCommerce item** | User provides optional evidence | Optional blocks after **Impacted Area** for screenshots or one-line notes (see §7.3). Omit entire blocks if nothing to show. |
| **Test Cases** | Agent-drafted, then user-confirmed | Agent drafts test cases based on the customization functionality flow. May include sub-bullets for value-specific scenarios (empty / 0 / > 0). User confirms, edits, or adds. **Do not finalize without user confirmation.** |
| **Screenshots** | User provides | Embed inline within **Impacted Area** or under **QBD Items** / **WD Sync** / **WooCommerce item** as in §7.3. If user does not share screenshots, omit those blocks. |
| **CC (@mention at bottom)** | Default: `@Hitesh Devashrayee` (`5a4d00c0fed274297effdf04`). Additional defaults on customization issues: `@Tanay Khandelwal` (`60194dca47a954006935667c`), `@Aditya Farkya` (`712020:330a4c36-5f24-465a-9a87-837a5f664b74`) | Always at the bottom. User may add/remove CC names. |

### 7.5 Workflow — always draft first, then post

1. **Identify Customer Issue**: From the Story's `issuelinks`, find the linked Customer Issue key. Read it for description fields.
2. **Gather**: Pull Customization Details, Accounting, Store, and Limitations from the Customer Issue description.
3. **Ask for missing fields**: If Build No, Testing Env, or Customization Node are not provided, present each missing field and let the user provide or skip.
4. **Draft Impacted Area**: Share your understanding of impacted areas based on the customization implementation. Ask the user to confirm or update.
5. **Draft Test Cases**: Share your understanding of test cases from the customization functionality flow. Ask the user to confirm or update.
6. **Draft full comment**: Present the complete comment to the user **in chat first** for review.
7. **Confirm CC**: Show the default CC list and ask if the user wants to add or remove anyone.
8. **Post**: Only after the user **explicitly confirms**, post the comment to the **Customer Issue** using `addCommentToJiraIssue`. Use ADF format with proper `mention` nodes for all @mentions so Jira sends notifications.

### 7.6 @mention account IDs (known)

| Person | Email | Account ID |
|--------|-------|------------|
| Krishna Bankar | krishna.bankar@webgility.com | `712020:cb0bd6e5-b436-49f9-a0f5-6211a8cc8799` |
| Alok Mendhe | alok.mendhe@webgility.com | `712020:aa018f8d-2c6b-43a1-a859-ce6dd2544059` |
| Hitesh Devashrayee | hiteshd@webgility.com | `5a4d00c0fed274297effdf04` |
| Tanay Khandelwal | — | `60194dca47a954006935667c` |
| Aditya Farkya | — | `712020:330a4c36-5f24-465a-9a87-837a5f664b74` |

When the user provides other names for CC or To, resolve them using `lookupJiraAccountId` before posting.

### 7.7 What NOT to do

- **Do not** post on the dev Story — always post on the **Customer Issue**.
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

- **`local/ephemeral/`** (gitignored root folder for arbitrary one-off files — see `askai-ephemeral-output.md`),
- `logs/agent-session-notes.log` (entire `logs/` folder is typically gitignored by the Visual Studio template), **or**
- `.cursor/agent-session-notes.log` (also gitignored in this repo).

Agents should **not** treat those files as authoritative workflow; they are for the human or for “show me what you did” scratch space. Override the file freely.

---

## 10. Output Format

After each operation, reply with:

1. **Issue key(s)** created or updated (Story, subtasks).
2. **Status** of each issue after the operation.
3. **Sprint** (name + id + dates if available). If fuzzy match was used, state **user phrase → resolved sprint name (id)**.
4. **Story Points** (whether set, unchanged, or skipped per user).
5. **Original Estimate** per subtask (if set or changed; if skipped due to missing SP, say so). After **add/remove/delete/move** subtasks, list **every** subtask key with its **new** OE after §2.4.
6. **Worklogs** per subtask (hours logged, date).
7. **Actions performed** (creates, deletes/moves, **OE redistribution** on all affected subtasks, transitions, worklogs, comments, links).
8. **Anything blocked** (permissions, workflow issues, missing fields).
