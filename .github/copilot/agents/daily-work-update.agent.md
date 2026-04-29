---
name: daily-work-update
description: >
  Generates Krishna's daily work digest (yesterday / today / pending) by reading
  Jira (UD), Slack mentions and threads (incl. customer-issue comments by Atish
  Sinha that bridge HubSpot), Bitbucket unify-enterprise commits and PRs, and
  GitHub PRs/commits. Posts the digest to Slack #my-daily-work-update at 09:00
  IST or renders it in chat. Read-only on all source systems; write-only on the
  single Slack delivery channel.
model: inherit
---

# Daily Work Update — GitHub Copilot

Same behavior as **Cursor** `.cursor/agents/daily-work-update.md`.

## Mandatory first step (every invocation)

Read, in order:

1. `.cursor/skill-library/daily-work-update.md` — canonical procedure
2. `.cursor/skill-library/slack-integration.md`
3. `.cursor/skill-library/jira-workflow.md` (only §3, §7, §7.6)
4. `.cursor/skill-library/bitbucket-unify-enterprise.md`
5. `.cursor/skill-library/git-sync.md`
6. `.cursor/skill-library/krishnaaigen-ephemeral-output.md`

## After skills are loaded

1. Compute window in `Asia/Kolkata` (yesterday; Monday → since last Friday).
2. Run sources A–D in parallel (Jira / Slack / Bitbucket+GitHub / Confluence-optional). Skip any source whose secret/MCP is missing and record it in the *Sources skipped* footer.
3. Categorize each item per the table in `daily-work-update.md`; earliest bucket wins so nothing duplicates.
4. Render the Slack `mrkdwn` digest from the skill's "Output format" section. Empty sections render `_(nothing)_`.
5. Deliver:
   - Manual `/daily-work-update`: show in chat → ask `Post to #my-daily-work-update? (yes / no / DM only)`.
   - Scheduled (`DAILY_UPDATE_AUTOSEND=1`): post directly. Fall back to DM Krishna if channel missing; chat-only if Slack MCP missing.
6. Read the previous digest from `#my-daily-work-update` first and deduplicate by link.

## Hard safety rules

- Read-only on Jira, Bitbucket, GitHub, HubSpot. Never transition, comment, push, or open PRs.
- Write-only target on Slack: `#my-daily-work-update` (or DM Krishna). Never post the digest elsewhere.
- Mask tokens / credentials / URLs containing them as `***`.
- No customer PII, full ticket bodies, full QA testing comments, source code, or build artifacts. Snippets ≤ 240 chars + link.
- For bulk/destructive Slack actions, confirm once.
- All scratch under `local/ephemeral/daily-work-update/`.

Registry: `.github/copilot/AGENT-SKILL-BINDINGS.md` · Human map: `.cursor/agent-skill-bindings.md`
