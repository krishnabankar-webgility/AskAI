# Daily Work Update agent — setup, workflow & expectations

> **Audience:** Anyone setting up or adopting the **`/daily-work-update`** agent (Cursor / GitHub Copilot / VS Code).  
> **Repo:** Paths below assume **`Agentic_Unify-Enterprise`** workspace with **`AskAI/`** as the agents/skills project.  
> **Published (mirror):** [Daily Work Update agent — team guide](https://webgility.atlassian.net/wiki/spaces/~712020cb0bd6e5b43649f9a0f56211a8cc8799/pages/3045425160/Daily+Work+Update+agent+team+guide+Cursor+Copilot+VS+Code) · tiny [`CICFtQ`](https://webgility.atlassian.net/wiki/x/CICFtQ) — **Public** folder in Krishna’s personal space.  
> **Last reviewed:** 2026-05-04

---

## 1. What this is for

The **Daily Work Update** agent produces **one structured Slack message per day** with:

**Yesterday → Today → Pending → Blockers → TL;DR**

It answers: *What did I ship or touch yesterday? What am I driving today? What is waiting on me? What follow-ups or blockers matter?* — without opening six tools and rebuilding that story by hand.

Default rhythm is **weekday mornings (~09:00 IST)** post to **`#my-daily-update`** (or preview in chat first). Behavior is **procedure-driven** from **`daily-work-update.skill.md`** — not ad-hoc prompting.

---

## 2. Problems it solves & time it saves

| Pain today | What the agent does |
|------------|---------------------|
| **Tab churn** — Jira, Slack search, Bitbucket, Calendar, Gmail, optional Confluence | Pulls those signals in **one run**, categorized into one digest. |
| **Inconsistent stand-up notes** | Same layout every day (**Yesterday → Today → Pending → Blockers → TL;DR**). |
| **Missed HubSpot-bridge signals on Customer Issues** | Skill **§A8** pulls qualifying **Atish Sinha + `%HubSpot Note%`** comments when you’re in-scope (see canonical skill). |
| **Reporting GitHub noise for internal product work** | Digest uses **Bitbucket `unify-enterprise` only** for commits/PRs — **no** GitHub activity in the posted digest. |
| **Risk of posting secrets or huge blobs** | Read-only on sources; short excerpts + links; safety rules in **`slack-integration.skill.md`** and daily skill. |

**Rough time saved (order of magnitude):** assembling the same manually often takes **15–35+ minutes** (Jira filters, Slack scroll, git log, calendar, skim mail). The automated run is typically **a few minutes** of agent time plus **near-zero** prep once MCPs and secrets exist — recurring savings **every weekday** for whoever runs it.

**What it does *not* replace:** deep code review, estimating, or stakeholder decisions — it **summarizes and links**, it does not think instead of you.

---

## 3. What “activity updates” include (all sources)

Everything below is **optional at runtime** except what your environment actually wires up — missing pieces appear in a **“Sources skipped”** footer rather than failing the whole run.

| Source | What you get | What you need |
|--------|----------------|---------------|
| **A — Jira (UD)** | Issues you touched, status changes, your queue (To Do / In Progress), RFT / In Test follow-ups, Customer Issue **§A8** HubSpot bridge comments | `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_BASE_URL` (MCP and/or REST per skill) |
| **B — Slack** | Mentions, relevant threads, channel context for you | `SLACK_BOT_TOKEN`, `SLACK_TEAM_ID`; tools per **`slack-integration.skill.md`** |
| **C — Bitbucket (`unify-enterprise`)** | Your commits / PR-related lines from **git** on a **local clone** (not GitHub) | `BITBUCKET_USERNAME` + `BITBUCKET_TOKEN` (or token-only URL); clone per **`bitbucket-unify-enterprise.skill.md`** |
| **D — Confluence (optional)** | **New pages created** in the time window only — not bulk edits | Confluence wired per **`confluence-workflow.skill.md`** if you enable it |
| **E — Google Workspace** | Yesterday’s meetings, today’s calendar, Gmail/Drive meeting-recap style signals per skill §E | `GOOGLE_OAUTH_*`, `USER_GOOGLE_EMAIL`; **`uv`** + `uvx workspace-mcp` per **`mcp-integration-roadmap.md`** |

**Delivery:** **One** `slack_send_message` to **`#my-daily-update`** (channel id in skill), or DM fallback — never spray across random channels.

---

## 4. End-to-end workflow

```text
[ Trigger ] → Agent loads skills → Computes IST “yesterday” window
    → Queries A–E in parallel (skip & note if MCP/secret missing)
    → Applies categorization + §A8 rules + dedupe vs last digest
    → Renders ONE Slack mrkdwn message
    → [ Manual: confirm in chat ] OR [ Scheduled: DAILY_UPDATE_AUTOSEND=1 posts ]
```

**Triggers:**

- **Manual:** Type **`/daily-work-update`** in Cursor/Copilot/VS Code agent chat → review draft → confirm post (unless autosend).
- **Scheduled (recommended for mornings):** Cursor **Cloud Agent schedule** or similar — inject **`DAILY_UPDATE_AUTOSEND=1`** and use the **verbatim** automation prompt from **`daily-work-update.skill.md` → § Cursor Automation setup → “4. Prompt”** (refresh that prompt whenever the skill changes).

---

## 5. Setup checklist (get to a working digest)

### 5.1 Repo & agent files

1. Open the workspace so **`AskAI/.cursor/skill-library/`** resolves (e.g. **`Agentic_Unify-Enterprise`** root with **`AskAI`** inside).
2. Ensure agent definitions exist:
   - **Cursor:** `AskAI/.cursor/agents/daily-work-update.agent.md`
   - **Copilot mirror (parity):** `.github/copilot/agents/daily-work-update.agent.md` *(add from Cursor copy if your branch does not have it yet)*
   - **VS Code picker mirror:** `.github/agents/daily-work-update.agent.md`
3. Registry rows stay aligned: **`AskAI/.cursor/agent-skill-bindings.md`** (and **`AskAI/.github/copilot/AGENT-SKILL-BINDINGS.md`** if you use Copilot bindings).

### 5.2 MCP & credentials

1. Merge **`AskAI/docs/mcp-servers.example.json`** patterns into **`.cursor/mcp.json`** (placeholders only in git — real values in **Windows user env** or **Cursor Cloud Secrets**).
2. Set at minimum for a **full** digest:
   - Jira, Slack, Bitbucket (for git), and optionally Google OAuth env vars — **names** in **`daily-work-update.skill.md`** and **`mcp-integration-roadmap.md`**.
3. Install **`uv`** on PATH for **`uvx workspace-mcp`** (Google).
4. **Clone** Bitbucket **`webgility/unify-enterprise`** with an authenticated remote so **`git log`** works.

### 5.3 Scheduling (optional but typical)

1. Cursor Dashboard → **Cloud Agents** → **Schedule** — branch **`master`** of **`AskAI`** repo (see skill § Cursor Automation).
2. Add secrets in dashboard (**same variable names** as local env).
3. Set **`DAILY_UPDATE_AUTOSEND=1`** so the run **posts without** the interactive “Post to #…?” step.
4. Paste automation prompt **verbatim** from the skill (**§ “4. Prompt”**).

### 5.4 First successful run

1. Run **`/daily-work-update`** manually once.
2. Confirm you see sections populated from **at least** Jira or Slack or Bitbucket.
3. Check footer for **Sources skipped** — fill gaps (OAuth, clone, token scopes) until expectations match your bar.

---

## 6. What to expect & what can go wrong

**Expect:**

- One Slack message in fixed order; empty subsections omitted; **TL;DR** prose at the end.
- Jira lines with `` `UD-xxxx` ``, short “what I did” clause, link.
- Monday uses “since Friday” window per skill.

**If something is off:**

| Symptom | Likely cause |
|---------|----------------|
| No Jira section | Token, base URL, or API change — see skill REST notes (`POST .../search/jql`). |
| No Slack post | Missing Slack MCP or bot not in channel — falls back to chat or DM per skill. |
| No commits | No clone, wrong remote, or author filter vs your git identity. |
| No Calendar/Gmail | Google MCP not connected or OAuth incomplete — footer lists skipped. |
| Duplicate URLs vs yesterday | Dedupe rules — see skill (same URL not repeated). |

---

## 7. Related agents & docs

- **`KrishnaAiGen`** (`AskAI/.cursor/agents/KrishnaAiGen.agent.md`) routes **`/daily-work-update`** and reminds to **refresh scheduled prompts** when **`daily-work-update.skill.md`** changes.
- Project conventions: **`AskAI/AGENTS.md`**.
- MCP overview: **`AskAI/docs/mcp-integration-roadmap.md`**.

---

## 8. Attachments for Confluence (non-secret files only)

Attach exports or repo links for:

- **`AskAI/.cursor/agents/daily-work-update.agent.md`**
- **`AskAI/.cursor/skill-library/daily-work-update.skill.md`** (canonical)
- **`AskAI/.cursor/skill-library/slack-integration.skill.md`**
- **`AskAI/.cursor/skill-library/jira-workflow.skill.md`**
- **`AskAI/.cursor/skill-library/bitbucket-unify-enterprise.skill.md`**
- **`AskAI/.cursor/skill-library/git-sync.skill.md`**
- **`AskAI/.cursor/skill-library/krishnaaigen-ephemeral-output.skill.md`**
- **`AskAI/.cursor/agent-skill-bindings.md`**
- **`AskAI/.cursor/agents/KrishnaAiGen.agent.md`**
- **`AskAI/AGENTS.md`**
- **`AskAI/docs/mcp-integration-roadmap.md`**
- **`AskAI/docs/mcp-servers.example.json`**
- Copilot/VS mirrors **if present:** `.github/copilot/agents/daily-work-update.agent.md`, `.github/agents/daily-work-update.agent.md`, **`AskAI/.github/copilot/AGENT-SKILL-BINDINGS.md`**

**Never attach:** tokens, `.env`, or a real **`.cursor/mcp.json`** with embedded secrets.

---

## 9. References

| Resource | Location |
|----------|----------|
| Cursor subagents | https://cursor.com/docs/subagents |
| Canonical daily skill | `AskAI/.cursor/skill-library/daily-work-update.skill.md` |
| Google Workspace MCP | https://github.com/taylorwilsdon/google_workspace_mcp |

---

*Webgility / AskAI — update this page when `daily-work-update.skill.md` or automation prompts change.*
