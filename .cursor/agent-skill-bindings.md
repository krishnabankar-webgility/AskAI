# Agent → skill pack map

Cursor subagents do not support a native `skills: [...]` field. Each agent in `.cursor/agents/*.md` lists the paths it must **read first**; this file is the human-readable map only (keep it in sync when you add agents or skills).

| Agent (`/name`) | Skill files (under `.cursor/skill-library/`) |
|-----------------|-----------------------------------------------|
| `jira-automation` | `jira-workflow.md` |
| `db-automation` | `db-restore.md` *(append more `db-*.md` skills to `db-automation.md`’s read list as you add them)* |
| `git-automation` | `git-sync.md` *(append more `git-*.md` skills to `git-automation.md`’s read list as you add them)* |
| `bitbucket-automation` | `git-sync.md`, then `bitbucket-unify-enterprise.md` |
| `slack-automation` | `slack-integration.md` *(append more `slack-*.md` skills to `slack-automation.md`’s read list as you add them)* |

To add **agent2** with only `skill3.md`:

1. Put shared atoms in `.cursor/skill-library/`.
2. Create `.cursor/agents/agent2.md` with `name: agent2` and a short body that says: read `.cursor/skill-library/skill3.md` first (and only that file).
3. Update the table above.

Use **plain `.md` in `skill-library/`** for agent-bound packs. Reserve `.cursor/skills/<name>/SKILL.md` for [Cursor discoverable skills](https://cursor.com/docs/skills) that any chat may pull in by relevance—avoid duplicating the same content in both places unless you want global discovery.
