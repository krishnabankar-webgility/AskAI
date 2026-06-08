# Skill: Daily Work Update (Krishna)

## Purpose

Produce a single **daily work update** for Krishna Bankar.

### Internal buckets (derivation only — feeds the visible sections)

The agent **internally computes** four buckets so counts, names, blockers, and TL;DR stay accurate:

1. **Yesterday — my work** — Jira where Krishna acted (status change, comment, worklog), excluding items whose **end-of-window** status is `Ready For Testing` / `In Test` (those go to Follow-ups). Plus **Google Calendar meetings** (§E), updates, git activity, QA/installer lines, and **📌 HubSpot / Customer Issue bridge** comments (§A8).
2. **Today / In progress** — `In Progress` ∧ assignee = Krishna; threads Krishna is driving; **today's scheduled Google Calendar meetings** (§E).
3. **Pending** — `To Do` ∧ assignee = Krishna; Slack/DM/customer-issue threads **waiting on Krishna’s reply**.
4. **Follow-ups** — RFT / In Test / etc.; threads where **someone else** is the next actor.

### Posted message — layout (match Krishna’s reference layout)

Send **one** Slack `mrkdwn` message. **Always use this order** — section **1 → 2 → 3 → 4 → 5** (never open with Blockers or TL;DR):

1. **Title** — `*Daily Work Update — <ddd>, MMM D, YYYY>*` (use the **report run date** in IST for the title; inside the body, label **Yesterday** and **Today** with their calendar dates, e.g. *Yesterday (Apr 30)* / *Today (May 1)*).
2. **Separator** — a plain line such as `────────────────────────`.
3. **Yesterday (<MMM DD>)** — subsections with emojis (see **Emoji legend** below). **Omit any subsection whose count is 0** — do **not** print “Nothing”, empty bullets, or placeholder rows.
4. **Separator**
5. **Today (<MMM DD>)** — 🔄 *In Progress (N):* plus optional thread-driving lines. **If there is nothing for Today, omit the entire Today block** (including its separator pair — collapse double separators).
6. **Separator**
7. **Pending** — 🟣 *Action on me:* and 👀 *Follow-ups (others driving):* **only with non-zero counts** (or omit that bullet line). **If both counts are 0, omit the whole Pending section**.
8. **Separator**
9. **🚨 Blockers — N Items** *(optional subtitle e.g. `(Action Required: Chase <name>)` when all share same owner)* — **only when N ≥ 1**. Use a **fixed-width table inside a fenced code block** (Slack has no real HTML tables). Columns: **Jira | Description | Idle Since | Status**. Then a ***Next action:*** line. **If there are zero blockers, omit this entire section** (no “0 blockers” noise).
10. **Separator**
11. **TL;DR** — short **prose** (2–4 sentences), same spirit as the reference: weave Yesterday / Today / Pending / Blockers **only for dimensions that actually appeared** above; may mention counts (“nothing else”, “1 commit”) without inventing hidden sections.

**Emoji legend — Yesterday**

| Emoji | Meaning |
|-------|---------|
| ✅ | Done (yesterday — Krishna closed/moved to Done or equivalent per §1.1 rules) |
| 🔄 | In Progress Started (yesterday — advanced but not landing in RFT/In Test per §1.1) |
| 💬 | Meetings / Updates (includes 📅 Google Calendar meetings from §E1) |
| 🔀 | Commits *(N)* |
| 📬 | PRs / Installers / QA Comments |
| 📌 | Customer Issue / **HubSpot bridge** — Atish Sinha comments containing **`%HubSpot Note%`** only when Krishna is in-scope per §A8 |

Optional 📌 line for *verified-by-others* items (e.g. colleague moved tickets Done): keep concise with `` `UD-XXXX` `` + clause + link.

The update is delivered automatically each weekday morning around **09:00 IST** to **`#my-daily-update`** (**`C0B0CBW8G03`**). Fall back to **DM Krishna** (`U08FTS2SRAP`), then chat.

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
| Customer-Issue automation author | **Atish Sinha** — Jira account id **`5af1e74db80fc222f236b257`** (HubSpot → Jira comment proxy); HubSpot sync lines use marker **`%HubSpot Note%`** in comment body |
| Default timezone | **Asia/Kolkata (IST)** |
| Default schedule | Every weekday (Mon–Fri) at **09:00 IST** |

If `JIRA_EMAIL` (set in `.cursor/mcp.json`) is present, prefer Jira's own `currentUser()` JQL helper instead of hard-coding the account id — that keeps the skill correct if the user account is rotated.

---

## Required secrets / MCP servers

