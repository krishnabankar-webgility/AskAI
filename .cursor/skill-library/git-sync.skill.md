# Skill: Git Branch Sync Automation

## User preference: `master`-first (Krishna)

For the **AskAI** repo, default **all** day-to-day work to **`master`** unless the user explicitly requests another branch. Before commits: `git checkout master` and `git pull origin master`. Default push: `git push origin master`. Do not create feature branches or merge to `develop` unless asked.

The **`develop` sync** workflow below is **opt-in** — run it only when the user asks to bring `develop` up to date with `master`.

## Purpose
Safely perform day-to-day Git automation for shared branches, especially synchronizing `develop` after `master` receives merges (when explicitly requested).

## Configured remotes

| Alias | URL | Purpose |
|-------|-----|---------|
| `origin` | `https://github.com/krishnabankar-webgility/AskAI` | Primary GitHub remote (default push/fetch) |
| `bitbucket` | `https://bitbucket.org/webgility/unify-enterprise.git` | Bitbucket mirror / source remote |

Use `origin` for all normal branch operations unless the user explicitly requests Bitbucket. To fetch or push to Bitbucket, substitute `bitbucket` for `origin` in any command.

**Authentication (Cloud Agent):** store **`BITBUCKET_USERNAME`** (account slug) and **`BITBUCKET_TOKEN`** (Bitbucket **HTTP access token**, not an Atlassian API token) in Cursor Dashboard → Cloud Agents → Secrets. Set the remote URL with URL-encoded token if needed — full patterns and PR/MCP notes are in **`bitbucket-unify-enterprise.md`**. For **`/bitbucket-automation`**, read that file after this one.

## Primary workflow: sync develop with master

Use this exact flow unless user specifies a different branch strategy:

```bash
git checkout develop
git pull origin develop
git merge --no-ff master -m "Merge branch 'master' into develop"
git push origin develop
```

## Rules

1. Always run `git status --short` and `git branch --show-current` before executing merge commands.
2. If merge conflict occurs:
   - Stop automation.
   - Inform user conflict must be resolved.
   - After user confirms resolution, run:
     - `git add -A`
     - `git commit` (if merge in progress)
     - `git push origin <current-branch>`
3. If branch is already up to date, report success without treating it as an error.
4. Do not use `git push --force` or `git reset --hard` unless user explicitly requests it.
5. Keep commit messages clear and branch-safe.

## Safety

- Never delete branches without explicit confirmation.
- Never rewrite remote shared branch history unless explicitly requested.
- Avoid destructive commands by default.

## Feature Branch Sync Safety (mandatory)

**Root cause of past incidents (UD-32682, UD-32643):** When a branch is created from `develop` using `git checkout -b <branch> origin/develop`, git sets the upstream tracking to `origin/develop`. VS Code "Sync Changes" then pushes commits directly to `origin/develop`, bypassing PR review entirely. Bitbucket auto-closes the PR as "MERGED" even though the Merge button was never clicked.

### Rule: always sync with the feature branch's own remote — never with `origin/develop`

**Step 1 — Immediately after every new feature branch push, set correct tracking:**
```bash
git push -u origin <current-branch-name>
```
The `-u` flag sets upstream to `origin/<current-branch-name>`. After this, VS Code Sync targets the feature branch, not develop.

**Step 2 — Before every Sync, verify tracking:**
```bash
git status
```
The tracking line must read `Your branch is ... 'origin/<current-branch-name>'`.
- ✅ `origin/UD-32682_Krishna` — safe to sync
- 🔴 `origin/develop` — **do NOT sync** — fix tracking first

**Step 3 — Auto-fix if wrong upstream detected:**
```bash
git branch --set-upstream-to=origin/<current-branch-name>
```

**Agent behavior:**
- Always verify upstream tracking before any sync or push operation.
- If upstream is not `origin/<current-branch-name>` — correct it before proceeding.
- Never sync a feature branch to `origin/develop` or any base branch.
- Apply `git push -u origin <branch>` immediately after every new feature branch push.
