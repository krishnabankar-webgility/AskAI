# daily-work-update — prompt routing (GitHub Copilot / VS Code)

Use this prompt to generate **Krishna's daily work digest** (yesterday / today / pending) and post it to Slack `#my-daily-work-update`.

**Load first**

1. `.cursor/skill-library/daily-work-update.md` — canonical procedure (window, JQL, Slack queries, Git queries, output format, posting rules)
2. `.cursor/skill-library/slack-integration.md`
3. `.cursor/skill-library/jira-workflow.md` (only §3 status semantics, §7 QA testing comment cross-links, §7.6 account-id table)
4. `.cursor/skill-library/bitbucket-unify-enterprise.md`
5. `.cursor/skill-library/git-sync.md`
6. `.cursor/skill-library/krishnaaigen-ephemeral-output.md`

**Behavior summary**

- Compute window in `Asia/Kolkata` (yesterday; Monday → since last Friday).
- Run Jira / Slack / Bitbucket+GitHub / Confluence sources in parallel; skip any missing source and record it in the footer.
- Categorize per the table in `daily-work-update.md` (Yesterday > Today > Pending; earliest bucket wins).
- Render the Slack `mrkdwn` template from the skill; empty sections render `_(nothing)_`.
- Manual run: render in chat, ask `Post to #my-daily-work-update? (yes / no / DM only)`. Scheduled run with `DAILY_UPDATE_AUTOSEND=1`: post directly.
- Read the previous day's digest from the channel first and deduplicate by link.

**Hard rules**

- Read-only on Jira, Bitbucket, GitHub, HubSpot.
- Write-only target: Slack `#my-daily-work-update` (or DM Krishna). Never post elsewhere.
- Mask credentials as `***`. No customer PII / full ticket bodies / source code.
- Never commit anything; scratch goes under `local/ephemeral/daily-work-update/`.

**Agent files:** `.cursor/agents/daily-work-update.md`, `.github/copilot/agents/daily-work-update.agent.md`.
