# Skill: Daily Work Update (Krishna)

## Purpose

Produce a single **daily work update** for Krishna Bankar.

The agent **internally computes** four detailed buckets so it can derive accurate counts, named items, and blockers:

1. **Yesterday — my work** *(internal)* — Jira items where Krishna acted (status change, comment, worklog), excluding anything that ended in `Ready For Testing` / `In Test` (those move to bucket 4). Plus meetings & discussions, status updates Krishna shared, and Git activity (commits, PRs, installer requests, QA testing comments).
2. **Today / In progress — my work** *(internal)* — Jira items currently `In Progress` AND assigned to Krishna; threads where Krishna is the active driver.
3. **Pending / Queue / TODO — my actionable work** *(internal)* — Jira items in `To Do` AND assigned to Krishna; Slack mentions / customer-issue comments where Krishna has been asked for a reply / decision / build / ETA and has not yet responded.
4. **Follow-ups (QA / others driving)** *(internal)* — Jira items currently in `RFT` / `Ready For Testing` / `Ready For Verification` / `In Test`; customer-issue Jira / Slack discussions where someone else is the next actor. Each line names *who* is driving.

Buckets §1–§4 are **computed only** — they are **not** part of the Slack message Krishna receives. They feed §5 and §6.

The Slack message itself contains **only**:

5. **High-level summary + Blockers** — counts (Done / In Progress / Pending / Follow-ups / meetings / discussions / commits / PRs / installer requests / QA testing comments). **Each non-zero count expands into indented sub-bullets that name the items** (Jira `UD-XXXX` + title; meeting topic + with-whom; update where + topic; commit branch + sha + fix hint; installer request `Build No.` + branch + included Jira IDs/titles cross-checked in `#func-wd-build-updates`). Followed by a derived **Blockers** list naming what is blocked, who Krishna is waiting on, for what action.
6. **TL;DR (summary of summary)** — exactly 4 short lines (each ≤140 chars) derived from §5 numbers only — no new facts, no IDs, no titles. Yesterday counts / Today counts / Pending + Follow-ups counts / `Blockers — N blocking; next action = "<one short imperative>"`.

The update is delivered automatically each weekday morning around **09:00 IST** to the public Slack channel **`#my-daily-update`** (channel id **`C0B0CBW8G03`**). The Cursor Slack bot is already a member, so no `/invite` is needed. If the channel is missing or Slack MCP is unavailable, fall back to **DM Krishna** (`U08FTS2SRAP`), then to chat.

This file is the **canonical** procedure. The Cursor agent at `.cursor/agents/daily-work-update.agent.md` and the Copilot mirror at `.github/copilot/agents/daily-work-update.agent.md` only point at this file.

---

## Identity / fixed inputs

