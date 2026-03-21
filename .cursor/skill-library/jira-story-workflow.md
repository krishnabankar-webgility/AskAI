# Skill: Jira story creation from customer issues

Use this skill when creating Stories/subtasks from Customer Issues and applying Desktop-Customization defaults.

## Input (collect if missing)

| Field | Required | Notes |
|-------|----------|--------|
| Customer Issue ID | Yes | Jira key, e.g. `CUST-123` |
| Story Points | Yes | Numeric (e.g. `2`, `2.5`) |
| Sprint | No | Sprint name; if omitted, auto-detect next **14–15 day** customization sprint |

## 1. Core capability

When a **Customer Issue** key is provided (or confirmed), you may perform full Jira operations **via available Jira/Atlassian MCP tools or APIs** in the session:

- Create Story and Subtasks  
- Update status (allowed transitions only; if blocked, explain and suggest next step)  
- Add comments / replies  
- Assign users  
- Set or update story points  
- Log work  

If no Jira integration is available, **state that clearly** and output the exact fields, JQL, and steps a human or Jira Automation should run—do not invent issue keys.

## 2. Story creation workflow

### 2.1 From Customer Issue

1. **Read** the Customer Issue: summary, description, attachments metadata, **Due Date**, **QA Date** (or equivalent custom fields—use project field names you discover), labels, components, links.  
2. **Create a Story** under the appropriate project (same as Customer Issue unless user specifies otherwise) with:  
   - Title/summary derived from the Customer Issue (clear, actionable).  
   - Description that references the Customer Issue key and links or quotes essential context.  
   - **Link** the new Story to the Customer Issue (e.g. “implements” / “is caused by” / project-standard link type).  

### 2.2 Subtasks (exactly three)

Create under the new Story:

1. **Analysis**  
2. **Implementation**  
3. **Unit Testing**  

Ensure subtasks are **children of the Story** (standard subtask issue type).

### 2.3 Default Story settings

Apply unless the user overrides in the prompt:

| Field | Value |
|--------|--------|
| **Priority** | **P2** |
| **Team** | **Desktop-Customization** (team field name may be custom—map to the project’s team field) |
| **Assignee** | **krishna bankar** (resolve to account ID if the API requires it) |
| **Story Points** | From input `{{STORY_POINTS}}` |
| **Due Date** | Copied from Customer Issue |
| **QA Date** | Copied from Customer Issue (same field id/name as on source) |
| **Sprint** | `{{SPRINT_NAME}}` if provided; else **auto-detect** the active or next **14–15 day** customization sprint and assign Story + all subtasks |

**Idempotency:** Before creating, search for an existing Story already linked to this Customer Issue for the same breakdown; if found, **do not duplicate**—report the existing Story and offer to update instead.

## 3. Status and permissions

When operating on issues the user identified:

- You **may** change status (respect workflow).  
- You **may** add comments and replies.  
- You **may** assign users.  
- You **may** update story points.  

If a transition fails, capture the error, add a short comment on the issue if appropriate, and tell the user what permission or transition is missing.

## Output format (mandatory)

After each run, reply with:

1. **Story ID**  
2. **Subtask IDs** (Analysis, Implementation, Unit Testing)  
3. **Assigned sprint** (name + dates if available)  
4. **Worklog per subtask** (hours logged, date if set)  
5. **Actions performed** (creates, transitions, comments, assignments, field updates)  
6. **Anything blocked** (permissions, workflow, missing fields)  

## Quick reference — template inputs

```
Customer Issue ID: {{JIRA_ID}}
Story Points: {{STORY_POINTS}}
Sprint: {{SPRINT_NAME (optional)}}
```

You translate these into MCP/API calls and the rules above.

**Note:** Time-based triggers (true “on sprint close” without user involvement) require **Jira Automation** or similar in Jira itself. This agent executes the **same policy** when invoked in Cursor or when the user describes the event.
