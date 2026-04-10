# Skill: Confluence Workflow (Cursor)

## Overview

This skill enables the **Confluence Automation Agent** to interact with the Webgility Confluence workspace via the **Atlassian MCP server** (`plugin-atlassian-atlassian`). It covers authentication, workspace context, available actions, page management, search, and evolving knowledge about the user's Confluence content.

---

## Atlassian Cloud Context

| Field | Value |
|---|---|
| Cloud ID | `a8ce84dd-8aa2-4dd1-b893-5b33a896f918` |
| Site URL | `https://webgility.atlassian.net` |
| Authenticated user | **Krishna Bankar** (`krishna.bankar@webgility.com`) |
| Account ID | `712020:cb0bd6e5-b436-49f9-a0f5-6211a8cc8799` |
| Personal space key | `~712020cb0bd6e5b43649f9a0f56211a8cc8799` |
| Personal space ID | `2590998546` |
| Personal space homepage ID | `2590998867` |

Always pass `cloudId` = `a8ce84dd-8aa2-4dd1-b893-5b33a896f918` when calling any Atlassian MCP tool.

---

## MCP Tools Available

### Confluence Tools

| Tool | Purpose |
|---|---|
| `getConfluenceSpaces` | List all spaces (global + personal) |
| `getPagesInConfluenceSpace` | List pages in a space by `spaceId` |
| `getConfluencePage` | Read a specific page (by `pageId`) |
| `getConfluencePageDescendants` | Get child/descendant pages of a page |
| `getConfluencePageFooterComments` | Read footer comments |
| `getConfluencePageInlineComments` | Read inline comments |
| `getConfluenceCommentChildren` | Get replies to a comment |
| `createConfluencePage` | Create a new page in a space |
| `updateConfluencePage` | Edit/update an existing page |
| `createConfluenceFooterComment` | Add a footer comment |
| `createConfluenceInlineComment` | Add an inline comment |
| `searchConfluenceUsingCql` | Search using CQL (Confluence Query Language) |
| `searchAtlassian` | Cross-product search (Jira + Confluence) |
| `fetchAtlassian` | Generic Atlassian REST API call (ARI-based) |

### Cross-Product Tools

| Tool | Purpose |
|---|---|
| `getAccessibleAtlassianResources` | Discover cloud IDs and available scopes |
| `atlassianUserInfo` | Get current user info |
| `lookupJiraAccountId` | Resolve display name → account ID |

---

## Key Spaces (Webgility Confluence)

These are the main **global** spaces the agent should know about:

| Space Name | Key | ID | Type |
|---|---|---|---|
| Apollo | `APOLLO` | `34754` | global |
| Webgility | `WEBGILITY` | `262145` | global |
| Team_infra | `TEAM` | `360454` | global |
| Business Operations | `OP` | `622597` | global |
| Quality Assurance | `QA` | `1310722` | global |
| Dev Engineering | `DE` | `1409026` | global |
| Webgility Online | `WO` | `3670222` | global |
| Marketing | `MAR` | `3671186` | global |
| India Operations | `IO` | `3702880` | global |
| Customer Success | `CS` | `3703022` | global |
| Sales | `SAL` | `3703164` | global |
| Webgility Desktop | `WD` | `3735558` | global |
| U.S. Operations | `UO` | `3735689` | global |
| Product Management | `PM` | `3735948` | global |
| User Interface | `UI` | `5374004` | global |
| Team Flux | `Flux` | `9273482` | global |
| Retention | `RET` | `12091505` | global |
| Database | `DAT` | `12615920` | global |
| Scrum of Scrums | `SOS` | `538116098` | global |
| Leadership | `LEAD` | `805371945` | global |
| WISH | `WISH` | `1115521027` | global |
| Apollo New Integration | `ANI` | `1175912464` | global |
| webgility-integration-ads-platforms | `wiap` | `1417871368` | global |
| Krishna Bankar (personal) | `~712020cb0bd6e5b43649f9a0f56211a8cc8799` | `2590998546` | personal |

---

## Krishna Bankar's Personal Space — Folders

Confluence "folders" are a newer content type (distinct from pages). These are the known folders:

| Folder ID | Title | Space | Created |
|---|---|---|---|
| `3014819843` | Personal | Krishna Bankar (personal) | 2026-04-03 |
| `3014361116` | Public | Krishna Bankar (personal) | 2026-04-03 |

