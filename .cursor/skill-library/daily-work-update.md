# Skill: Daily Work Update (Krishna)

## Purpose

Produce a single **daily work update** for Krishna Bankar that summarizes:

1. **Yesterday** — closed/in-progress Jira work, meetings & discussions, status updates / fixes / resolutions shared on Slack/Jira/HubSpot (via Atish-Sinha automation), and Git activity (commits, PRs, builds, QA testing comments).
2. **Today / In progress** — Jira items currently `In Progress`, threads still open in Slack / Jira / customer-issue Jira (via HubSpot Atish-Sinha automation), things planned to start today.
3. **Pending / Queue / Future / TODO** — Jira items in `To Do`, RFT items waiting on QA, comments/updates yet to share, meetings yet to attend, discussions not yet started.

The update is delivered automatically each weekday morning around **09:00 IST** to the Slack channel **`#my-daily-work-update`** (DM with Krishna's bot or private channel). If Slack is unreachable it is rendered into the Cursor chat instead.

This file is the **canonical** procedure. The Cursor agent at `.cursor/agents/daily-work-update.md` and the Copilot mirror at `.github/copilot/agents/daily-work-update.agent.md` only point at this file.

---

## Identity / fixed inputs

| Field | Value |
|-------|-------|
| User display name | **Krishna Bankar** |
| Email | `krishna.bankar@webgility.com` |
| Jira account ID | `712020:cb0bd6e5-b436-49f9-a0f5-6211a8cc8799` |
| Slack handle (resolve at runtime) | `@Krishna Bankar` (use `slack_get_users` to map to user ID) |
| Slack delivery channel | `#my-daily-work-update` (fallback: DM Krishna) |
| Jira project (primary) | `UD` |
| Bitbucket repo | `webgility/unify-enterprise` |
| GitHub repo | `krishnabankar-webgility/AskAI` |
| Customer-Issue automation author | **Atish Sinha** (HubSpot → Jira comment proxy) |
| Default timezone | **Asia/Kolkata (IST)** |
| Default schedule | Every weekday (Mon–Fri) at **09:00 IST** |

If `JIRA_EMAIL` (set in `.cursor/mcp.json`) is present, prefer Jira's own `currentUser()` JQL helper instead of hard-coding the account id — that keeps the skill correct if the user account is rotated.

---

## Required secrets / MCP servers

| Source | Variable / Server | Notes |
|--------|-------------------|-------|
| Slack MCP | `SLACK_BOT_TOKEN`, `SLACK_TEAM_ID` | See `slack-integration.md`. Bot must be in `#my-daily-work-update`. |
| Jira MCP | `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_BASE_URL` | See `.cursor/mcp.json` `jira` server. |
| Bitbucket | `BITBUCKET_USERNAME`, `BITBUCKET_TOKEN` | See `bitbucket-unify-enterprise.md`. Used for commits/PRs in `unify-enterprise`. |
| GitHub | `gh` CLI (already authenticated in Cloud Agent) | Used for AskAI commits/PRs and run logs. |
| Confluence (optional) | `CONFLUENCE_*` per `confluence-workflow.md` | Mirror RFT comments on `3021209607` if present. |

If any required secret is missing, **skip that source**, mention the gap in a small "Sources skipped" footer of the digest, and **do not block** the rest of the report.

---

## Time window

- **Yesterday window:** previous calendar day in IST, **00:00–23:59 IST**.
- **On Monday** (or after a holiday gap), expand to "since last working day" — Friday 00:00 IST to Monday 08:59 IST. Detect by checking the day-of-week of "now" in IST; if `now.weekday() == Mon`, set `since = last Friday 00:00 IST`.
- **Today / In progress:** anything currently `In Progress` for Krishna OR last touched within the previous 24h that is not yet `Done`/`Closed`/`Won't Do`.
- **Pending:** `To Do`, RFT (`Ready For Testing` / `Ready For Verification`) waiting on QA, plus open threads where Krishna was the last poster waiting on someone else, and threads where Krishna was @-mentioned but has not replied.

All timestamps in the rendered digest use **IST** (`Asia/Kolkata`, `+05:30`). Internally use ISO-8601 with timezone for queries.

---

## Data sources & queries

For every section below, run all queries in **parallel where possible** and **fail soft** — if one source errors, log the error in the footer and continue.

### A. Jira — issues Krishna touched

Use Jira MCP (`searchJiraIssuesUsingJql` or equivalent) with these JQLs. Prefer `currentUser()` over the literal account id when the bot account == Krishna; otherwise use the account id.

```jql
-- Yesterday window — anything Krishna closed, moved, or worked
project = UD
  AND (assignee = currentUser() OR reporter = currentUser())
  AND updated >= "-1d"
ORDER BY updated DESC
```

```jql
-- Status changes by Krishna in the window (uses changelog via expand=changelog)
project = UD
  AND status changed BY currentUser() AFTER "-1d"
ORDER BY updated DESC
```

```jql
-- Comments authored by Krishna in the window
project = UD
  AND comment ~ "krishna"  -- fallback if comment author filter not available
  AND updated >= "-1d"
```
> When the MCP exposes a comment-author search, prefer it. Otherwise `expand=changelog,renderedFields` and filter comments client-side by `author.accountId == 712020:cb0bd6e5-...`.

```jql
-- Currently In Progress
project = UD
  AND assignee = currentUser()
  AND status = "In Progress"
ORDER BY priority DESC, updated DESC
```

```jql
-- RFT / Ready For Testing waiting on QA
project = UD
  AND assignee = currentUser()
  AND status in ("Ready For Testing", "Ready For Verification")
ORDER BY updated DESC
```

```jql
-- TODO / queue
project = UD
  AND assignee = currentUser()
  AND status = "To Do"
ORDER BY "Priority Rank" ASC, priority DESC, created ASC
```

```jql
-- Mentioned to Krishna in the last 24h (or since-last-working-day)
project = UD
  AND text ~ "Krishna" AND updated >= "-1d"
```
> Replace with native `mention = currentUser()` if the MCP supports it; otherwise filter rendered comment ADF for `accountId = 712020:cb0bd6e5-...`.

```jql
-- HubSpot-bridged customer issue updates: comments by Atish Sinha
project = UD
  AND issuetype = "Customer Issue"
  AND updated >= "-1d"
```
> Then read each issue's recent comments (`expand=renderedFields`) and **keep only** comments whose `author.displayName == "Atish Sinha"`. From those, surface the ones that **mention** Krishna OR that Krishna has previously replied on.

For each Jira issue surfaced, capture: key, summary, status, last status change (status from → to, by whom, when), last comment (author, snippet ≤180 chars), URL `${JIRA_BASE_URL}/browse/<KEY>`.

### B. Slack — messages relevant to Krishna

Use the Slack MCP (`slack_search_public_and_private`, `slack_search_channels`, `slack_search_users`, `slack_read_thread`, `slack_read_channel`).

1. **Resolve** Krishna's Slack `user_id` once via `slack_get_users` / `slack_search_users` (display name + email match).
2. **Mentions to Krishna in the last 24h** across all accessible channels:
   ```
   slack_search_public_and_private  query: "<@KRISHNA_USER_ID>"  after: <yesterday IST 00:00>
   ```
3. **Direct messages (DMs)** to/from Krishna in the window:
   ```
   slack_search_public_and_private  query: "from:@KrishnaBankar"  after: ...
   slack_search_public_and_private  query: "to:@KrishnaBankar"   after: ...
   ```
4. **Personal Slack channel `#my-daily-work-update`** — read the last digest (so we do not duplicate items from yesterday and we can append "no new updates" placeholders).
5. For each message hit, also pull the **thread** via `slack_read_thread` so we can tell whether Krishna already replied. Items where Krishna is **the last replier** go into "Today / awaiting their response". Items where Krishna is mentioned but **has not yet replied** go into "Pending — discussion to do".

Skip any channel message **not** containing `@here`, `@channel`, `<@KRISHNA_USER_ID>`, or `from:@KrishnaBankar` (per the user's rule: "channel-wide stuff: include only if it concerns me; messages by me: track").

### C. Bitbucket / GitHub — code activity

Bitbucket `unify-enterprise` (Krishna's primary repo for product work):

```bash
# 1. Make sure auth + remote URL are set per bitbucket-unify-enterprise.md.
# 2. Fetch only — never push from this agent.
git -C $UNIFY_CLONE fetch --all --quiet

# 3. Krishna's commits in the last 24h on every branch.
git -C $UNIFY_CLONE log --all --since="yesterday 00:00" \
    --author="Krishna" --pretty=format:'%h%x09%ci%x09%d%x09%s'

# 4. Branches Krishna pushed in the window.
git -C $UNIFY_CLONE for-each-ref --sort=-committerdate refs/remotes/bitbucket/ \
    --format='%(committerdate:iso8601)%09%(authorname)%09%(refname:short)' \
  | awk -F'\t' '$2 ~ /Krishna/ {print}'
```

For PRs use the **Bitbucket MCP** when available (`getPullRequest`, `listPullRequests`, `getPullRequestComments`). Otherwise list URLs of branches starting with `krishna/` or matching `UD-*krishna*` for manual follow-up.

GitHub (AskAI repo + any other repos in scope) — use the pre-authenticated `gh` CLI:

```bash
gh search prs --author=@me --updated=">=$(date -u -d 'yesterday 00:00' +%Y-%m-%d)" \
  --state=all --json number,title,state,url,updatedAt,repository
gh search commits --author=@me --committer-date=">=$(date -u -d 'yesterday 00:00' +%Y-%m-%d)" \
  --json sha,commit,repository,url
```

For each commit/PR surfaced, capture: repo, branch, short SHA / PR #, title, status (open/merged/draft), URL, link to any QA-testing comment posted to Jira (cross-reference §7 of `jira-workflow.md`).

### D. (Optional) Confluence

If `confluence-workflow.md` mentions a "Comment for QA Testing" mirror page (`3021209607` / `BwAUt`) and the secrets are present, list any new child pages or comments authored by Krishna in the window.

---

## Categorization rules (where each item lands)

For every raw item from sources A–D:

| Bucket | Rule |
|--------|------|
| **§1.1 Jira worked yesterday** | Status changed in window OR last comment by Krishna in window. Sub-buckets: `Done` / `RFT` / `In Progress`. |
| **§1.2 Meetings & discussions** | Slack message in window with keywords `meeting`, `huddle`, `call`, `discussion`, `notes`, `MOM`; OR any Google Calendar entry (if a calendar source is wired in later); OR Atish-Sinha comment on a Customer Issue containing `discussion`, `call`, `meeting`, `agreed`. |
| **§1.3 Status updates / fixes / resolutions shared** | Krishna-authored Slack message OR Jira comment OR Atish-Sinha bridged HubSpot reply containing `update`, `fix`, `resolution`, `RFT`, `posted`, `released`, `deployed`. |
| **§1.4 Git activity** | Source C, plus any §7 QA-testing comment posted in the window. |
| **§2.1 In progress today** | Jira `In Progress` for Krishna. |
| **§2.2 Today's running threads** | Slack threads where Krishna posted last but the topic is unresolved (no ✅ / `done` / `resolved` reaction). |
| **§3.1 Pending Jira** | `To Do` (priority-sorted), and `RFT` items not picked up by QA in >24h. |
| **§3.2 Pending discussions** | Slack mentions where Krishna has not yet replied; Atish-Sinha customer-issue comments mentioning Krishna with no Krishna comment after them. |
| **§3.3 Future / planned** | Sub-tasks under Krishna's `In Progress` Stories that are still `To Do` (i.e. work queued behind current task). |

If an item could land in two buckets, prefer the **earliest** bucket (Yesterday > Today > Pending) so nothing is reported twice.

---

## Output format (Slack-flavored markdown)

The agent produces one Slack message (Block Kit `mrkdwn`). Use **section headers** with emojis only because Slack rendering relies on them; keep the rest plain. Truncate any single bullet to ~240 chars, then add a link.

```
*:sunrise: Daily Work Update — <YYYY-MM-DD, ddd>*  (window: <since> → <until> IST)

*:white_check_mark: 1. Yesterday*

_1.1 Jira_
• *Done* — `<UD-XXXX>` <summary> · _moved <from>→Done at HH:MM IST_ · <url>
• *RFT* — `<UD-XXXX>` <summary> · _RFT comment posted HH:MM_ · <url>
• *In progress (advanced)* — `<UD-XXXX>` <summary> · <url>

_1.2 Meetings & discussions_
• <slack/jira/HubSpot snippet> — <link>

_1.3 Status updates / fixes shared_
• <where> — <snippet> — <link>

_1.4 Git_
• `<repo>` `<branch>` `<short-sha>` <commit subject> — <url>
• PR #<n> <state> — <title> — <url>

*:hammer_and_wrench: 2. Today / In progress*

_2.1 Jira (In Progress)_
• `<UD-XXXX>` <summary> · last update <when> · <url>

_2.2 Open threads / running discussions_
• <channel> — "<snippet>" — <url>   _(awaiting <person> reply)_

*:hourglass_flowing_sand: 3. Pending / Queue / TODO*

_3.1 Jira queue_
• `<UD-XXXX>` <summary> · status `To Do` · Priority Rank <n> · <url>
• `<UD-XXXX>` <summary> · status `RFT` waiting on QA since <when> · <url>

_3.2 Discussions to do_
• <channel> — "<snippet>" — <url>   _(@-mention to you, no reply yet)_

_3.3 Future / planned sub-tasks_
• `<UD-XXXX>` <summary> — under `<UD-PARENT>` — <url>

—
_Sources used: Jira ✅ · Slack ✅ · Bitbucket ✅ · GitHub ✅ · HubSpot (via Atish-Sinha bridge) ✅_
_Sources skipped: <list with reason, e.g. "Confluence — secret missing">_
_Generated by `daily-work-update` agent · next run <when>_
```

When the digest is generated **outside** Slack (Cursor chat fallback), drop the Slack-only emoji codes and use the same headings as plain markdown.

If a section is **empty**, render `_(nothing)_` rather than dropping the header — Krishna prefers a complete checklist every day.

---

## Posting rules

1. **Resolve** the channel id for `#my-daily-work-update` via `slack_list_channels` (cache only for the run; do **not** persist).
2. **Send** with `slack_post_message` — single message, Block Kit + mrkdwn fallback.
3. If the channel does not exist, fall back to **DM Krishna** (`slack_get_users` → `slack_post_message`); add a one-line note "channel `#my-daily-work-update` not found, DM-ing instead".
4. If Slack MCP is unavailable, **render to Cursor chat** and tell Krishna to set up Slack secrets.
5. Mask any token / secret / email-with-token as `***` (per `slack-integration.md` safety rules).
6. Never include source code snippets, customer PII, full QA testing comments, or HubSpot ticket bodies. Only short summaries with links.
7. Do **not** post duplicates — read the previous day's digest from `#my-daily-work-update` first; skip items whose link already appeared.

---

## Scheduling

Cursor / Copilot subagents do not run on a clock by themselves. Use one of:

| Mechanism | Setup |
|-----------|-------|
| **Cursor scheduled cloud agent** (preferred) | Cursor Dashboard → Cloud Agents → New Schedule → "Daily 09:00 IST" → Branch `master` → Prompt = `/daily-work-update`. Secrets injected from the same dashboard. |
| **GitHub Actions** | Workflow `.github/workflows/daily-work-update.yml` (cron `30 3 * * 1-5` UTC = 09:00 IST Mon–Fri) calling the same prompt via the Cursor / Copilot CLI. |
| **Local cron / Windows Task Scheduler** | Krishna's machine triggers `gh` or `cursor agent run /daily-work-update` at 09:00 local. |

Do **not** commit a new GitHub Actions workflow as part of adding this agent — only do that when the user explicitly opts in (so the schedule does not start surprising them). The agent file documents the cron that they can enable.

---

## Output for Cursor session (when invoked manually)

When Krishna runs `/daily-work-update` directly in chat, the agent must:

1. Detect "now" in IST and compute the window.
2. Run sources A–D in parallel.
3. Render the digest in chat **first**.
4. Ask one confirm: *"Post to `#my-daily-work-update`? (yes / no / DM only)"*.
5. On `yes` → post via Slack MCP. On `DM only` → DM Krishna. On `no` → leave it in chat. (When invoked by the **scheduler**, skip the confirm and post directly — the scheduler injects an env var `DAILY_UPDATE_AUTOSEND=1` to mark autonomy.)

---

## Failure / fallback behavior

- **Slack MCP missing** → render in chat; print one-liner `Slack MCP not connected — see slack-integration.md`.
- **Jira MCP missing** → skip Jira sections, render placeholders, footer note.
- **Bitbucket auth failing** → skip §1.4 commit lines, list `git fetch` error in footer.
- **No items in any source** → still post a digest with three `_(nothing)_` sections; Krishna wants the heartbeat.
- **Partial errors** are listed in the *Sources skipped* footer (see template).

---

## Privacy & safety

- Never include raw HubSpot ticket bodies, customer PII, account numbers, or build artifacts.
- Mask all secrets / URLs containing tokens as `***`.
- Do **not** create / modify Jira issues, post Jira comments, transition issues, push code, or send Slack messages to other channels — this agent is **read-only** for Jira / Bitbucket / GitHub and **write-only** for the single Slack channel `#my-daily-work-update` (or DM Krishna).
- For any "RFT" or §7 QA-testing follow-up the agent finds, just **link** to it — let `/jira-automation` actually file the comment.

---

## Future extensions (not built yet)

- **Google Calendar** — meeting list for yesterday + today (requires a Google MCP / OAuth client).
- **HubSpot direct API** — replace the Atish-Sinha bridge once HubSpot read access is available.
- **Weekly digest** — same agent, different window (`since = -7d`), posted Monday 09:00 IST.

When any of these is wired in, append the source/query to this file and the categorization table.
