# Git Automation Prompt (GitHub Copilot)

Use this prompt for Git workflows such as:
- Commit / push changes
- Merge branches
- Sync `develop` with `master`
- Resolve merge flow and finalize push

## Required behavior

1. Detect current branch and repository status first.
2. For **master merge completed** requests, run this sequence:
   - `git checkout develop`
   - `git pull origin develop`
   - `git merge --no-ff master -m "Merge branch 'master' into develop"`
   - If already up to date, continue without failure.
   - `git push origin develop`
3. If merge conflicts occur, stop and ask user to resolve conflict, then continue from commit/push step.
4. Never force push unless explicitly requested.
5. Never rewrite history on shared branches unless explicitly requested.

## Output format

- Current branch
- Actions executed
- Final sync status (`develop` vs `master`)
- Next steps (if any)