| Field | Value |
|-------|-------|
| User display name | **Krishna Bankar** |
| Email | `krishna.bankar@webgility.com` |
| Jira account ID | `712020:cb0bd6e5-b436-49f9-a0f5-6211a8cc8799` |
| Slack user id | **`U08FTS2SRAP`** (resolve once via `slack_search_users "Krishna Bankar"` if rotated) |
| Slack delivery channel | **`#my-daily-update`** = id **`C0B0CBW8G03`** (public; Cursor bot already a member) |
| Slack timezone | `Asia/Kolkata` |
| Jira project (primary) | `UD` |
| Jira base URL | `https://webgility.atlassian.net` |
| Bitbucket repo | `webgility/unify-enterprise` |
| Krishna's git author in `unify-enterprise` | **`krishna.bankar`** (lowercase, dotted) |
| Krishna's GitHub login | **`krishnabankar-webgility`** |
| GitHub repo (this agent's home) | `krishnabankar-webgility/AskAI` |
| Customer-Issue automation author | **Atish Sinha** — Jira account id **`5af1e74db80fc222f236b257`** (HubSpot → Jira comment proxy) |
| Default timezone | **Asia/Kolkata (IST)** |
| Default schedule | Every weekday (Mon–Fri) at **09:00 IST** |

If `JIRA_EMAIL` (set in `.cursor/mcp.json`) is present, prefer Jira's own `currentUser()` JQL helper instead of hard-coding the account id — that keeps the skill correct if the user account is rotated.

---

## Required secrets / MCP servers

| Source | Variable / Server | Notes |
|--------|-------------------|-------|
| Slack MCP | `SLACK_BOT_TOKEN`, `SLACK_TEAM_ID` | See `slack-integration.skill.md`. Bot is already in `#my-daily-update`. |
| Jira MCP **or** REST | `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_BASE_URL` | See `.cursor/mcp.json` `jira` server. REST works without the MCP. |
| Bitbucket | `BITBUCKET_USERNAME`, `BITBUCKET_TOKEN` | See `bitbucket-unify-enterprise.md`. Used for commits/PRs in `unify-enterprise`. **REST returns 401 — use git only.** |
| GitHub | `gh` CLI (already authenticated in Cloud Agent) | Cloud Agent's `gh` runs as the bot `cursor`, so `--author=@me` is wrong — pass `--author=krishnabankar-webgility`. |
| Confluence (optional) | `CONFLUENCE_*` per `confluence-workflow.md` | Mirror RFT comments on `3021209607` if present. |

If any required secret is missing, **skip that source**, mention the gap in a small "Sources skipped" footer of the digest, and **do not block** the rest of the report.

---

## Time window

- **Yesterday window:** previous calendar day in IST, **00:00:00 to 23:59:59 IST** — i.e. for "now" = `2026-04-29 09:00 IST`, the window is `2026-04-28 00:00:00 +0530` → `2026-04-28 23:59:59 +0530`. Convert to UTC for any system that requires UTC (e.g. `git log --since/--until +0530`).
- **On Monday** (or after a holiday gap), expand to "since last working day" — Friday 00:00:00 IST through Monday 08:59:59 IST. Detect by checking the day-of-week of "now" in IST; if `now.weekday() == Mon`, set `since = last Friday 00:00:00 IST`.
- **Today / In progress:** anything currently `In Progress` **and assigned to Krishna**.
- **Pending:** `To Do` **and assigned to Krishna**, plus open threads where Krishna was @-mentioned but has not yet replied (i.e. action is on Krishna).
- **Follow-ups:** anything in `RFT` / `Ready For Testing` / `Ready For Verification` / `In Test` (regardless of assignee, since Krishna often hands off Stories to QA assigned to someone else); plus discussions where the next actor is **not** Krishna.

All timestamps in the rendered digest use **IST** (`Asia/Kolkata`, `+05:30`). Internally use ISO-8601 with timezone for queries.

---

## Data sources & queries

For every section below, run all queries in **parallel where possible** and **fail soft** — if one source errors, log the error in the footer and continue.

### A. Jira — issues Krishna touched

Use Jira MCP (`searchJiraIssuesUsingJql` or equivalent) **or** Jira REST directly with these JQLs. Prefer `currentUser()` over the literal account id when the bot account == Krishna; otherwise use the account id.

> **REST endpoint (2026):** Atlassian removed the legacy `GET /rest/api/3/search`. Use **`POST /rest/api/3/search/jql`** with body `{"jql": "...", "fields": [...], "maxResults": 50}` and Basic auth `${JIRA_EMAIL}:${JIRA_API_TOKEN}`. Pagination uses `nextPageToken` / `isLast`.

```jql
-- A1. Issues Krishna touched in the window (assignee/reporter scope, status changed, or comment by me)
project = UD
  AND (assignee = currentUser() OR reporter = currentUser())
  AND updated >= "2026-04-28" AND updated < "2026-04-29"
ORDER BY updated DESC
```

```jql
-- A2. Status changes BY Krishna in the window (uses changelog via expand=changelog)
project = UD AND status changed BY currentUser() AFTER "2026-04-28" BEFORE "2026-04-29"
ORDER BY updated DESC
```

```jql
-- A3. Currently In Progress AND assigned to Krishna
project = UD AND assignee = currentUser() AND status = "In Progress"
ORDER BY priority DESC, updated DESC
```

```jql
-- A4. To Do queue assigned to Krishna (only Krishna's own actionable items)
project = UD AND assignee = currentUser() AND status = "To Do"
ORDER BY "Priority Rank" ASC, priority DESC, created ASC
```

```jql
-- A5. Follow-ups: Stories Krishna handed to QA — RFT / In Test, regardless of assignee,
--     where Krishna was the last meaningful actor (assignee at some point, or last status-change-by)
project = UD
  AND status in ("Ready For Testing", "Ready For Verification", "In Test")
  AND ( assignee = currentUser()
        OR reporter = currentUser()
        OR "Original Assignee" = currentUser()       -- if available
        OR status changed BY currentUser() AFTER "-30d"
      )
ORDER BY updated DESC
```

```jql
-- A6. Mentioned to / discussed about Krishna in the window
project = UD AND text ~ "Krishna" AND updated >= "2026-04-28" AND updated < "2026-04-29"
ORDER BY updated DESC
```

```jql
-- A7. HubSpot-bridged customer issue updates: Atish Sinha activity in the window
project = UD AND issuetype = "Customer Issue"
  AND updated >= "2026-04-28" AND updated < "2026-04-29"
ORDER BY updated DESC
```

For every issue surfaced, fetch `expand=changelog,renderedFields` and **inspect**:

- **What did Krishna do?** Status transitions in the window where `author.accountId == ME`, comments where `author.accountId == ME`, worklog entries by Krishna. **The digest line MUST always say**: ``UD-XXXXX`` + **title** + a one-clause **what was done** verb (e.g. *moved In Progress→Done at 23:49 IST*, *commented "Build #6230 shared"*, *re-estimated to 4h*, *closed sub-task with 2h worklog*). Never list a Jira key without saying what Krishna did to it.
- **Status filter for Yesterday §1.1**: drop the issue if its **end-of-window status** is `Ready For Testing` / `Ready For Verification` / `In Test` — surface it under **§4 Follow-ups** instead.
- **Atish Sinha comments**: keep only ones that mention Krishna (account id `712020:cb0bd6e5-b436-49f9-a0f5-6211a8cc8799` or display name `Krishna`) **or** that update an issue Krishna has previously commented on; surface under **§4 Follow-ups** with the next actor named.

### B. Slack — messages relevant to Krishna

Use the Cursor Slack MCP. **Available tools:** `slack_search_public_and_private`, `slack_search_channels`, `slack_search_users`, `slack_read_thread`, `slack_read_channel`, `slack_send_message`. **Do NOT** call `slack_list_channels`, `slack_get_users`, or `slack_post_message` — those are protocol-spec names not exposed by this MCP.

1. **Resolve** Krishna's Slack `user_id` once via `slack_search_users "Krishna Bankar"` → `U08FTS2SRAP`.
2. **Mentions to Krishna in the window:**
   ```
   slack_search_public_and_private  query: "<@U08FTS2SRAP> after:2026-04-27 before:2026-04-29"
   ```
3. **Sent BY Krishna** in the window:
   ```
   slack_search_public_and_private  query: "from:@krishna.bankar after:2026-04-27 before:2026-04-29"
   ```
4. **Sent TO Krishna** (DMs, mentions in threads):
   ```
   slack_search_public_and_private  query: "to:@krishna.bankar after:2026-04-27 before:2026-04-29"
   ```
5. **Yesterday's digest** — `slack_search_public_and_private query: "in:#my-daily-update Daily Work Update"` so we can deduplicate.
6. For each message hit, also pull the **thread** via `slack_read_thread` so we can tell whether Krishna already replied. Items where Krishna is **the last replier** waiting on someone go into **§4 Follow-ups** (named: "awaiting <person>"). Items where Krishna was @-mentioned but **has not yet replied** go into **§3.2 Pending discussions**.

Skip any channel-wide message **not** containing `@here`, `@channel`, `<@U08FTS2SRAP>`, or `from:@krishna.bankar` (per Krishna's rule: "channel-wide stuff: include only if it concerns me; messages by me: track").

### C. Bitbucket / GitHub — code activity

Bitbucket `unify-enterprise` (Krishna's primary repo for product work). **Bitbucket REST at `api.bitbucket.org` returns 401 for the standard HTTP access token** (verified 2026-04-29) — only the git transport is reliably authenticated. Use git for everything.

```bash
# Auth + remote URL per bitbucket-unify-enterprise.md.
ENC_TOKEN=$(python3 -c "import os,urllib.parse; print(urllib.parse.quote(os.environ['BITBUCKET_TOKEN'], safe=''))")
git clone --depth 200 \
  "https://${BITBUCKET_USERNAME}:${ENC_TOKEN}@bitbucket.org/webgility/unify-enterprise.git" \
  /tmp/unify-enterprise

# `git clone --depth N` only fetches the default branch (master). Find Krishna's
# active branches via ls-remote and fetch them explicitly:
git -C /tmp/unify-enterprise ls-remote origin 2>/dev/null \
  | grep -iE "krishna|UD-32071|UD-29517|<other-active-keys-from-Jira-A1>"

git -C /tmp/unify-enterprise fetch --depth 50 origin \
  "refs/heads/<branch>:refs/remotes/origin/<branch>"

# Krishna's commits in the IST window across the fetched branches.
# Author is "krishna.bankar" (lowercase, dotted) — case-insensitive match.
git -C /tmp/unify-enterprise log --all \
  --since="2026-04-28 00:00 +0530" --until="2026-04-29 00:00 +0530" \
  --regexp-ignore-case --author="krishna" \
  --pretty=format:'%h | %ci | %an | %d | %s'

# Recent branches authored by Krishna (for the §1.4 line).
git -C /tmp/unify-enterprise for-each-ref --sort=-committerdate refs/remotes/origin/ \
  --format='%(committerdate:iso8601)|%(authorname)|%(refname:short)' \
  | awk -F'|' 'tolower($2) ~ /krishna/'
```

For PRs use the **Bitbucket MCP** when available (`getPullRequest`, `listPullRequests`, `getPullRequestComments`). Otherwise list URLs of branches matching `*krishna*` or `*UD-<key>*` for manual follow-up. **Do not** retry the REST API after a 401 — switch back to git.

GitHub (AskAI repo + any other repos in scope) — use the pre-authenticated `gh` CLI. The cloud agent's `gh` runs as the bot `cursor`, so `--author=@me` finds the bot, not Krishna. Use Krishna's GitHub login `krishnabankar-webgility` explicitly. `gh search prs` only accepts `--state {open|closed}`; query each separately or omit the flag.

```bash
KRISHNA_GH=krishnabankar-webgility
SINCE=$(TZ=UTC date -d 'TZ="Asia/Kolkata" yesterday 00:00' +%Y-%m-%d)

gh search prs --author=$KRISHNA_GH --updated=">=$SINCE" \
  --json number,title,state,url,updatedAt,repository --limit 30

gh pr list -R krishnabankar-webgility/AskAI --state all --limit 20 \
  --json number,title,state,url,createdAt,updatedAt,author
```

`gh search commits` rarely returns Krishna's `unify-enterprise` work because that repo is on **Bitbucket**, not GitHub — rely on §C step 3 above for product-code commits and use `gh` only for AskAI-style GitHub repos.

For each commit/PR surfaced, capture: repo, branch, short SHA / PR #, **subject (what was done)**, status (open/merged/draft), URL, link to any §7 QA-testing comment posted to Jira.

### D. (Optional) Confluence

If `confluence-workflow.md` mentions a "Comment for QA Testing" mirror page (`3021209607` / `BwAUt`) and the secrets are present, list any new child pages or comments authored by Krishna in the window.

---

## Categorization rules (where each item lands)

For every raw item from sources A–D:

| Bucket | Rule |
|--------|------|
| **§1.1 Yesterday — Jira (my work)** | Status changed in window by Krishna **OR** comment authored by Krishna in window **OR** worklog by Krishna. **Excludes** issues whose end-of-window status is `RFT` / `Ready For Testing` / `Ready For Verification` / `In Test` — those go to **§4 Follow-ups**. Sub-buckets: `Done` / `In Progress (advanced)` / `Commented / Worklogged`. **Every line:** `` `UD-XXXX` `` + title + verb-clause describing the action. |
| **§1.2 Meetings & discussions** | Slack message in window with keywords `meeting`, `huddle`, `call`, `discussion`, `notes`, `MOM`, `discord`, `gmeet`, `zoom`; OR any Google Calendar entry (if a calendar source is wired in later); OR Atish-Sinha comment on a Customer Issue containing `discussion`, `call`, `meeting`, `agreed`. |
| **§1.3 Status updates / fixes / resolutions shared by me** | Krishna-authored Slack message OR Jira comment OR Atish-Sinha bridged HubSpot reply containing `update`, `fix`, `resolution`, `RFT`, `posted`, `released`, `deployed`, `installer`, `build`, `share`. |
| **§1.4 Git activity (mine)** | Source C, plus any §7 QA-testing comment posted in the window. |
| **§2.1 Today — In Progress (mine)** | Jira `In Progress` AND `assignee = me`. |
| **§2.2 Today — Open threads I'm driving** | Slack threads where Krishna posted last but the topic is unresolved (no ✅ / `done` / `resolved` reaction) **and** the next action is Krishna's (e.g. agreed to investigate, share update, deliver build). |
| **§3.1 Pending — Jira queue (mine)** | `To Do` AND `assignee = me`, priority-sorted. |
| **§3.2 Pending — Discussions on me** | Slack mentions / DMs / customer-issue comments where someone has asked Krishna a question / for a decision / for help / for a build / for an ETA, and Krishna has not yet replied. |
| **§4.1 Follow-ups — Jira (QA / others)** | Status `RFT` / `Ready For Testing` / `Ready For Verification` / `In Test`, **regardless of assignee**. Line names **who** is driving (current assignee = QA), the QA reviewer (if known from the §7 comment CC), days since RFT, and whether QA has commented since handoff. |
| **§4.2 Follow-ups — Discussions where someone else owes me** | Threads / customer-issue comments where Krishna posted last and the next actor is **not** Krishna (e.g. "awaiting Faaque's check", "awaiting Lokesh's confirmation", Atish-Sinha comment on a CI Krishna previously commented on). |
| **§5.1 Summary counts** | Counts derived from §1–§4: `done`, `in_progress_started`, `in_progress_now` (§2.1), `pending_jira` (§3.1), `pending_discussions` (§3.2), `followups_qa` (§4.1), `followups_others` (§4.2), `meetings_discussions` (§1.2), `updates_shared` (§1.3), `commits`, `prs`, `installer_requests`, `qa_testing_comments`. **Each parent count must expand into indented sub-bullets** showing the *what / which*: see the §5.1 expansion rules below. |
| **§5.1 expansion rules — what each count expands to** | Each non-zero count line **must** carry one sub-bullet per item (truncate per-line ≤180 chars). Specifically: **done / in-progress started / in-progress now (Today §2.1)** → `` `UD-XXXX` `` + title (so Krishna can scan IDs & titles, not raw numbers). **meetings/discussions** → meeting title or topic + with-whom + duration. **updates shared** → who/where + one-line topic of the update. **commits** → branch + short SHA + one-line fix hint inferred from the commit subject. **PRs** → repo + PR# + state + one-line title. **installer requests** → cross-reference `#func-wd-build-updates` for the corresponding `Build No.` post; show **Build No. + branch + the Jira IDs from the `It's includes:` line + their titles**. If the build hasn't been shared yet, say `installer creation queued; build not yet posted to #func-wd-build-updates`. **Pending Jira (§3.1) and Follow-ups (§4)** → already detailed above; in §5 just keep the count line, no sub-bullets. **Pending discussions (§3.2)** → channel/thread + asker (no need to repeat the snippet from §3.2). |
| **§5.2 Blockers** | Auto-derived from §2–§4. Anything where Krishna's progress is held up by an external actor: an RFT / In Test item with **no QA activity for ≥24h**; a §4.2 thread with no reply in ≥24h; a Pending §3 item flagged as blocked in its last comment ("waiting on…", "blocked by…", "needs decision from…"); a sub-task whose parent Story is `In Progress` for someone else; an installer request whose build is overdue. Each blocker line names: the blocked Jira/thread, **who** Krishna is waiting on, and **for what action**. If there is no blocker, render `_(none — nothing externally blocking your work)_`. |
| **§6 TL;DR (summary of summary)** | Exactly **4 lines**, each ≤140 chars, **derived from the §5 numbers** — no new facts, no IDs, no titles. Line 1: *Yesterday — N done, N in-progress started, N meetings, N updates, N commits, N installer requests, N QA-testing comments*. Line 2: *Today — N in-progress on me, N threads I'm driving*. Line 3: *Pending — N Jira / N discussions on me · Follow-ups — N Jira (RFT/In Test) / N threads on others*. Line 4: *Blockers — `<blockers count>` blocking; next action = "<one short imperative>"*. The next-action sentence picks the single most important thing Krishna should do today (chase QA on the worst blocker, ping the longest-idle DM thread, deliver the closest-to-RFT story, etc.). If there are no blockers, line 4 becomes "*Blockers — none; next action = focus on `<top in-progress item title>`*". |

**Tie-breaker (no duplicates):** if an item could land in two buckets, prefer the **earliest** numbered bucket (Yesterday > Today > Pending > Follow-ups) **except** that **§1.1 Yesterday excludes anything currently in RFT/In Test** — those move to §4.1 even if Krishna acted on them yesterday (but the §1.3 line still records the QA comment Krishna posted as part of the handoff).

---

## Output format (Slack-flavored markdown)

The agent produces **one Slack message** containing **only §5 + §6** (Block Kit `mrkdwn`). Use **section headers** with emojis only because Slack rendering relies on them; keep the rest plain. Truncate any single bullet to ~280 chars, then add a link.

Buckets §1–§4 are **computed internally** to derive the §5 sub-bullets and the §6 next-action — they are **not** rendered in the Slack message. (If Krishna asks for the long detailed view, post §1–§4 separately on demand only; the default daily run posts §5 + §6 only.)

Every Jira sub-bullet under §5.1 **must** follow this shape: `` `UD-XXXX` <title>`` (status / verb-clause if it adds new info, otherwise omit to keep it scannable).

```
*:sunrise: Daily Work Update — <YYYY-MM-DD, ddd>*  (window: <YYYY-MM-DD> 00:00 → 23:59 IST)

*:bar_chart: 5. High-level summary*

_5.1 Counts (each parent line is followed by indented sub-bullets that name the items)_
• *Yesterday — done (<N>)*
    ◦ `<UD-XXXX>` <title>
    ◦ `<UD-XXXX>` <title>
• *Yesterday — in-progress started (<N>)*
    ◦ `<UD-XXXX>` <title>
• *Yesterday — meetings/discussions (<N>)*
    ◦ <meeting title or topic> — with <person(s)> — <duration if known>
• *Yesterday — updates shared (<N>)*
    ◦ <where (Slack channel / Jira key / DM person)> — <one-line topic>
• *Yesterday — commits (<N>)*
    ◦ `<branch>` `<short-sha>` — <one-line fix hint from subject>
• *Yesterday — PRs (<N>)*
    ◦ `<repo>` PR #<n> <state> — <title>
• *Yesterday — installer requests (<N>)* — _cross-checked in `#func-wd-build-updates`_
    ◦ Build No. <####> from `<branch>` — includes `<UD-XXXX>` <title> [, `<UD-XXXX>` <title>]
    ◦ _(if the build was not yet posted to `#func-wd-build-updates`)_ installer creation queued; build not yet posted
• *Yesterday — QA-testing comments (<N>)*
    ◦ `<UD-XXXX>` — comment for QA Testing posted, CC <names>
• *Today — in-progress on me (<N>)*
    ◦ `<UD-XXXX>` <title>  _(or, if non-Jira context: <one-line work context>)_
• *Today — threads I'm driving (<N>)*
    ◦ <channel> — <one-line topic>
• *Pending (action on me): <N> Jira · <N> discussions*  _(no sub-bullets — see §3 above)_
• *Follow-ups (others driving): <N> Jira (RFT/In Test) · <N> threads*  _(no sub-bullets — see §4 above)_

_5.2 Blockers (external dependencies holding up my work)_
• `<UD-XXXX>` <title> — _waiting on <who> for <what action> since <when>_ — <url>
• <channel/thread> — _<who> hasn't responded since <when>_ — <link>
_(or `_(none — nothing externally blocking your work)_`)_

*:zap: 6. TL;DR (summary of summary)*
> *Yesterday* — *<N>* done · *<N>* in-progress started · *<N>* meetings · *<N>* updates · *<N>* commits · *<N>* installer requests · *<N>* QA comments
> *Today* — *<N>* in-progress on me · *<N>* threads I'm driving
> *Pending* — *<N>* Jira / *<N>* discussions on me · *Follow-ups* — *<N>* Jira (RFT/In Test) / *<N>* threads on others
> *Blockers* — *<N>* blocking; *next action* = "<one short imperative>"

—
_Sources used: Jira ✅ · Slack ✅ · Bitbucket ✅ · GitHub ✅ · HubSpot (via Atish-Sinha bridge) ✅_
_Sources skipped: <list with reason, e.g. "Confluence — secret missing">_
_Generated by `daily-work-update` agent · canonical skill `.cursor/skill-library/daily-work-update.skill.md` · next run <when>_
```

When the digest is generated **outside** Slack (Cursor chat fallback), drop the Slack-only emoji codes and use the same headings as plain markdown.

If a section is **empty**, render `_(nothing)_` rather than dropping the header — Krishna prefers a complete checklist every day.

---

## Posting rules

1. **Resolve** the channel id for `#my-daily-update` via `slack_search_channels query: "my-daily-update"`. **Locked id:** `C0B0CBW8G03` (public channel; Cursor bot already a member). Do not search again unless the locked id stops working.
2. **One message per day, contains §5 + §6 only.** The Slack message **must include only** §5 (High-level summary + Blockers, with each non-zero count expanded into named sub-bullets) and §6 (TL;DR). Buckets §1 Yesterday / §2 Today / §3 Pending / §4 Follow-ups are computed internally to derive accurate counts and the next-action sentence — they are **not** posted. **Send as a single `slack_send_message` call.** Do not split into multiple posts, replies, or "v2 / addendum" follow-ups. If Krishna explicitly asks for the long view in chat, render §1–§4 in chat or post them as a thread reply on the day's main message — never as a new top-level message in `#my-daily-update`.
3. **Send** with **`slack_send_message`** (Cursor Slack MCP). The parameter is **`message`**, not `text`. Use Slack `mrkdwn` syntax (`*bold*`, `_italic_`, `<url|label>`). The protocol-spec name `slack_post_message` does **not** exist in this MCP.
4. If `#my-daily-update` does not resolve, fall back to **DM Krishna** by passing his Slack `user_id` `U08FTS2SRAP` as `channel_id` to `slack_send_message`. Add a one-line note at the top: `Channel #my-daily-update not resolved, DM-ing instead.` The single-message rule still applies to the DM.
5. If Slack MCP is unavailable, **render to Cursor chat as a single message** and tell Krishna to set up Slack secrets.
6. Mask any token / secret / email-with-token as `***` (per `slack-integration.skill.md` safety rules).
7. Never include source code snippets, customer PII, full QA testing comments, or HubSpot ticket bodies. Only short summaries with links.
8. Do **not** post duplicates — read the previous day's digest from `#my-daily-update` first (`slack_search_public_and_private query: "in:#my-daily-update Daily Work Update"`) and skip items whose link already appeared. The dedupe check counts a previous-day post as one **complete** digest (not the §5/§6 fragments from earlier iterations).

---

## Scheduling

Cursor / Copilot subagents do not run on a clock by themselves. Krishna prefers to wire this through **Cursor Automations / Scheduled Cloud Agents**. See "Cursor Automation setup" below for the full step-by-step.

Other supported triggers (opt-in only — do not commit GitHub Actions / cron files unless Krishna asks):

| Mechanism | Setup |
|-----------|-------|
| **Cursor scheduled cloud agent** *(preferred)* | Cursor Dashboard → Cloud Agents → New Schedule → "Mon–Fri 09:00 IST" → Branch `master` → Prompt = `/daily-work-update`. Secrets injected from the same dashboard. |
| **GitHub Actions** | Workflow `.github/workflows/daily-work-update.yml` (cron `30 3 * * 1-5` UTC = 09:00 IST Mon–Fri) calling the same prompt via the Cursor / Copilot CLI. |
| **Local cron / Windows Task Scheduler** | Krishna's machine triggers `cursor agent run /daily-work-update` at 09:00 local. |

When the scheduler fires, set the env var `DAILY_UPDATE_AUTOSEND=1` so the agent skips the manual confirm step and posts directly.

---

## Cursor Automation setup (copy/paste-ready)

Krishna runs this from **Cursor Dashboard → Cloud Agents → New Schedule** (or **Cursor Settings → Automations** in newer builds).

**1. Repository / branch:**

| Field | Value |
|-------|-------|
| Repository | `krishnabankar-webgility/AskAI` |
| Branch | `master` |
| Working directory | repo root (default) |

**2. Schedule:**

| Field | Value |
|-------|-------|
| Cron expression | `30 3 * * 1-5` (UTC) — equivalent to **09:00 IST Mon–Fri** |
| Timezone | `Asia/Kolkata` (if the form supports it; otherwise leave UTC and use the cron above) |

**3. Environment / secrets** (Cursor Dashboard → Cloud Agents → Secrets — already set today, just verify):

| Secret | Required for |
|--------|--------------|
| `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_BASE_URL` | Jira REST/MCP |
| `SLACK_BOT_TOKEN`, `SLACK_TEAM_ID` | Slack MCP (write to `#my-daily-update`) |
| `BITBUCKET_USERNAME`, `BITBUCKET_TOKEN` | `unify-enterprise` clone & `git log` |
| `DAILY_UPDATE_AUTOSEND=1` | Skip the chat confirm and post straight to Slack |

**4. Prompt:**

```
/daily-work-update

Run my daily work digest now for the previous IST calendar day (00:00–23:59 IST).
Follow .cursor/skill-library/daily-work-update.skill.md exactly:
- Yesterday §1: only items I worked on; exclude anything currently in RFT / In Test.
- Today §2: my In-Progress Jira + threads I'm driving.
- Pending §3: only items assigned to me OR a question waiting on my reply.
- Follow-ups §4: RFT / In Test (QA-driven) and threads where someone else owes me.
- The Slack message contains ONLY §5 (High-level summary + Blockers) and §6 (TL;DR).
  Sections §1 Yesterday / §2 Today / §3 Pending / §4 Follow-ups are computed
  internally to derive the §5 sub-bullets and the §6 next-action; they are NOT
  posted to Slack.
- §5 High-level summary + Blockers: parent count lines (done / in-progress /
  meetings / discussions / updates / commits / PRs / installer requests / QA
  testing comments / today / pending / follow-ups), each non-zero parent
  expanded into indented sub-bullets naming the items (UD-XXXX + title for Jira;
  topic + with-whom for meetings; one-line fix hint for commits; branch + Build
  No. + Jira IDs+titles for installer requests, cross-checked in
  #func-wd-build-updates). Pending and Follow-ups keep just the count line. Then
  an explicit Blockers list naming what's blocked, who I'm waiting on, for what
  action. If none, render "(none — nothing externally blocking your work)".
- §6 TL;DR (summary of summary) at the very bottom: exactly 4 short lines derived
  from §5 numbers only (no IDs, no titles): Yesterday counts / Today counts /
  Pending + Follow-ups counts / "Blockers — N blocking; next action = ...". If
  no blockers, next action = focus on top in-progress item title.
Every Jira line must show UD-XXXX + title + what I did.
Post to #my-daily-update (channel id C0B0CBW8G03) as ONE single Slack message
containing ONLY §5 (High-level summary + Blockers, with each non-zero count
expanded into named sub-bullets) and §6 (TL;DR). Sections §1 Yesterday /
§2 Today / §3 Pending / §4 Follow-ups are computed internally to derive
accurate counts and the next-action sentence, but are NOT posted. Do not
split into multiple posts, replies, or "v2 / addendum" follow-ups.
DAILY_UPDATE_AUTOSEND=1 is set, so skip the confirm step and post directly.
If anything fails, list it in "Sources skipped" and still post the single
heartbeat (§5 + §6 only).
```

**5. Verify:**

After saving, click **Run now once** in the Cursor Dashboard. Expected behavior:

- Cloud Agent boots, reads `.cursor/skill-library/daily-work-update.skill.md`.
- Runs the Jira / Slack / Bitbucket / GitHub queries described above (see *Data sources & queries*).
- Posts a single message to `#my-daily-update` (channel id `C0B0CBW8G03`).
- Records nothing in `.cursor/`, `src/`, or any tracked path. Scratch goes under `local/ephemeral/daily-work-update/<YYYY-MM-DD>/` (gitignored).

If you ever need to trigger ad-hoc, just type **`/daily-work-update`** in any Cursor chat — without `DAILY_UPDATE_AUTOSEND=1` it will preview in chat and ask "Post to #my-daily-update? (yes / no / DM only)".

---

## Output for Cursor session (when invoked manually)

When Krishna runs `/daily-work-update` directly in chat, the agent must:

1. Detect "now" in IST and compute the window (`yesterday 00:00 → 23:59 IST`).
2. Run sources A–D in parallel.
3. Render the digest in chat **first**.
4. Ask one confirm: *"Post to `#my-daily-update`? (yes / no / DM only)"*.
5. On `yes` → post via `slack_send_message` to channel `C0B0CBW8G03`. On `DM only` → DM Krishna (`U08FTS2SRAP`). On `no` → leave it in chat. (When invoked by the **scheduler**, skip the confirm and post directly — the scheduler injects an env var `DAILY_UPDATE_AUTOSEND=1` to mark autonomy.)

---

## Failure / fallback behavior

- **Slack MCP missing** → render in chat; print one-liner `Slack MCP not connected — see slack-integration.skill.md`.
- **Jira MCP / REST failing** → skip Jira sections, render placeholders, footer note.
- **Bitbucket auth failing** → skip §1.4 commit lines, list `git fetch` error in footer.
- **No items in any source** → still post a digest with all-`_(nothing)_` sections; Krishna wants the heartbeat.
- **Partial errors** are listed in the *Sources skipped* footer (see template).

---

## Privacy & safety

- Never include raw HubSpot ticket bodies, customer PII, account numbers, or build artifacts.
- Mask all secrets / URLs containing tokens as `***`.
- Do **not** create / modify Jira issues, post Jira comments, transition issues, push code, or send Slack messages to other channels — this agent is **read-only** for Jira / Bitbucket / GitHub and **write-only** for the single Slack channel `#my-daily-update` (or DM Krishna).
- For any "RFT" or §7 QA-testing follow-up the agent finds, just **link** to it under §4 — let `/jira-automation` actually file the comment.

---

## Learnings locked in (do not re-discover)

The first live runs surfaced these gotchas. Future invocations **must skip re-discovery** and use the stated value directly:

| Topic | Locked-in answer |
|-------|------------------|
| Slack delivery channel | **`#my-daily-update`** (NOT `#my-daily-work-update`) — id **`C0B0CBW8G03`**; Cursor bot already invited. |
| Slack write tool | **`slack_send_message`** with parameter **`message`** (not `text`). `slack_post_message` does not exist in this MCP. |
| Slack channel listing | **`slack_search_channels`** (no `slack_list_channels`). |
| Slack user lookup | **`slack_search_users`** (no `slack_get_users`). |
| Krishna's Slack id | **`U08FTS2SRAP`** |
| Jira search REST | **`POST /rest/api/3/search/jql`** (legacy `GET /rest/api/3/search` was removed). Pagination = `nextPageToken` / `isLast`. |
| Jira issue detail | `GET /rest/api/3/issue/{key}?expand=changelog,renderedFields` for comments + status history. |
| Jira me account id | `712020:cb0bd6e5-b436-49f9-a0f5-6211a8cc8799` |
| Jira Atish account id | `5af1e74db80fc222f236b257` |
| Bitbucket REST | Returns **401** for the HTTP access token at `api.bitbucket.org`. Use **git only** — do not retry REST. |
| Bitbucket commit author | **`krishna.bankar`** (lowercase, dotted). Match with `--regexp-ignore-case --author="krishna"`. |
| `git clone --depth N` scope | Only fetches the **default branch** (`master`). For Krishna's feature branches, `ls-remote | grep krishna` then `git fetch --depth 50 origin <branch>`. |
| `gh` identity in Cloud Agent | Runs as bot **`cursor`** — `--author=@me` is wrong. Use `--author=krishnabankar-webgility`. |
| `gh search prs --state` values | Only `{open|closed}`. Either query each separately or omit. |
| Single-message rule | The Slack message **must** ship as ONE `slack_send_message` call — never split into "v2 / addendum" follow-ups. |
| Posted-content rule | The Slack message contains **only §5 + §6**. Sections §1 Yesterday / §2 Today / §3 Pending / §4 Follow-ups are **computed internally** to feed the §5 sub-bullets and the §6 next-action sentence, but are **never posted** to `#my-daily-update` (Krishna asked to drop them — the high-level summary already names every item via §5.1 sub-bullets, and the TL;DR sits below it). If Krishna explicitly asks for the long view, render §1–§4 in chat or post them as a thread reply to the day's main message — never as a new top-level message. |

When **anything** new becomes a "I had to figure this out" moment during a run, append a row to this table (or update an existing one) **before** ending the session. The Cursor agent at `.cursor/agents/daily-work-update.agent.md` is also responsible for this and points back here.

---

## Future extensions (not built yet)

- **Google Calendar** — meeting list for yesterday + today (requires a Google MCP / OAuth client).
- **HubSpot direct API** — replace the Atish-Sinha bridge once HubSpot read access is available.
- **Weekly digest** — same agent, different window (`since = -7d`), posted Monday 09:00 IST.

When any of these is wired in, append the source/query to this file and the categorization table.
