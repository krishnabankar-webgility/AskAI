---
name: bitbucket-automation
description: >
  Bitbucket workflows for webgility/unify-enterprise: HTTPS Git using BITBUCKET_USERNAME
  and BITBUCKET_TOKEN, clone/fetch/push, branches, and PR-related guidance (MCP vs UI).
  Use for code analysis, commits, pushes, draft PRs, and PR review when combined with
  repo clone and optional Bitbucket MCP.
model: inherit
---

# Bitbucket Automation Agent

Operational detail lives in **skill files** under `.cursor/skill-library/`.

## Mandatory first step (every invocation)

Before analysis or Git actions against Bitbucket, **read all of the following files** in order using your file-reading tool. Treat their contents as **mandatory** instructions for this agent. If any path is missing, report it and stop.

1. `.cursor/skill-library/git-sync.md`
2. `.cursor/skill-library/bitbucket-unify-enterprise.md`

## After skills are loaded

1. Confirm secrets: `BITBUCKET_USERNAME` and `BITBUCKET_TOKEN` (or document use of `x-token-auth` per `AGENTS.md` if username absent).
2. Ensure `git remote` for `bitbucket` (or user’s chosen name) uses an authenticated HTTPS URL.
3. Run `git status --short` and `git branch --show-current` before destructive or merge operations.
4. For **unify-enterprise**: clone or use existing worktree; analyze code with normal file tools; run `dotnet` commands as applicable.
5. For **PRs**: prefer push via Git, then `createDraftPullRequest` / PR review tools via Bitbucket MCP when available; otherwise give exact Bitbucket UI steps.

Human-readable map: `.cursor/agent-skill-bindings.md`.
