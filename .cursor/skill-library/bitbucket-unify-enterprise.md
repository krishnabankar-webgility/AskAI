# Skill: Bitbucket — `unify-enterprise` (Cloud Agent)

## Purpose

Use **Git over HTTPS** plus optional **Bitbucket MCP** so a Cursor Cloud Agent can work on `webgility/unify-enterprise` similarly to desktop Cursor: clone/read/analyze code, run tests, commit, push branches, and handle PRs (create draft PR, review via diff, comment when MCP is available).

## Secrets (Cursor Dashboard → Cloud Agents → Secrets)

These are injected as environment variables at agent runtime:

| Variable | Role |
|----------|------|
| `BITBUCKET_USERNAME` | Bitbucket **account username** (slug), e.g. `krishnabankar` — **not** an email address (`@` breaks URL parsing). |
| `BITBUCKET_TOKEN` | **Bitbucket HTTP access token** (repository/workspace scoped). **Not** an Atlassian `id.atlassian.com` API token (those are for Jira/Confluence only). Minimum scopes: **Repositories: Read**; add **Write** to push branches. |

If only `BITBUCKET_TOKEN` is set, **`x-token-auth`** as the username may work (see `AGENTS.md`). Prefer **username + token** when both are configured.

## Repository

| Item | Value |
|------|--------|
| Workspace | `webgility` |
| Repo slug | `unify-enterprise` |
| HTTPS clone URL | `https://bitbucket.org/webgility/unify-enterprise.git` |

## One-time remote URL (authenticated)

Before `git fetch` / `git pull` / `git push` against Bitbucket, set the remote URL so Git embeds credentials (Cloud Agent shell):

**Bash (encode token if it contains reserved URL characters):**

```bash
export BB_USER="${BITBUCKET_USERNAME}"
export BB_PASS_ENC="$(python3 -c "import os,urllib.parse; print(urllib.parse.quote(os.environ['BITBUCKET_TOKEN'], safe=''))")"
git remote set-url bitbucket "https://${BB_USER}:${BB_PASS_ENC}@bitbucket.org/webgility/unify-enterprise.git"
```

**PowerShell:**

```powershell
$enc = [uri]::EscapeDataString($env:BITBUCKET_TOKEN)
git remote set-url bitbucket "https://$($env:BITBUCKET_USERNAME):$enc@bitbucket.org/webgility/unify-enterprise.git"
```

If the remote is not named `bitbucket`, use `origin` or add:  
`git remote add bitbucket https://bitbucket.org/webgility/unify-enterprise.git` then `set-url` as above.

## Clone (fresh workspace)

```bash
git clone "https://${BITBUCKET_USERNAME}:$(python3 -c "import os,urllib.parse; print(urllib.parse.quote(os.environ['BITBUCKET_TOKEN'], safe=''))")@bitbucket.org/webgility/unify-enterprise.git" unify-enterprise
cd unify-enterprise
```

Use a **shallow clone** if the repo is large and you only need recent history:

```bash
git clone --depth 1 --branch master "https://..." unify-enterprise
```

## Day-to-day Git (parity with desktop)

| Goal | Command pattern |
|------|-----------------|
| Update local `master` | `git fetch bitbucket master` then `git checkout master && git merge bitbucket/master` (or `git pull bitbucket master`) |
| Feature branch | `git checkout -b feature/your-topic` |
| Commit | `git add -A && git commit -m "message"` |
| Push branch | `git push -u bitbucket feature/your-topic` |
| Sync with target branch | `git fetch bitbucket master && git merge bitbucket/master` (resolve conflicts if any) |

Follow safety rules in `git-sync.md` (status before merge, no force-push unless asked).

## .NET / tests (this repo)

The solution layout lives under `Desktop/` (multiple projects). Discover sln/csproj with search or:

```bash
find . -name "*.sln" | head -20
dotnet test path/to/Your.sln
```

Use `dotnet build` / `dotnet test` from the cloned root after `dotnet restore` as needed.

## PRs: Git vs Bitbucket MCP

| Action | Mechanism |
|--------|-----------|
| **Push branch** | Git (after authenticated `set-url`) |
| **Create PR / draft PR** | Bitbucket web UI, or **Bitbucket MCP** tools (`createPullRequest`, `createDraftPullRequest`) if MCP is connected and authenticated |
| **Review PR (diff, comments)** | **Bitbucket MCP**: `getPullRequest`, `getPullRequestDiff`, `getPullRequestComments`, etc. — **requires MCP auth** (401 if secrets only in Cloud Agent but MCP not linked to Bitbucket) |
| **Read full files on a branch** | **Local clone** + read/search tools — MCP alone usually does not expose arbitrary file paths |

Workflow: **push branch with Git → open or draft PR via MCP or UI → review using MCP diff or local `git diff`**.

## Troubleshooting

- **401 / authentication failed:** Confirm token is a **Bitbucket HTTP access token** with correct scopes; confirm username is the **slug**, not email; URL-encode the token in the URL.
- **403:** Token may lack **Write** (push) or **Read** (clone) on `unify-enterprise`.
- **MCP 401 on PR tools:** Git secrets do not automatically authenticate the Bitbucket MCP server — complete MCP OAuth/token setup in Cursor for Bitbucket, or use the website for PR actions.
