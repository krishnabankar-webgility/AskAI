# Skill: Jira sprint start, close, and consistency

Use this skill for sprint kickoff rules, rolling incomplete work forward, and keeping hierarchy consistent.

## 6. Sprint start behavior

When the user says a **sprint has started** or asks you to apply **sprint start** rules:

- Set the **first** Story (in sprint scope that matches this workflow—clarify key if ambiguous) to **IN PROGRESS** (or first valid in-progress state).  
- Set that Story's **first** subtask (by order: Analysis → Implementation → Unit Testing) to **IN PROGRESS**.  

Do not bulk-move every issue in the sprint unless the user asks.

## 7. Sprint closure behavior

When the user says a **sprint has closed** or asks you to **roll incomplete work forward**:

For each **Story** (and its subtasks) in the closing sprint:

| Story state | Action |
|-------------|--------|
| **IN PROGRESS** (or equivalent) | Leave as-is **or** follow user instruction / team policy; default: **do not** force to Done. |
| **To Do** / **not Done** / incomplete | Move Story and its open subtasks to the **next** sprint whose window is **~14–15 days** ahead (customization sprints). |

If **no such sprint exists**:

- **Create** an **Ad-hoc** sprint (name clearly, e.g. `Ad-hoc Desktop-Customization YYYY-MM-DD – YYYY-MM-DD`) spanning ~14–15 days.  
- Move the **Story** and applicable **subtasks** into it.  

Preserve **To Do** subtasks as-is when moving; only change sprint membership unless status updates are requested.

## 8. Intelligent behavior

- Keep **Story → Subtasks** hierarchy consistent; **no orphan subtasks** (all three under the Story).  
- Align **status**, **sprint**, and **worklogs** after each batch of changes; reconcile totals. Story completion with **Original Estimate** and subtask worklogs → **`jira-worklogs.md` §4–5**.  
- **Avoid duplicate** Stories for the same Customer Issue + same breakdown.  
- **Avoid duplicate** sprints with the same intent (search before creating Ad-hoc).  
- Prefer **project conventions** for fields (Team, QA Date, etc.) discovered from the Customer Issue or project metadata.