**Template container (under Public):** Atlassian MCP has **no** `createConfluenceFolder` tool. A **page** titled **`template`** (`3021045763`) sits under the **Public** folder and holds CS-facing template pages (same navigation goal as a subfolder). **Canonical pages:** **Customization Delivery** — ID `3021275138` [web](https://webgility.atlassian.net/wiki/spaces/~712020cb0bd6e5b43649f9a0f56211a8cc8799/pages/3021275138/Customization+Delivery) · [tiny `AgAVt`](https://webgility.atlassian.net/wiki/x/AgAVt). **Comment for QA Testing** (RFT Jira comment) — ID `3021209607` [web](https://webgility.atlassian.net/wiki/spaces/~712020cb0bd6e5b43649f9a0f56211a8cc8799/pages/3021209607/Comment+for+QA+Testing) · [tiny `BwAUt`](https://webgility.atlassian.net/wiki/x/BwAUt).

**Important:** Confluence folders use `type=folder` in CQL, not `type=page`. The v2 page API (`getConfluencePage`) returns 404 for folders. To find folders, use `searchConfluenceUsingCql` with `type=folder`.

To create pages **inside** a folder, use `createConfluencePage` with `parentId` set to the folder's content ID.

---

## Krishna Bankar's Personal Space — Known Pages

These pages are in the personal space (space ID `2590998546`). The agent should keep this catalog up to date as new pages are created or existing ones are renamed/moved.

| Page ID | Title | Parent ID | Created |
|---|---|---|---|
| `2590998867` | Overview (homepage) | — | 2025-03-04 |
| `2721939459` | Opening 32-bit .NET Framework Forms in 64-bit Visual Studio 2022 | `2590998867` | 2025-06-18 |
| `2745434170` | My To-do List | `2590998867` | 2025-07-10 |
| `2841444370` | Partial Shipments: Create Invoice & Payment Against Sales Order | `2590998867` | 2025-10-10 |
| `2900918273` | FR: Download and sync the purchase order from Lightspeed to QBD as vendor bills | `2590998867` | 2025-12-08 |
| `2902360101` | Download settings for Lightspeed purchase orders | `2900918273` | 2025-12-10 |
| `2901639354` | ExpirationDateForSerialLotNumber | `2900918273` | 2025-12-10 |
| `2929164290` | Handling Refunds and Returns: Shopify to QBD Workflow | `2590998867` | 2026-01-09 |
| `2930704420` | PO Detailed Workflow: Purchase Orders => Item Receipt => Bill Creation | `2900918273` | 2026-01-12 |
| `2993487893` | Amazon Inventory Report Help Doc | `2590998867` | 2026-03-13 |
| `3014885382` | ToDo Items & Questions | `3014819843` (Personal folder) | 2026-04-03 |
| `3021045763` | template (CS template container page) | `3014361116` (Public folder) | 2026-04-10 |
| `3021275138` | Customization Delivery | `3021045763` | 2026-04-10 |
| `3021209607` | Comment for QA Testing | `3021045763` | 2026-04-10 |

### Page & Folder Hierarchy

```
Krishna Bankar Personal Space (2590998546)
│
├── [folder] Personal (3014819843)
│   └── ToDo Items & Questions (3014885382)
│
├── [folder] Public (3014361116)
│   └── [page] template (3021045763)
│       ├── Customization Delivery (3021275138)
│       └── Comment for QA Testing (3021209607)
│
└── [page] Overview (2590998867)
    ├── Opening 32-bit .NET Framework Forms in 64-bit VS 2022
    ├── My To-do List
    ├── Partial Shipments: Create Invoice & Payment Against Sales Order
    ├── FR: Download and sync PO from Lightspeed to QBD as vendor bills (2900918273)
    │   ├── Download settings for Lightspeed purchase orders
    │   ├── ExpirationDateForSerialLotNumber
    │   └── PO Detailed Workflow: Purchase Orders => Item Receipt => Bill Creation
    ├── Handling Refunds and Returns: Shopify to QBD Workflow
    └── Amazon Inventory Report Help Doc
```

---

## CQL Search Patterns

Common CQL queries the agent should use:

| Goal | CQL |
|---|---|
| My recent pages | `type=page AND creator=currentUser() order by created desc` |
| Pages in a space | `type=page AND space.key="<KEY>" order by lastModified desc` |
| Recently modified anywhere | `type=page AND lastModified >= 'YYYY-MM-DD' order by lastModified desc` |
| Full-text search | `type=page AND text ~ "keyword" order by lastModified desc` |
| Pages I modified | `type=page AND contributor=currentUser() order by lastModified desc` |
| Spaces created recently | `type=space AND created >= 'YYYY-MM-DD'` |
| Folders in a space | `type=folder AND space.key="<KEY>" order by created desc` |
| Pages under a parent | Use `getConfluencePageDescendants` with `pageId` |

---

## Workflows

### 1. Read a page

1. If user gives a URL, extract the page ID or space key + title from the URL.
2. Call `getConfluencePage` with `pageId` and `cloudId`.
3. Return the content in a readable format.

### 2. Create a page

1. Determine the target space (default: personal space `2590998546`).
2. Determine the parent (default: personal homepage `2590998867`; or a folder ID if placing inside a folder).
3. Call `createConfluencePage` with `spaceId`, `title`, `body`, and optionally `parentId`.
4. Update the **Known Pages** section in this skill file via `/agent-learning`.

### 3. Create pages inside a folder

1. Use the folder's content ID as `parentId` in `createConfluencePage`.
2. For sub-pages, use the parent page's ID as `parentId`.
3. Update the hierarchy tree in this skill file.

### 4. Update a page

1. Find the page by title search or known ID.
2. Read the current content with `getConfluencePage`.
3. Call `updateConfluencePage` with the updated body and incremented `version.number`.
4. Confirm success.

### 5. Search across Confluence

1. Use `searchConfluenceUsingCql` for structured queries.
2. Use `searchAtlassian` for cross-product (Jira + Confluence) search.
3. Present results with title, space, URL, and excerpt.

### 6. Organize pages (folder structure)

Confluence now supports native folders (content type `folder`). Pages can be created inside folders using the folder's ID as `parentId`. To discover folders, use CQL with `type=folder`.

### 7. Customization Delivery template (HubSpot + Customer Success)

Use when the user asks for a **HubSpot note**, **CS installation handoff**, or **Customization Delivery** wording after dev + QA.

**Source of truth:** `getConfluencePage` (`pageId` **`3021275138`**, tiny **`AgAVt`**) — [Customization Delivery](https://webgility.atlassian.net/wiki/spaces/~712020cb0bd6e5b43649f9a0f56211a8cc8799/pages/3021275138/Customization+Delivery). The page is **template only**: bracketed `[FILL …]` / `[INSERT …]` placeholders and fixed boilerplate — **no** pre-filled example from a specific customer or Jira key. Each new customization **replaces every placeholder** from the **current** Customer Issue and release; **never** copy body text from a different ticket or prior note.

**Agent output rules (mandatory):**

1. Start from the Confluence template **structure** (same section titles and order). **Replace** all `[FILL …]` / `[INSERT …]` lines with content from the **active** Jira Customer Issue (and installer URL from release). Output **only** that filled note — no preamble, no “here is your note”, no Jira URLs unless the user asks.
2. **Installer URL:** from release / build owner — **never invent** (`jira-workflow.md` §7.4). If unknown, keep the `[INSERT INSTALLER URL …]` line and ask **only** for that link.
3. **Do not** paste a previous customization’s Details, Limitations, or Note into a new ticket — always pull fresh from the **current** issue.
4. **CC:** add @mentions only when specified by the user or issue; otherwise leave `CC:` empty or as given.

**If MCP is unavailable**, use the canonical template below (must match Confluence).

| Placeholder | Source (per ticket) |
|-------------|---------------------|
| `[INSERT INSTALLER URL …]` | Approved offline installer for **this** build only |
| `[SHORT FEATURE LABEL …]` | Jira / implementation summary phrase |
| `[NODE_PREFIX]`, ProfileID | Development (customization node name) |
| Customization Details + direction lines | Jira **Customer Issue** description |
| Store / Accounting | Jira Customer Issue fields |
| Use Cases & Limitations | Jira Customer Issue — **rewrite each time** |
| Note | Customer Issue or QA/RFT comment, or omit |

**Canonical template (placeholder version — must match Confluence page):**

```
Hi ,

Customization Completed and Ready for Installation:

Development and testing for this customization are complete. Please install the Webgility Desktop offline build for this customization using the link

Custom installer

[INSERT INSTALLER URL — use the approved build for this release only; do not reuse another customer or ticket's link]

Installation Instructions

Install Webgility Desktop from the installer link above.

Open APIconfig in the XML folder under the Webgility install path.

Add the customization node for [SHORT FEATURE LABEL — from Jira / implementation] (profile-specific):

If <CustomizationNode> already exists, add this entry as a comma-separated value.

Use: [NODE_PREFIX]_<ProfileID> — replace NODE_PREFIX with the node name from development, and <ProfileID> with the customer's profile number (example: YOURNODE_1 for profile 1).

Customization Details

[FILL from Jira Customer Issue description: what the customization does, scope, data flow. New ticket = new text.]

[FILL: one-way vs other direction; which systems — from Jira.]

Store: [FILL from Jira]

Accounting: [FILL from Jira]

Use Cases & Limitations

[FILL with bullets from Jira Customer Issue — limitations and operational rules. Rewrite per ticket; do not copy a prior customization's note.]

Note

[FILL: optional QA / implementation caveat from Customer Issue or RFT comment. Omit this section if none.]

Let us know if any further assistance is needed!

CC:
```

**Jira coordination:** Customer Issue is often linked from the dev Story via **Relates** — for QA handoff wording see `jira-workflow.md` §7 and Confluence §8 (page `3021209607`).

### 8. Comment for QA Testing (RFT Jira comment template)

Use when the user asks for a **Comment for QA Testing**, **RFT**, or **Ready For Testing** Jira comment on a customization **Customer Issue**.

**Source of truth (preferred):** `getConfluencePage` with `pageId` **`3021209607`** (tiny **`BwAUt`**). Canonical URL: [Comment for QA Testing](https://webgility.atlassian.net/wiki/spaces/~712020cb0bd6e5b43649f9a0f56211a8cc8799/pages/3021209607/Comment+for+QA+Testing).

**Repo skill (must stay aligned):** `jira-workflow.md` **§7** — draft in chat, ADF mentions, post only on Customer Issue after confirmation.

**Exemplar in Jira:** [UD-31982?focusedCommentId=236780](https://webgility.atlassian.net/browse/UD-31982?focusedCommentId=236780).

---

## Self-Improvement Protocol

This agent is designed to **evolve**. After every session that changes Confluence content:

1. **New pages created** → Add to the Known Pages table and hierarchy tree.
2. **Pages renamed** → Update the title in Known Pages.
3. **Pages moved** → Update the parent ID and hierarchy.
4. **Pages deleted** → Remove from Known Pages.
5. **New folders created** → Add to the Folders table.
6. **New spaces discovered** → Add to Key Spaces table.
7. **New workflows learned** → Add to the Workflows section.
8. **User preferences observed** → Document in the Preferences section.

Use the `/agent-learning` subagent to persist these updates to this file.

---

## User Preferences (Krishna Bankar)

- Primary workspace: personal space + Dev Engineering + Webgility Desktop
- Documentation style: detailed technical specs with workflow diagrams, QBD/QBXML references
- Common topics: Purchase Orders, Invoicing, Partial Shipments, Inventory, Lightspeed, Shopify, QuickBooks Desktop
- Preferred format: markdown with tables, numbered steps, status emoji
- Personal folder structure: "Personal" folder for private notes, "Public" folder for shared content

---

## Constraints

- **Never** expose Atlassian API tokens or credentials in output.
- Always pass `cloudId` when calling MCP tools — do not make the user look it up.
- Resolve channel/space names to IDs before calling tools that require IDs.
- For **bulk operations** (mass page creation, deletion), confirm with the user first.
- When creating pages, default to the user's personal space unless another space is specified.
- Always check if a page with the same title already exists before creating a duplicate.

---

## Output Format

```
Confluence action: <action taken>
   Space: <space name>
   Page: <page title>
   URL: <webui link>
   Result: <confirmation or data summary>
```

For errors:
```
Confluence error: <error description>
   Suggested fix: <solution>
```

---

## Troubleshooting

| Issue | Solution |
|---|---|
| `401 Unauthorized` | Check Atlassian MCP auth — may need to re-authenticate via `mcp_auth` |
| `404 Not Found` | Verify page/space ID; for folders use CQL search instead of `getConfluencePage` |
| `403 Forbidden` | User may not have permission to that space; check space permissions |
| MCP not responding | Verify `plugin-atlassian-atlassian` is enabled in Cursor MCP settings |
| Stale page catalog | Re-run `getPagesInConfluenceSpace` and update Known Pages in this file |
| Folder not found via page API | Folders are `type=folder`, not `type=page`; use CQL with `type=folder` |
