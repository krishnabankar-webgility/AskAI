# Skill: Create a UD Jira issue (any work type)

Use this skill when the user asks to **create a new Jira issue** in project **UD** with a chosen **issue type**, without forcing fields they did not mention—not only the Customer Issue → Story flow from `jira-story-workflow.md`.

## Required input

| Parameter | Required | Notes |
|-----------|----------|--------|
| **Issue type** | **Yes** | Exact Jira name, e.g. `Task`, `Story`, `Bug`, `Customer Issue`, `Epic`. Use project/issue-type metadata if unsure. |

## Optional inputs (only if the user provides them)

**Rule:** For every field below, **set it only when the user explicitly supplies a value** in the request. If they omit it, **do not** send that field—leave it **unset** so Jira uses project defaults / empty.

| If user provides… | Map to |
|-------------------|--------|
| **Summary / title** | `summary` on `createJiraIssue`. |
| **Description** | `description`, `contentFormat`: `markdown` when appropriate. |
| **Assignee** (e.g. Krishna Bankar, email) | `assignee_account_id` — resolve with `lookupJiraAccountId`. Example: Krishna Bankar → `712020:cb0bd6e5-b436-49f9-a0f5-6211a8cc8799` (`krishna.bankar@webgility.com`). |
| **Priority** (e.g. P2) | `additional_fields.priority` — e.g. P2 → `{ "id": "3" }` on Webgility; confirm via issue type metadata if needed. |
| **Story points** | `additional_fields.customfield_10053` (number). |
| **Team name** (e.g. Desktop-Customization) | `additional_fields.customfield_10075` — e.g. Desktop-Customization → `{ "id": "11209" }` on UD; confirm allowed options via `getJiraIssueTypeMetaWithFields` if create fails. |
| **Sprint** (name or id) | `additional_fields.customfield_10010` — sprint **numeric id** only. Resolve name → id via JQL / `getJiraIssue` on an issue in that sprint (see below). If user gives no sprint, **omit** the field. |

**Do not** apply Krishna / P2 / Desktop-Customization / story points / sprint **unless the user asked for them** in this request.

### Summary when the user gives no title

`createJiraIssue` requires `summary`. If the user only gives issue type:

- Use a minimal placeholder: **`{IssueType} — [summary pending]`** (or one short line they implied in chat), **or**
- Ask for a one-line summary **once** before creating.

Never leave `summary` empty on the API call.

### Status

Do **not** transition after create unless the user asks. Report the **actual** status Jira returns (often **To Do** by default).

## Field map (Jira Cloud / UD)

| Concept | `additional_fields` key |
|--------|-------------------------|
| Story points | `customfield_10053` |
| Sprint | `customfield_10010` (numeric sprint id) |
| Team name (select) | `customfield_10075` |

Re-verify ids with `getJiraIssueTypeMetaWithFields` if the project changes.

### Resolving sprint id from a name (only when user provided a sprint)

1. `searchJiraIssuesUsingJql`: e.g. `project = UD AND sprint in openSprints()`, fields `customfield_10010`, **or**  
2. `getJiraIssue` on a reference issue; read `customfield_10010[].id` / `name`.  
3. If the name cannot be matched, **omit** sprint and tell the user to set it in Jira.

## MCP steps (Atlassian)

1. **cloudId** from MCP / `searchAtlassian` metadata / prior calls.  
2. Build **`createJiraIssue`**:  
   - Always: `projectKey`: `UD`, `issueTypeName` from user, `summary` (from user or placeholder rule above).  
   - **Only if provided:** `description`, `assignee_account_id`, and each key in `additional_fields` (priority, `customfield_10053`, `customfield_10075`, `customfield_10010`).  
3. Return **issue key**, **URL**, and list **only the fields you actually set**.

## Conflicts with other skills

- **Customer Issue → Story + subtasks + worklogs** → `jira-story-workflow.md` (+ related skills).  
- **Single UD ticket, optional fields** → **this skill**.

## Instance note

Field ids above match **Webgility UD** as authored; adjust if metadata differs.
