# Skill: Git Branch Sync Automation

## Purpose
Safely perform day-to-day Git automation for shared branches, especially synchronizing `develop` after `master` receives merges.

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