| Source | Variable / Server | Notes |
|--------|-------------------|-------|
| Slack MCP | `SLACK_BOT_TOKEN`, `SLACK_TEAM_ID` | See `slack-integration.skill.md`. Bot is already in `#my-daily-update`. |
| Jira MCP **or** REST | `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_BASE_URL` | See `.cursor/mcp.json` `jira` server. REST works without the MCP. |
| Bitbucket | `BITBUCKET_USERNAME`, `BITBUCKET_TOKEN` | See `bitbucket-unify-enterprise.skill.md`. **Only** source for repo commits/PRs in the digest (`unify-enterprise`). **REST returns 401 — use git (+ BB MCP if configured).** |
| Google Workspace MCP **or** direct API | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `USER_GOOGLE_EMAIL`, `GOOGLE_REFRESH_TOKEN` | **`google-workspace`** MCP via `uvx workspace-mcp` (Calendar + Gmail + Drive, read-only). On **Cloud Agents** where MCP is unavailable, `GOOGLE_REFRESH_TOKEN` enables the **direct API fallback** via `scripts/google-calendar-fallback.py` and `scripts/google-gmail-fallback.py`. Run `scripts/bootstrap-google-credentials.py` first. |
| Confluence (optional) MCP **or** REST | `JIRA_EMAIL`, `JIRA_API_TOKEN` (shared with Jira) | **New pages only** in the Yesterday window (§D). Uses Atlassian MCP (`plugin-atlassian-atlassian`) when connected; otherwise falls back to `scripts/confluence-fallback.py` using the same Jira credentials (Atlassian API tokens work for both Jira and Confluence REST). Do **not** report edits to existing pages. |

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

For every section below (A–E), run all queries in **parallel where possible** and **fail soft** — if one source errors, log the error in the footer and continue.

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
-- A7. HubSpot-bridged customer issue signals: Customer Issues touched in the window
--     (issue-level updated — fast filter before A8 comment scan)
project = UD AND issuetype = "Customer Issue"
  AND updated >= "2026-04-28" AND updated < "2026-04-29"
ORDER BY updated DESC
```

```jql
-- A7b. Backup: any UD issue touched in the window whose visible text suggests HubSpot bridge
--     (catches keys where issuetype is not "Customer Issue" but Atish/HS commentary exists)
project = UD AND updated >= "2026-04-28" AND updated < "2026-04-29"
AND text ~ "hubspot"
ORDER BY updated DESC
```

### A8. Customer Issue **comments** — HubSpot / Atish bridge (mandatory — catches UD-29517-style misses)

Issue-level `updated` in JQL **can lag or omit comment-only activity**. You **must** pull **comments** for Customer Issues and surface qualifying bridge notes in **Yesterday → 📌** using the **strict** rules below.

1. **Candidates:** (a) all keys from **A7**; (b) all keys from **A7b**; (c) plus `project = UD AND issuetype = "Customer Issue" AND updated >= -14d` capped at **40** keys (dedupe); (d) if Krishna or the scheduler names explicit keys (e.g. `UD-29517`), **always** include those keys even if outside A7/A7b.
2. For each key, fetch comments: **`GET /rest/api/3/issue/{key}/comment?orderBy=-created&maxResults=50`** (or MCP equivalent). If unavailable, use **`GET /rest/api/3/issue/{key}?fields=comment`**.
3. Keep comments whose **`created`** timestamp falls in the **same Yesterday IST window** as §Time window (or Monday-expanded window).
4. **Include** a comment **only if all** of the following hold:
   - **Author** is **Atish Sinha**: `author.accountId == 5af1e74db80fc222f236b257` (HubSpot → Jira proxy).
   - **Marker:** rendered/plain body contains the substring **`%HubSpot Note%`** (HubSpot-templated updates from this bridge). If Atlassian strips `%`, also accept case-insensitive `HubSpot Note` as a fallback **only** when author is still Atish.
   - **Krishna is in scope** for that note — **any one** of:
     - The comment **@mentions** Krishna’s Jira account id **`712020:cb0bd6e5-b436-49f9-a0f5-6211a8cc8799`** (check ADF `mention` nodes), **or**
     - The visible text **CCs** Krishna (e.g. contains `krishna.bankar@webgility.com`, or a `Cc:` / `CC:` line naming **Krishna Bankar** / that email), **or**
     - Krishna **authored** at least one **other** comment on the **same issue** with `created` **strictly before** this Atish comment’s `created` (Krishna already participated on the thread — satisfies “comment by me”), **or**
     - Krishna is **assignee** or **reporter** on the issue at **end of Yesterday window**.
5. **Do not** include bridge noise when Krishna is **not** covered by step 4 — omit Atish comments that lack `%HubSpot Note%` **or** lack Krishna involvement per step 4.
6. **Rendering:** one bullet per included comment: `` `UD-XXXX` `` — ≤120 char neutral excerpt (no PII) — `https://webgility.atlassian.net/browse/UD-XXXX?focusedCommentId=<commentId>` when `commentId` is known.
7. **Routing:** If the comment contains a **direct question / request / ETA ask** to Krishna, **also** classify under internal §3.2 Pending (action on Krishna). Pure customer/status updates stay **📌 only**.

For every issue surfaced from other Jira queries, fetch `expand=changelog,renderedFields` and **inspect**:

- **What did Krishna do?** Status transitions in the window where `author.accountId == ME`, comments where `author.accountId == ME`, worklog entries by Krishna. **The digest line MUST always say**: ``UD-XXXXX`` + **title** + a one-clause **what was done** verb (e.g. *moved In Progress→Done at 23:49 IST*, *commented "Build #6230 shared"*, *re-estimated to 4h*, *closed sub-task with 2h worklog*). Never list a Jira key without saying what Krishna did to it.
- **Status filter for Yesterday §1.1**: drop the issue if its **end-of-window status** is `Ready For Testing` / `Ready For Verification` / `In Test` — surface it under **§4 Follow-ups** instead.
- **Atish Sinha / HubSpot bridge:** Use **§A8** for authoritative inclusion. Summary: Atish + **`%HubSpot Note%`** + Krishna involvement (mention / CC / prior Krishna comment / assignee / reporter); actionable asks to Krishna **also** hit §3.2.

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

