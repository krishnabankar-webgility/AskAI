# daily-work-update — prompt routing (GitHub Copilot / VS Code)

Use this prompt to generate **Krishna's daily work digest** (yesterday / today / pending) and post it to Slack `#my-daily-work-update`.

**Load first**

1. `.cursor/skill-library/daily-work-update.skill.md` — canonical procedure (window, JQL, Slack queries, Git queries, output format, posting rules)
2. `.cursor/skill-library/slack-integration.skill.md`
3. `.cursor/skill-library/jira-workflow.skill.md` (only §3 status semantics, §7 QA testing comment cross-links, §7.6 account-id table)
4. `.cursor/skill-library/bitbucket-unify-enterprise.skill.md`
5. `.cursor/skill-library/git-sync.skill.md`
6. `.cursor/skill-library/krishnaaigen-ephemeral-output.skill.md`

**Behavior summary**

- Compute window in `Asia/Kolkata` — previous calendar day **00:00:00 → 23:59:59 IST** (Monday → since last Friday).
- Run Jira / Slack / Bitbucket+GitHub / Confluence sources in parallel; skip any missing source and record it in the *Sources skipped* footer.
- Categorize per the table in `daily-work-update.skill.md`. Hard rules:
  - **§1.1 Yesterday** excludes Jiras currently in `RFT` / `Ready For Testing` / `Ready For Verification` / `In Test` — those move to **§4.1 Follow-ups**.
  - **§3.1 Pending** = `To Do` AND `assignee = me` only.
  - **§3.2 Pending** = mentions/DMs awaiting Krishna's reply.
  - **§4 Follow-ups** = QA-driven Jiras + threads where someone else owes Krishna; name who is driving.
  - **§5 High-level summary + Blockers** = counts derived from §1–§4. Each non-zero parent count expands into indented sub-bullets that name the items (Jira → `UD-XXXX` + title; meetings → topic + with-whom; updates → where + one-line topic; commits → branch + short-sha + one-line fix hint; PRs → repo + PR# + state + title; **installer requests** are cross-checked in `#func-wd-build-updates` for Build No. + branch + Jira IDs/titles from `It's includes:`; Pending §3 and Follow-ups §4 keep just the count line). Then an explicit Blockers list (RFT/In Test idle ≥24h, §4.2 threads idle ≥24h, Pending items with "waiting on…", overdue builds); each blocker names what's blocked, who Krishna is waiting on, for what action. If none, render `_(none — nothing externally blocking your work)_`.
  - **§6 TL;DR (summary of summary)** = exactly 4 short lines derived from §5 numbers only (no IDs, no titles): Yesterday counts / Today counts / Pending + Follow-ups counts / `Blockers — N blocking; next action = "<one short imperative>"`. If no blockers, next action = focus on the top in-progress item title.
  - **Every Jira line** = `` `UD-XXXX` `` + title + what was done + URL.
- Render the Slack `mrkdwn` message containing **only §5 (High-level summary + Blockers) and §6 (TL;DR)** from the skill. Sections §1–§4 are computed internally to derive the §5 sub-bullets and §6 next-action — they are NOT posted to Slack. Send as ONE `slack_send_message` call; never split into "v2 / addendum" follow-ups.
- Manual run: render the §5 + §6 draft in chat, ask `Post to #my-daily-update? (yes / no / DM only)`. Scheduled run with `DAILY_UPDATE_AUTOSEND=1`: post the single §5 + §6 message directly to channel id `C0B0CBW8G03`.
- Read the previous day's digest from `#my-daily-update` first and deduplicate by link.

**Hard rules**

- Read-only on Jira, Bitbucket, GitHub, HubSpot.
- Write-only target: Slack `#my-daily-update` (id `C0B0CBW8G03`; Cursor bot already invited) or DM Krishna (`U08FTS2SRAP`). Never post elsewhere.
- Mask credentials as `***`. No customer PII / full ticket bodies / source code.
- Never commit anything; scratch goes under `local/ephemeral/daily-work-update/`.

**Agent files:** `.cursor/agents/daily-work-update.agent.md`, `.github/copilot/agents/daily-work-update.agent.md`, `.github/agents/daily-work-update.agent.md`.
