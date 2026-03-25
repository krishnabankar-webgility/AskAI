# Skill: Git Branch Sync Automation

## Purpose
Safely perform day-to-day Git automation for shared branches, especially synchronizing `develop` after `master` receives merges.

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
