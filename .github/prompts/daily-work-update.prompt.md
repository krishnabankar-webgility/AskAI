# daily-work-update — prompt routing (GitHub Copilot / VS Code)

Use this prompt to generate **Krishna's daily work digest** and post it to Slack **`#my-daily-update`** (id `C0B0CBW8G03`).

**Load first**

1. `.cursor/skill-library/daily-work-update.skill.md` — **§Purpose** (posted layout order), **§A8** (Atish + `%HubSpot Note%` + Krishna in-scope), **§Output format**, **§Access boundaries**, posting rules
2. `.cursor/skill-library/slack-integration.skill.md`
3. `.cursor/skill-library/jira-workflow.skill.md` (only §3 status semantics, §7, §7.6 account-id table)
4. `.cursor/skill-library/bitbucket-unify-enterprise.skill.md`
5. `.cursor/skill-library/git-sync.skill.md`
6. `.cursor/skill-library/krishnaaigen-ephemeral-output.skill.md`

**Behavior summary**

- Compute window in `Asia/Kolkata` (previous IST day; Monday expansion per skill).
- Run Jira (including **mandatory §A8** comment fetch), Slack, Bitbucket in parallel — **no** GitHub/`gh` for this digest; optional Confluence (**new pages only**). Note misses in *Sources skipped*.
- **Posted message order:** Yesterday → Today → Pending → Blockers → TL;DR → footer. **Omit any subsection with count 0.** Blockers section only if ≥1 blocker.
- **HubSpot bridge (📌):** only Atish Sinha comments with **`%HubSpot Note%`** where Krishna is mention / CC / prior comment / assignee / reporter per skill §A8.
- One `slack_send_message`; dedupe by exact URL only.

**Hard rules**

- Read-only on Jira, Bitbucket, Confluence (when used); write-only `#my-daily-update` or DM `U08FTS2SRAP`.
- Mask secrets; no PII / full ticket bodies.

**Agent files:** `.cursor/agents/daily-work-update.agent.md`, `.github/copilot/agents/daily-work-update.agent.md`, `.github/agents/daily-work-update.agent.md`.

**MCP roadmap:** `docs/mcp-integration-roadmap.md`.
