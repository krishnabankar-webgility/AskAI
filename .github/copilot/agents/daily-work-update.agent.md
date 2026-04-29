---
name: daily-work-update
description: >
  Generates Krishna's daily work digest (Yesterday / Today / Pending / Follow-ups) by
  reading Jira (UD), Slack mentions and threads (incl. customer-issue comments by Atish
  Sinha that bridge HubSpot), Bitbucket unify-enterprise commits and PRs, and GitHub
  PRs/commits. Posts to Slack #my-daily-update (id C0B0CBW8G03; Cursor bot already
  invited) at 09:00 IST or renders in chat. Read-only on all source systems; write-only
  on the single Slack delivery channel.
model: inherit
---

# Daily Work Update — GitHub Copilot

Same behavior as **Cursor** `.cursor/agents/daily-work-update.md`. The canonical skill includes a "Learnings locked in" table — trust it and skip rediscovery.

## Mandatory first step (every invocation)

Read, in order:

1. `.cursor/skill-library/daily-work-update.md` — canonical procedure (incl. **Cursor Automation setup** and **Learnings locked in** table)
2. `.cursor/skill-library/slack-integration.md`
3. `.cursor/skill-library/jira-workflow.md` (only §3 status semantics — including **In Test** and **RFT**, §7, §7.6)
4. `.cursor/skill-library/bitbucket-unify-enterprise.md`
5. `.cursor/skill-library/git-sync.md`
6. `.cursor/skill-library/krishnaaigen-ephemeral-output.md`

## After skills are loaded

1. Compute window in `Asia/Kolkata` — previous calendar day **00:00:00 → 23:59:59 IST** (Monday → since last Friday).
2. Run sources A–D in parallel (Jira / Slack / Bitbucket+GitHub / Confluence-optional). Skip any source whose secret/MCP is missing and record it in the *Sources skipped* footer.
   - Jira: prefer `searchJiraIssuesUsingJql` MCP, else `POST /rest/api/3/search/jql` (legacy `/search` was removed).
   - Slack: this MCP exposes `slack_search_public_and_private`, `slack_search_channels`, `slack_search_users`, `slack_send_message` (parameter `message`, not `text`), `slack_read_thread`. There is **no** `slack_list_channels` / `slack_get_users` / `slack_post_message`. Krishna's user id is `U08FTS2SRAP`.
   - Bitbucket: use `git` only (REST returns 401 for HTTP access tokens). `git clone --depth N` only fetches default branch; fetch Krishna's branches by name. Match commits with `--regexp-ignore-case --author="krishna"` (commit author = `krishna.bankar`).
   - GitHub: `gh` runs as the `cursor` bot in Cloud Agents — pass `--author=krishnabankar-webgility` explicitly. `gh search prs --state` accepts only `open|closed`.
3. Categorize per the table in `daily-work-update.md`. **Hard rules:**
   - **§1.1 Yesterday** excludes any Jira whose end-of-window status is `RFT` / `Ready For Testing` / `Ready For Verification` / `In Test` — those move to **§4.1 Follow-ups**.
   - **§3.1 Pending** = `To Do` AND `assignee = me` only (RFT / In Test / not-assigned-to-me are **not** Krishna's pending).
   - **§3.2 Pending** = mentions/DMs awaiting Krishna's reply.
   - **§4 Follow-ups** = QA-driven Jiras (RFT / In Test, regardless of assignee, where Krishna handed off) + threads where someone else owes Krishna; name **who** is driving.
   - **Every Jira line** in any section: `` `UD-XXXX` `` + title + what was done verb-clause + URL.
4. Render the Slack `mrkdwn` digest from the skill's "Output format" section. Empty sections render `_(nothing)_`.
5. Deliver via `slack_send_message` (`channel_id` + `message`):
   - Manual `/daily-work-update`: show in chat → ask `Post to #my-daily-update? (yes / no / DM only)`.
   - Scheduled (`DAILY_UPDATE_AUTOSEND=1`): post directly to channel `C0B0CBW8G03` (`#my-daily-update`). Fall back to DM Krishna (`U08FTS2SRAP` as `channel_id`) if channel missing; chat-only if Slack MCP missing.
6. Read the previous digest from `#my-daily-update` first and deduplicate by link.

## Persist new learnings

When this run discovers anything not already in the **Learnings locked in** table at the bottom of `daily-work-update.md`, append/update that table before ending the session.

## Hard safety rules

- Read-only on Jira, Bitbucket, GitHub, HubSpot. Never transition, comment, push, or open PRs.
- Write-only target on Slack: `#my-daily-update` (or DM Krishna). Never post the digest elsewhere.
- Mask tokens / credentials / URLs containing them as `***`.
- No customer PII, full ticket bodies, full QA testing comments, source code, or build artifacts. Snippets ≤ 280 chars + link.
- For bulk/destructive Slack actions, confirm once.
- All scratch under `local/ephemeral/daily-work-update/`.

Registry: `.github/copilot/AGENT-SKILL-BINDINGS.md` · Human map: `.cursor/agent-skill-bindings.md`