### C. Bitbucket — code activity (**GitHub excluded from digest**)

The daily digest **does not** list GitHub commits, PRs, or repo changes for **AskAI** or **any** GitHub repository — **only** Bitbucket **`webgility/unify-enterprise`**.

Bitbucket `unify-enterprise` (Krishna's primary repo for product work). **Bitbucket REST at `api.bitbucket.org` returns 401 for the standard HTTP access token** (verified 2026-04-29) — only the git transport is reliably authenticated. Use git for everything.

```bash
# Auth + remote URL per bitbucket-unify-enterprise.skill.md.
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

For each commit/PR surfaced from **Bitbucket only**, capture: repo (`unify-enterprise`), branch, short SHA / PR #, **subject (what was done)**, status (open/merged/draft), URL, link to any §7 QA-testing comment posted to Jira.

### D. (Optional) Confluence — **new pages only**

If Confluence credentials from `confluence-workflow.skill.md` are present, query **only pages whose `created` date falls inside the same Yesterday IST window** (or Monday-expanded window) **in the configured workspace / space**. Use CQL such as:

```text
space = "<SPACE_KEY>" AND type = page AND created >= "2026-04-28" AND created <= "2026-04-28 23:59"
```

(Adjust dates and timezone handling to match §Time window.) **Do not** include pages that already existed before the window but were **edited** during the window — **no** “updated existing page” lines in the digest. If no new pages match, **omit** the Confluence dimension entirely (do not print an empty subsection).

Optional: if Krishna personally **created** a new page in that window, one bullet under **Yesterday 💬** is enough; still apply the **created-in-window** rule only.

**Cloud Agent fallback (Atlassian MCP not available):** When the `plugin-atlassian-atlassian` MCP is **not connected** (e.g. Cloud Agent scheduled runs), use the **direct Confluence REST API fallback script** instead of skipping source D:

```bash
python scripts/confluence-fallback.py --json
```

This uses `JIRA_EMAIL` + `JIRA_API_TOKEN` + `JIRA_BASE_URL` (same credentials as Jira — the Atlassian API token works for both Jira and Confluence REST). The script searches for pages **created by Krishna** in the Yesterday IST window. No additional secrets are needed.

**Decision tree for source D:**
- Atlassian MCP (`plugin-atlassian-atlassian`) connected → use `searchConfluenceUsingCql` MCP tool.
- MCP **not** connected **but** `JIRA_EMAIL` + `JIRA_API_TOKEN` are set → run `scripts/confluence-fallback.py --json`. Mark source as `Confluence ✅ (REST API)` in footer.
- Neither MCP nor Jira credentials → skip source D, note `Confluence (not configured)` in *Sources skipped*.

### E. Google Workspace — Calendar + Gmail + Drive (meetings, recaps, notes)

Uses the **`google-workspace`** MCP server (`uvx workspace-mcp`, read-only) configured in `.cursor/mcp.json`. Requires **`GOOGLE_OAUTH_CLIENT_ID`**, **`GOOGLE_OAUTH_CLIENT_SECRET`**, and optionally **`USER_GOOGLE_EMAIL`** (`krishna.bankar@webgility.com`). OAuth consent must have been completed at least once for the environment (tokens cached). For the browser OAuth client (Web application type), register redirect URI **`http://localhost:8000/oauth2callback`** in Google Cloud Console. See `docs/mcp-integration-roadmap.md` for setup.

**Cloud Agent fallback (MCP not available):** When the `google-workspace` MCP is **not connected** (e.g. Cloud Agent scheduled runs where only Slack/Braintrust MCP servers are active), use the **direct REST API fallback scripts** instead of skipping source E:

1. **Bootstrap credentials first** (if not already done):
   ```bash
   python scripts/bootstrap-google-credentials.py
   ```
   This requires `GOOGLE_REFRESH_TOKEN`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `USER_GOOGLE_EMAIL` in Cloud Agent Secrets.

2. **Calendar fallback** (replaces `get_events` MCP tool):
   ```bash
   python scripts/google-calendar-fallback.py --yesterday --today --json
   ```
   Returns JSON with `yesterday.events[]` and `today.events[]` — each event has `summary`, `start`, `end`, `hangoutLink`, `meetLink`, `attendees_count`, `organizer`, `response_status`. Declined events are already excluded.

3. **Gmail fallback** (replaces Gmail search MCP tools):
   ```bash
   python scripts/google-gmail-fallback.py --json
   ```
   Searches for meeting recaps, Gemini summaries, and actionable emails from the last 2 days.

**Decision tree for source E:**
- `google-workspace` MCP connected → use MCP tools (`get_events`, Gmail search, Drive search) as described in §E1–E3 below.
- MCP **not** connected **but** `GOOGLE_REFRESH_TOKEN` env var is set → run `bootstrap-google-credentials.py` then use the fallback scripts above. Mark source as `Google Workspace (Calendar/Gmail/Drive) ✅ (direct API)` in footer.
- MCP not connected **and** `GOOGLE_REFRESH_TOKEN` not set → skip source E, note `Google Workspace (Calendar/Gmail/Drive) — no credentials` in *Sources skipped*.

**E1. Google Calendar — yesterday's meetings**

Use the MCP **`get_events`** tool:

```
get_events(
  user_google_email: "krishna.bankar@webgility.com",
  calendar_id: "primary",
  time_min: "<yesterday 00:00:00 IST in RFC3339>",
  time_max: "<today 00:00:00 IST in RFC3339>",
  detailed: true
)
```

- **Include** if Krishna's response status is `accepted`, `tentative`, or `needsAction`. **Exclude** events Krishna explicitly `declined`.
- **Capture:** title, time (`HH:MM – HH:MM IST`), Google Meet link, attendee count, organizer.
- **Categorize:** → **§1.2** → **Yesterday 💬**. List Calendar bullets **first** in 💬. Format: `• 📅 <title> — <HH:MM–HH:MM> · <N attendees> · Meet: <link>`

**E1b. Google Calendar — today's meetings (§2.3)**

```
get_events(
  user_google_email: "krishna.bankar@webgility.com",
  calendar_id: "primary",
  time_min: "<today 00:00:00 IST in RFC3339>",
  time_max: "<tomorrow 00:00:00 IST in RFC3339>",
  detailed: true
)
```

Same inclusion/exclusion as E1. **Categorize:** → **§2.3** → **`📅 *Meetings today (N):*`**. Omit subsection if zero meetings.

**E2. Gmail — meeting recaps, Gemini summaries, actionable emails**

Search Krishna's Gmail for meeting-related emails in the window. Use Gmail search tools (e.g. `search_gmail_messages`, `get_gmail_message_content`, or equivalent exposed by the MCP).

```
subject:(recap OR summary OR "meeting notes" OR "action items" OR "Gemini") newer_than:2d
```

Also search for Google Meet automated summaries:

```
from:(messages-noreply@google.com OR meet) newer_than:2d
```

- **Filter:** emails received in the Yesterday IST window.
- **Capture:** subject, sender, snippet (≤120 chars), date.
- **Categorize:** meeting recap emails → **§1.2 Meetings & discussions** under **💬** (deduplicate with Calendar events by matching title/time). Actionable emails where Krishna is asked for a reply → **§3.2 Pending discussions**.
- **Do not** include full email bodies — snippet only. No PII or customer data from email content.

**E3. Google Drive — new meeting-note documents (optional)**

If Drive tools are available, search for documents created in the window with meeting-related titles:

```
title contains "Meet" OR title contains "Notes" OR title contains "Recap" modifiedTime > "YYYY-MM-DDT00:00:00+05:30"
```

- **Filter:** only documents **created** (not just edited) in the Yesterday IST window.
- **Capture:** document title, created date, link.
- **Categorize:** → **§1.2 Meetings & discussions** under **💬**. Deduplicate with Calendar events and Gmail recaps.

**Fail-soft:** if any E sub-source errors (e.g. OAuth expired, tool not found), log the error in the footer and continue. Google Workspace is an **enhancement** — the digest must still post even if all E queries fail.

---

## Categorization rules (where each item lands)

For every raw item from sources A–E:

| Bucket | Rule |
|--------|------|
| **§1.1 Yesterday — Jira (my work)** | Status changed in window by Krishna **OR** comment authored by Krishna in window **OR** worklog by Krishna. **Excludes** issues whose end-of-window status is `RFT` / `Ready For Testing` / `Ready For Verification` / `In Test` — those go to **§4 Follow-ups**. Sub-buckets: `Done` / `In Progress (advanced)` / `Commented / Worklogged`. **Every line:** `` `UD-XXXX` `` + title + verb-clause describing the action. |
| **§1.2 Meetings & discussions** | **Google Calendar** events from **§E1** (listed first in 💬); Gmail meeting recaps / Gemini summaries from **§E2**; Slack messages in window with keywords `meeting`, `huddle`, `call`, `discussion`, `notes`, `MOM`, `discord`, `gmeet`, `zoom`; OR **Confluence:** Krishna **created** a new page in the window (§D). **Do not** duplicate §A8 HubSpot bridge lines here — those stay under **📌** only. |
| **§1.3 Status updates / fixes / resolutions shared by me** | Krishna-authored Slack message OR Krishna-authored Jira comment containing `update`, `fix`, `resolution`, `RFT`, `posted`, `released`, `deployed`, `installer`, `build`, `share`. |
| **§1.4 Git activity (mine)** | Source C, plus any §7 QA-testing comment posted in the window. |
| **§2.1 Today — In Progress (mine)** | Jira `In Progress` AND `assignee = me`. |
| **§2.2 Today — Open threads I'm driving** | Slack threads where Krishna posted last but the topic is unresolved (no ✅ / `done` / `resolved` reaction) **and** the next action is Krishna's (e.g. agreed to investigate, share update, deliver build). |
| **§2.3 Today — Upcoming meetings** | **Google Calendar events** from **§E1b** (today's meetings where Krishna is invited and has not declined). Listed under `📅 *Meetings today (N):*`. **Omit if no meetings.** |
| **§3.1 Pending — Jira queue (mine)** | `To Do` AND `assignee = me`, priority-sorted. |
| **§3.2 Pending — Discussions on me** | Slack mentions / DMs / customer-issue comments where someone has asked Krishna a question / for a decision / for help / for a build / for an ETA, and Krishna has not yet replied. |
| **§4.1 Follow-ups — Jira (QA / others)** | Status `RFT` / `Ready For Testing` / `Ready For Verification` / `In Test`, **regardless of assignee**. Line names **who** is driving (current assignee = QA), the QA reviewer (if known from the §7 comment CC), days since RFT, and whether QA has commented since handoff. |
| **§4.2 Follow-ups — Discussions where someone else owes me** | Threads / customer-issue comments where Krishna posted last and the next actor is **not** Krishna (e.g. "awaiting Faaque's check", "awaiting Lokesh's confirmation", Atish-Sinha comment on a CI Krishna previously commented on). |
| **Posted — Yesterday ✅ Done** | §1.1 items that ended **Done** (or equivalent closed-done semantics) from Krishna’s actions yesterday. |
| **Posted — Yesterday 🔄 In Progress Started** | §1.1 items where Krishna advanced work but the issue did **not** end in RFT/In Test (those go to Follow-ups / blocker logic). |
| **Posted — Yesterday 💬 Meetings / Updates** | Merge §1.2 + §1.3 for display when non-empty. **If both empty, omit 💬 entirely.** |
| **Posted — Yesterday 🔀 Commits** | §1.4 commits; header line includes count: *🔀 Commits (N):*. |
| **Posted — Yesterday 📬 PRs / Installers / QA Comments** | PRs, installer lines, Krishna QA-testing comments from §1.4 / §7 handoffs. |
| **Posted — Yesterday 📌 HubSpot / Customer Issue** | **§A8** bridge comments only (mandatory comment-level scan). |
| **Posted — Today 🔄 In Progress** | §2.1 + §2.2 under *Today (<MMM DD>)*. |
| **Posted — Today 📅 Meetings today** | §2.3 calendar events. Format: `📅 *Meetings today (N):*` + one bullet per meeting. |
| **Posted — Today (omit rule)** | **Omit entire Today block** only if **all** of §2.1 + §2.2 + §2.3 are empty. |
| **Posted — Pending** | 🟣 *Action on me:* show `N Jira` if `N>0`; append `· N discussions` **only if** discussions `N>0`. 👀 *Follow-ups:* show `N Jira (RFT/In Test)` if `N>0`; append `· N threads` **only if** `N>0`. **If there is nothing to show for both lines (all zero), omit the entire Pending section.** |
| **Posted — 🚨 Blockers** | Same derivation as former §5.2 (RFT idle ≥24h, stalled threads, explicit waits). **Include only when ≥1 blocker.** Use **fenced code block** table `Jira | Description | Idle Since | Status`. Then *Next action:* line. |
| **Posted — TL;DR** | 2–4 prose sentences; summarize only dimensions that **actually appeared** above. Match Krishna’s reference (“Yesterday — … Today — …”). |

**Bullet detail rules (non-zero only):** Under each **Yesterday** emoji subsection, one bullet per item; truncate ≤180 chars; Jira lines `` `UD-XXXX` `` + title + verb where relevant. **Commits:** `` `branch` `` — `` `short-sha` `` — subject hint. **Installers:** cross-check `#func-wd-build-updates` for Build No. + branch + Jira IDs/titles.

**Tie-breaker (no duplicates):** if an item could land in two buckets, prefer the **earliest** numbered bucket (Yesterday > Today > Pending > Follow-ups) **except** that **§1.1 Yesterday excludes anything currently in RFT/In Test** — those move to §4.1 even if Krishna acted on them yesterday (but the §1.3 line still records the QA comment Krishna posted as part of the handoff).

---

## Output format (Slack-flavored markdown)

The agent produces **one** `slack_send_message` in **`mrkdwn`**. Follow **§Purpose → Posted message — layout** for ordering (**Yesterday → Today → Pending → Blockers → TL;DR**).

**Hard rules**

- **Omit** any emoji subsection or major section whose content count is **0** (no “Nothing”, no empty placeholders).
- **Collapse** duplicate separators: never stack multiple horizontal rules back-to-back.
- Blockers **only if ≥1** row in the table; otherwise omit the whole 🚨 section.

**Template** (replace placeholders; drop lines whose subsection count is 0):

```
*Daily Work Update — Thu, May 1, 2026*
────────────────────────

*Yesterday (Apr 30)*

✅ *Done:*
• `<UD-XXXX>` <title> — <what Krishna did / verified>

🔄 *In Progress Started:*
• ...

💬 *Meetings / Updates (4):*
• 📅 WD Team - Standup — 10:30–10:45 · 15 attendees · Meet: <link>
• 📅 Customization and Feature discussion — 11:00–11:30 · 5 attendees · Meet: <link>
• ...

🔀 *Commits (1):*
• `<branch>` — `<sha>` — <subject hint>

📬 *PRs / Installers / QA Comments:*
• ...

📌 *Customer Issue / HubSpot:*
• `<UD-29517>` — <≤120 char excerpt> — https://webgility.atlassian.net/browse/UD-29517?focusedCommentId=<id>

────────────────────────

*Today (May 1)*

🔄 *In Progress (1):*
• `<UD-32367>` — <title>

📅 *Meetings today (3):*
• WD Team - Standup — 10:30–10:45 · Meet: <link>
• WD Customization/FR Standup — 12:00–12:15 · Meet: <link>
• Customization evening sync up — 17:00–17:30 · Meet: <link>

────────────────────────

*Pending*

🟣 *Action on me:* 10 Jira
👀 *Follow-ups (others driving):* 4 Jira (RFT / In Test)

────────────────────────

*🚨 Blockers — 4 Items (Action Required: Chase Alok)*

```
UD-32071 | Add Customer field… | Apr 28 (~3 days) | RFT — Build #6230 shared, no QA activity
UD-32250 | PO Customer Feedbacks… | Apr 29 (~2 days) | RFT — …
```

*Next action:* Follow up with Alok Mendhe to prioritize QA on all blocked items.

────────────────────────

*TL;DR*

Yesterday — … Today — … Pending — … Blockers — …
```

After TL;DR, append footer:

```
────────────────────────
_Sources used: Jira ✅ · Slack ✅ · Bitbucket ✅ · Google Workspace (Calendar/Gmail/Drive) ✅ · HubSpot (via Customer Issue comments / §A8) ✅ · Confluence (optional; new pages only) ✅_
_Sources skipped: …_
_Generated by `daily-work-update` · `.cursor/skill-library/daily-work-update.skill.md`_
```

When rendering **outside** Slack (Cursor chat), the same layout applies as plain markdown.

### UD-29517-type misses (prevention)

If `focusedCommentId` is unknown but issue key + rough date are known, still emit `` `UD-29517` `` with link to issue URL (omit query param). Prefer §A8 comment fetch to populate `focusedCommentId`.

---

## Access boundaries

| Surface | Access status | Details |
|---------|---------------|---------|
| **Google Calendar** | **Configured** | Via `google-workspace` MCP (`uvx workspace-mcp`, read-only). Tool **`get_events`** for **§E1** (yesterday) and **§E1b** (today). Web app OAuth: redirect **`http://localhost:8000/oauth2callback`**. Secrets `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `USER_GOOGLE_EMAIL` in Cloud Agent Secrets / local env. |
| **Gmail / Google Mail** | **Configured** | Same `google-workspace` MCP. Gmail search for meeting recaps, Gemini summaries. Used in **§E2**. |
| **Google Drive** | **Configured** | Same `google-workspace` MCP. Drive search for meeting-note documents. Used in **§E3**. |
| **Gemini meeting notes / NotebookLM** | **Via Gmail/Drive** | No dedicated MCP — Gemini meeting summaries arrive as **Gmail** (automated from Google Meet) or **Drive docs**; ingest via §E2/§E3. |
| **Microsoft 365** | None | Graph API app registration + secrets; MCP if available. |

**Note on OAuth consent:** The `google-workspace` MCP requires a one-time browser-based OAuth consent flow per environment. For **local Cursor**, this happens automatically (browser popup). For **Cloud Agent** scheduled runs, either: (a) complete OAuth once in a manual Cloud Agent session so tokens are cached, or (b) use **service account + domain-wide delegation** (`GOOGLE_SERVICE_ACCOUNT_KEY_JSON` + `USER_GOOGLE_EMAIL`) — requires Workspace admin. If OAuth is not completed, source E fails soft and the digest still posts with A–D.

**This chat agent** reaches: Jira / Slack / Bitbucket / Google Workspace (Calendar + Gmail + Drive) + optional Confluence per §Required secrets and **`docs/mcp-integration-roadmap.md`**, plus whatever MCP servers appear in `.cursor/mcp.json`.

---

## Posting rules

1. **Resolve** the channel id for `#my-daily-update` via `slack_search_channels query: "my-daily-update"`. **Locked id:** `C0B0CBW8G03` (public channel; Cursor bot already a member). Do not search again unless the locked id stops working.
2. **One message per day** — full structured digest per **§Purpose → Posted message — layout** (Yesterday → Today → Pending → Blockers → TL;DR → footer). **Send as a single `slack_send_message` call.** Do not split into multiple posts, replies, or "v2 / addendum" follow-ups. If Krishna explicitly asks for raw §1–§4 derivation tables, reply **in chat** or **thread** — never as extra top-level spam in `#my-daily-update`.
3. **Send** with **`slack_send_message`** (Cursor Slack MCP). The parameter is **`message`**, not `text`. Use Slack `mrkdwn` syntax (`*bold*`, `_italic_`, `<url|label>`). The protocol-spec name `slack_post_message` does **not** exist in this MCP.
4. If `#my-daily-update` does not resolve, fall back to **DM Krishna** by passing his Slack `user_id` `U08FTS2SRAP` as `channel_id` to `slack_send_message`. Add a one-line note at the top: `Channel #my-daily-update not resolved, DM-ing instead.` The single-message rule still applies to the DM.
5. If Slack MCP is unavailable, **render to Cursor chat as a single message** and tell Krishna to set up Slack secrets.
6. Mask any token / secret / email-with-token as `***` (per `slack-integration.skill.md` safety rules).
7. Never include source code snippets, customer PII, full QA testing comments, or HubSpot ticket bodies. Only short summaries with links.
8. Do **not** post duplicates — read the previous day's digest from `#my-daily-update` first (`slack_search_public_and_private query: "in:#my-daily-update Daily Work Update"`) and skip items whose **exact same link** already appeared. **Do not** dedupe away distinct `focusedCommentId` URLs on the same issue key.

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
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | Google Workspace MCP (Calendar + Gmail + Drive, §E) |
| `GOOGLE_REFRESH_TOKEN` | **Required for Cloud Agents** — enables direct API fallback when `google-workspace` MCP is not connected. Obtain via `scripts/extract-google-refresh-token.py` locally. |
| `USER_GOOGLE_EMAIL` | Default Google account for `workspace-mcp` (optional but recommended) |
| `DAILY_UPDATE_AUTOSEND=1` | Skip the chat confirm and post straight to Slack |

**4. Prompt:**

```
/daily-work-update

Run my daily work digest for the previous IST calendar day (00:00–23:59 IST; Monday rule per skill).
Follow .cursor/skill-library/daily-work-update.skill.md exactly:

INTERNAL (derive counts & blockers): §1 Yesterday / §2 Today / §3 Pending / §4 Follow-ups — same rules as before.

SOURCES: Run A (Jira), B (Slack), C (Bitbucket unify-enterprise — no GitHub), D (Confluence if wired), E (Google Workspace — Calendar + Gmail + Drive via google-workspace MCP, §E1–E3) in parallel. If google-workspace MCP is not connected or OAuth incomplete, skip source E and note in Sources skipped.

POSTED SLACK MESSAGE — single layout in order:
1) Title + separator
2) Yesterday (<date>) with emoji subsections (✅ 🔄 💬 🔀 📬 📌) — **omit any subsection with 0 items**; 💬 lists Google Calendar first (**§E1**), then Gmail recaps (**§E2**), then Slack-sourced items
3) Separator + Today (<date>) 🔄 In Progress + 📅 Meetings today (**§E1b**) — **omit entire Today if all empty**
4) Separator + Pending (🟣 / 👀) — **omit whole Pending if all counts 0**
5) Separator + 🚨 Blockers — **only if ≥1 blocker**; table in fenced code block + Next action
6) Separator + TL;DR prose (2–4 sentences)
7) Footer (Sources used / skipped — include Google Workspace ✅ or ⚠️)

MANDATORY: Run §A8 Customer Issue **comment** fetch. Under Yesterday 📌 include **only** comments where **Atish Sinha** authored **`%HubSpot Note%`** (fallback: plain `HubSpot Note` if `%` stripped) **and** Krishna is in-scope per §A8 step 4 (mention / CC / prior Krishna comment / assignee / reporter). Omit GitHub entirely — Bitbucket `unify-enterprise` only for 🔀/📬.

GOOGLE CALENDAR: Use `get_events` from `google-workspace` MCP for yesterday (**§E1**) and today (**§E1b**). Exclude declined events. Yesterday meetings go under 💬; today meetings under 📅.

Post ONE slack_send_message to #my-daily-update (C0B0CBW8G03). DAILY_UPDATE_AUTOSEND=1 — skip confirm.

If sources fail, still post heartbeat per skill §Failure / footer.
```

**5. Verify:**

After saving, click **Run now once** in the Cursor Dashboard. Expected behavior:

- Cloud Agent boots, reads `.cursor/skill-library/daily-work-update.skill.md`.
- Runs the Jira / Slack / Bitbucket / Google Workspace (+ optional Confluence new-pages) queries described above (see *Data sources & queries* §A–§E). **No** GitHub `gh` queries for this digest. If `google-workspace` MCP is not connected, tries the **direct API fallback** via `scripts/google-calendar-fallback.py` and `scripts/google-gmail-fallback.py` (requires `GOOGLE_REFRESH_TOKEN`). Similarly for Confluence: if Atlassian MCP is not connected, tries `scripts/confluence-fallback.py` (uses Jira credentials).
- Posts a single message to `#my-daily-update` (channel id `C0B0CBW8G03`).
- Records nothing in `.cursor/`, `src/`, or any tracked path. Scratch goes under `local/ephemeral/daily-work-update/<YYYY-MM-DD>/` (gitignored).

If you ever need to trigger ad-hoc, just type **`/daily-work-update`** in any Cursor chat — without `DAILY_UPDATE_AUTOSEND=1` it will preview in chat and ask "Post to #my-daily-update? (yes / no / DM only)".

---

## Output for Cursor session (when invoked manually)

When Krishna runs `/daily-work-update` directly in chat, the agent must:

1. Detect "now" in IST and compute the window (`yesterday 00:00 → 23:59 IST`).
2. Run sources A–E in parallel (skip any whose MCP/secret is missing).
3. Render the digest in chat **first**.
4. Ask one confirm: *"Post to `#my-daily-update`? (yes / no / DM only)"*.
5. On `yes` → post via `slack_send_message` to channel `C0B0CBW8G03`. On `DM only` → DM Krishna (`U08FTS2SRAP`). On `no` → leave it in chat. (When invoked by the **scheduler**, skip the confirm and post directly — the scheduler injects an env var `DAILY_UPDATE_AUTOSEND=1` to mark autonomy.)

---

## Failure / fallback behavior

- **Slack MCP missing** → render in chat; print one-liner `Slack MCP not connected — see slack-integration.skill.md`.
- **Jira MCP / REST failing** → skip Jira sections, render placeholders, footer note.
- **Bitbucket auth failing** → skip §1.4 commit lines, list `git fetch` error in footer.
- **Google Workspace MCP not connected** → try the **direct API fallback** (see §E decision tree): run `python scripts/bootstrap-google-credentials.py` then `python scripts/google-calendar-fallback.py --yesterday --today --json` and `python scripts/google-gmail-fallback.py --json`. If `GOOGLE_REFRESH_TOKEN` is set and the scripts succeed, source E is available via direct API — mark `Google Workspace ✅ (direct API)` in footer. If `GOOGLE_REFRESH_TOKEN` is not set or scripts fail, note `Google Workspace — no credentials` in *Sources skipped*. The digest still posts with A–D.
- **Confluence MCP not connected** → try the **direct REST fallback** (see §D decision tree): run `python scripts/confluence-fallback.py --json` using `JIRA_EMAIL` + `JIRA_API_TOKEN`. If credentials are set and the script succeeds, mark `Confluence ✅ (REST API)` in footer. If credentials missing or script fails, note `Confluence (not configured)` in *Sources skipped*.
- **No items in any source** → still post a minimal heartbeat: title + separator + *TL;DR* one sentence (“Nothing recorded in sources for yesterday’s window — check Sources skipped.”) + footer. **Do not** fill fake Yesterday emoji sections.
- **Partial errors** are listed in the *Sources skipped* footer (see template).

---

## Privacy & safety

- Never include raw HubSpot ticket bodies, customer PII, account numbers, or build artifacts.
- Mask all secrets / URLs containing tokens as `***`.
- Do **not** create / modify Jira issues, post Jira comments, transition issues, push code, send emails, or send Slack messages to other channels — this agent is **read-only** for Jira / Bitbucket / Confluence / Google Workspace and **write-only** for the single Slack channel `#my-daily-update` (or DM Krishna).
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
| `gh` CLI | **Not used** for the daily digest — product + repo signal is **Bitbucket `unify-enterprise` only**. Other agents may still use `gh` with `--author=krishnabankar-webgility` (Cloud Agent runs as bot `cursor`, so `--author=@me` is wrong there). |
| Single-message rule | The Slack message **must** ship as ONE `slack_send_message` call — never split into "v2 / addendum" follow-ups. |
| Posted-content rule | The Slack message follows **§Purpose → Posted message — layout** (Yesterday → Today → Pending → Blockers → TL;DR). **Omit subsections with count 0.** Run **§A8** every time; 📌 lines **only** for Atish + **`%HubSpot Note%`** + Krishna in-scope per §A8. |
| Google Workspace MCP | **`google-workspace`** server in `.cursor/mcp.json` via `uvx workspace-mcp` (read-only). Secrets: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `USER_GOOGLE_EMAIL`. Requires one-time OAuth consent. Source **§E** (Calendar **§E1** / **§E1b**, Gmail §E2, Drive §E3). Fail soft if not connected. |
| `USER_GOOGLE_EMAIL` | **`krishna.bankar@webgility.com`** — default account for Google Workspace MCP. |
| Google Calendar `get_events` | Tool **`get_events`**. Parameters: `user_google_email` = `krishna.bankar@webgility.com`, `calendar_id` = `primary`, `time_min`/`time_max` in RFC3339 with `+05:30`, `detailed` = `true`. |
| Google Calendar OAuth | OAuth client type **Web application** (not Desktop). Redirect URI **`http://localhost:8000/oauth2callback`** registered in GCP. Tokens cached after first browser consent. |
| Google Calendar routing | **§E1** yesterday → 💬; **§E1b** today → 📅. Exclude **declined**; include `accepted`, `tentative`, `needsAction`. |
| Google Cloud Agent fallback | When `google-workspace` MCP is not connected on Cloud Agents: (1) run `python scripts/bootstrap-google-credentials.py` to seed credentials from `GOOGLE_REFRESH_TOKEN`, (2) run `python scripts/google-calendar-fallback.py --yesterday --today --json` for Calendar, (3) run `python scripts/google-gmail-fallback.py --json` for Gmail. Mark footer `Google Workspace ✅ (direct API)`. Verified working 2026-05-04. |
| Confluence Cloud Agent fallback | When `plugin-atlassian-atlassian` MCP is not connected on Cloud Agents: run `python scripts/confluence-fallback.py --json` using `JIRA_EMAIL` + `JIRA_API_TOKEN` (same Atlassian credentials). Mark footer `Confluence ✅ (REST API)`. Added 2026-05-04. |
| `GOOGLE_REFRESH_TOKEN` | **Required** Cloud Agent Secret for Google direct API fallback. Obtain locally via `python scripts/extract-google-refresh-token.py`, store in Cursor Dashboard → Cloud Agents → Secrets. Confirmed working 2026-05-03. |

When **anything** new becomes a "I had to figure this out" moment during a run, append a row to this table (or update an existing one) **before** ending the session. The Cursor agent at `.cursor/agents/daily-work-update.agent.md` is also responsible for this and points back here.

---

## Future extensions (not built yet)

- **HubSpot direct API** — complement §A8 once HubSpot read token + Private App exist. Deferred per `docs/mcp-integration-roadmap.md`.
- **Weekly digest** — same agent, different window (`since = -7d`), posted Monday 09:00 IST.

When any of these is wired in, append the source/query to this file and the categorization table.

### Recently activated (formerly future)

- **Google Calendar / Gmail / Drive** — `google-workspace` MCP configured in `.cursor/mcp.json` (secrets: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `USER_GOOGLE_EMAIL`). Now source **§E** in data queries. Requires one-time OAuth consent. See `docs/mcp-integration-roadmap.md`.
- **Gemini / Meet notes** — ingested via Gmail (§E2) and Drive (§E3); no dedicated MCP needed.
