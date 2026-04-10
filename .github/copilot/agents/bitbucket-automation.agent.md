---
name: bitbucket-automation
description: >
  Bitbucket workflows for webgility/unify-enterprise: HTTPS Git using BITBUCKET_USERNAME
  and BITBUCKET_TOKEN, clone/fetch/push, branches, and PR-related guidance (MCP vs UI).
  Use for code analysis, commits, pushes, draft PRs, and PR review when combined with
  repo clone and optional Bitbucket MCP.
model: inherit
---

# Bitbucket Automation — GitHub Copilot

Operational detail lives in **skill files** under **`.cursor/skill-library/`** — same as **Cursor** `.cursor/agents/bitbucket-automation.md`.

## Mandatory first step (every invocation)

Read **in order**:

1. `.cursor/skill-library/git-sync.md`
2. `.cursor/skill-library/bitbucket-unify-enterprise.md`

If any path is missing, report it and stop.

## After skills are loaded

1. Confirm secrets: `BITBUCKET_USERNAME` and `BITBUCKET_TOKEN` (or `x-token-auth` per `AGENTS.md` if username absent).
2. Ensure `git remote` for `bitbucket` uses an authenticated HTTPS URL.
3. Run `git status --short` and `git branch --show-current` before destructive or merge operations.
4. For **unify-enterprise**: clone or use existing worktree; analyze code; run `dotnet` as applicable.
5. For **PRs**: push via Git, then Bitbucket MCP (`createDraftPullRequest`, etc.) when available; otherwise give exact Bitbucket UI steps.

Registry: `.github/copilot/AGENT-SKILL-BINDINGS.md` · Human map: `.cursor/agent-skill-bindings.md`
