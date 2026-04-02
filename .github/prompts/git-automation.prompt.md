# Git Automation Prompt (GitHub Copilot)

**Canonical skill (read first when automating):** `.cursor/skill-library/git-sync.md` — remotes (`origin` vs `bitbucket`), full safety rules, and the official sync sequence. This prompt is a short checklist; the skill wins if anything disagrees.

Use for Git workflows such as:
- Commit / push changes
- Merge branches
- Sync `develop` with `master`
- Resolve merge flow and finalize push

Prefer the **local workspace terminal** for `git` so credentials match VS Code / Git Credential Manager.

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
