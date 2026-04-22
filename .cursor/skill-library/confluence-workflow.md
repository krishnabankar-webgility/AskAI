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
| `3027337225` | My Notes | Krishna Bankar (personal) | 2026-04-16 |
| `3027468311` | Images | Krishna Bankar (personal) | 2026-04-16 |
| `3027697689` | IMP SQL Scripts | Krishna Bankar (personal) | 2026-04-16 |
| `3027959816` | Customizations | Krishna Bankar (personal) | 2026-04-16 |

**Template container (under Public):** Atlassian MCP has **no** `createConfluenceFolder` tool. A **page** titled **`template`** (`3021045763`) sits under the **Public** folder and holds CS-facing template pages (same navigation goal as a subfolder). **Canonical pages:**

- **Customization Delivery** — ID `3021275138` [web](https://webgility.atlassian.net/wiki/spaces/~712020cb0bd6e5b43649f9a0f56211a8cc8799/pages/3021275138/Customization+Delivery) · [tiny `AgAVt`](https://webgility.atlassian.net/wiki/x/AgAVt) — HubSpot / CS handoff note (§7).
- **Comment for QA Testing** — ID `3021209607` [web](https://webgility.atlassian.net/wiki/spaces/~712020cb0bd6e5b43649f9a0f56211a8cc8799/pages/3021209607/Comment+for+QA+Testing) · [tiny `BwAUt`](https://webgility.atlassian.net/wiki/x/BwAUt) — RFT Jira comment (§8).
- **Customization Notes Template** — ID `3029205012` [web](https://webgility.atlassian.net/wiki/spaces/~712020cb0bd6e5b43649f9a0f56211a8cc8799/pages/3029205012/Customization+Notes+Template) · [tiny `FACOt`](https://webgility.atlassian.net/wiki/x/FACOt) — personal per-customer notes template used for pages inside the **Customizations** folder (§9).

**Customizations folder (`3027959816`):** Krishna's personal knowledge base (also referred to as the **“public customizations”** folder — the working folder where customization index pages live), one page per **Customer Issue**. Each page is titled `UD-<CUSTOMER_ISSUE_ID> <SUFFIX>` (e.g. `UD-31982 CIM`, `UD-28484 R-Bug`, `UD-29162 CFC`) and follows the **Customization Notes Template** structure. New pages are **appended last** in this folder when possible. See §9 for the full workflow.

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
| `3029205012` | Customization Notes Template | `3021045763` | 2026-04-17 |
| `3027632135` | Customization Dev Notes | `3027337225` (My Notes folder) | 2026-04-16 |
| `3027468302` | QBD Custom Field Code | `3027337225` (My Notes folder) | 2026-04-16 |
| `3024093188` | KPI Report — Customizations & Revenue (Oct 2025 – Mar 2026) | `2590998867` | 2026-04-13 |

### Page & Folder Hierarchy

```
Krishna Bankar Personal Space (2590998546)
│
├── [folder] Personal (3014819843)
│   └── ToDo Items & Questions (3014885382)
│
├── [folder] Public (3014361116)
│   └── [page] template (3021045763)
│       ├── Customization Delivery (3021275138)         — §7 HubSpot / CS handoff
│       ├── Comment for QA Testing (3021209607)         — §8 RFT Jira comment
│       └── Customization Notes Template (3029205012)   — §9 per-customer notes
│
├── [folder] My Notes (3027337225)
│   ├── Customization Dev Notes (3027632135)
│   └── QBD Custom Field Code (3027468302)
│
├── [folder] Images (3027468311)
├── [folder] IMP SQL Scripts (3027697689)
│
├── [folder] Customizations (3027959816)                — §9 one page per Customer Issue
│   ├── UD-28484 R-Bug (3027402782)
│   ├── UD-28263 RN-CIM (3027632155)
│   ├── UD-28605 CIM (3027697697)
│   ├── UD-28592 CIM (3027828786)
│   ├── UD-28444 CIM-FR (3027959817)
│   ├── UD-28429 CIM (3027566636)
│   ├── UD-28049 CIM-FR (3027697711)
│   ├── CSREQ-117 (3027337259)
│   ├── UD-28940 RN-CIM (3027566643)
│   ├── UD-28927 CIM (3027861582)
│   ├── UD-28947 CIM (3027370041)
│   ├── UD-29096 CIM (3027599394)
│   ├── UD-29162 CFC (3027501122)
│   ├── UD-29516 CFC+CIM (3027861589)
│   ├── UD-29102 CFC (3028123649)
│   ├── UD-29643 CFC (3027697734)
│   ├── UD-29646 CFC (3027599401)
│   ├── UD-29678 CFC (3028189185)
│   ├── UD-29679 CFC (3028189192)
│   ├── UD-29772 RN-CFC (3028320257)
│   ├── UD-29795 RN-CFC (3028353025)
│   ├── UD-29798 RN-CFC (3028484097)
│   ├── UD-29818 RN-CFC+CIM (3028221958)
│   ├── UD-28185 CIM (3028582401)
│   ├── UD-29819 CFC (3028189208)
│   ├── UD-29811 CIM (3028713473)
│   ├── UD-29773 CIM (3028418564)
│   ├── UD-30105 Bug (3028680706)
│   ├── UD-29365 CIM (3028549638)
│   ├── UD-29970 CIM (3028582422)
│   ├── UD-30422 FR-CIM (3028353033)
│   ├── UD-29830 CIM (3028451330)
│   ├── UD-29932 RN-CIM (3028353040)
│   ├── UD-29517 FR-CIM (3028516908)
│   ├── UD-30989 CIM (3028680714)
│   ├── UD-31982 CIM (3028713505)
│   ├── UD-32081 CIM (3031662599)                       — 2026-04-20 (CFC line on page; title CIM — CFC owned by other assignee)
│   └── UD-32242 R-Bug (3029008405)                     — created 2026-04-17 from Customization Notes Template
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
    ├── Amazon Inventory Report Help Doc
    └── KPI Report — Customizations & Revenue (Oct 2025 – Mar 2026) (3024093188)
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

**Repo skill (must stay aligned):** `jira-workflow.md` **§7** and **§3.7** (RFT handoff requires §7 after draft + confirmation). Default post target is the **Customer Issue**; **Bug-Fix** Stories with only a linked **Bug** → default **Bug** per §3.7 / §7.1. Draft in chat, ADF mentions, post only after confirmation.

**Exemplar in Jira:** [UD-31982?focusedCommentId=236780](https://webgility.atlassian.net/browse/UD-31982?focusedCommentId=236780).

### 9. Customization Notes Page (Personal Customizations folder)

**Triggers (treat as §9 create/update):** Phrases such as **“prepare a customizations personal page for Jira [UD-XXXXX]”**, **“prepare a customizations page …”**, **“new notes page for UD-XXXXX”**, or **“customization notes for UD-XXXXX”** — same workflow as below.

These are **personal short-form notes** in folder **`3027959816`** (the **Customizations** / “public customizations” folder), not long-form handoff docs. Keep the **default** to the minimal pattern (exemplars: **UD-32242 R-Bug**, **UD-32081 CIM**).

**Default vs extra (mandatory):**

- **Default (always do):** Read template `3029205012` / `FACOt`. `getJiraIssue` for the **Customer Issue** and linked **Stories** (CIM/CFC/Bug as needed). **Always** add a **`CFC:`** line (full URL + status) on the page **when a linked CFC Story exists** — even if **CFC is not** in the **page title** (see **Page title vs CFC ownership** below). Fill **full Jira browse URL + current status** for each line you add. HubSpot URL(s) from the Customer Issue description when present. **Scan the Customer Issue `description`** (and linked Story descriptions only if the user asks) for **customer credentials** and **DB / file-backup `https` links** (Dropbox, Drive, OneDrive, SharePoint, DB admin URLs, etc.); copy **only** what appears there into the matching template lines (`Backup:`, `Dropbox DB:`, `Login`/`Password`, `QBD / WD login`, `Database`, etc.) — **never** invent, **never** copy from another ticket. If the description has no creds or backup links, leave those lines blank. Pick **`UD-<CUSTOMER_ISSUE_ID> <SUFFIX>`** from Jira evidence and CFC ownership rules. **Do not** list **Jira sub-tasks** on the page by default. **Do not** add paragraphs, reproduction steps, status tickers, triage essays, or template fields the user did not ask to fill.
- **Extra (only if the user explicitly asks in that request or a follow-up):** Additional lines (e.g. sub-tasks, extra linked issues, PR/build lines filled, more HubSpot context, narrative). If the user only gives a Jira key and asks for a “personal page,” deliver **default** only.

**Template:** page `3029205012` (tiny `FACOt`) — **Customization Notes Template**. Mirror its structure; default fill matches the short exemplar pages, not a maximal dump of every template placeholder unless the user wants that.

**Page title:** `UD-<CUSTOMER_ISSUE_ID> <SUFFIX>` where `<SUFFIX>` is one of:

`CIM` (Customization Implementation) · `CFC` (Feasibility Check) · `FR` (Feature Request) · `R` (Retention) · `RN` (Right Network) · `RN-CIM` (RN customization) · `Bug` · `R-Bug` (Retention + Bug-Fix Story, e.g. `UD-28484 R-Bug`) · `CFC+CIM` · `FR-CIM` / `CIM-FR` · `RN-CFC` / `RN-CFC+CIM`.

**Page title vs CFC ownership (mandatory):** Krishna’s Jira **account ID** is **`712020:cb0bd6e5-b436-49f9-a0f5-6211a8cc8799`** (see table at top of this file). Use a **compound title that includes `CFC`** (e.g. **`CFC+CIM`**, **`RN-CFC+CIM`**) **only if** the linked **CFC Story** exists **and** `fields.assignee.accountId` on **that CFC Story** equals Krishna’s account ID (i.e. **you** owned feasibility). If the CFC Story assignee is **missing** or is **anyone else**, **do not** put `CFC` in the **page title** — use the suffix for **your** current phase instead (usually **`CIM`** when you own the implementation Story). **Regardless of title**, still add a **`CFC:`** line in the **page body** with full Jira URL + status when a CFC Story is linked.

**Suffix picked from Jira (after CFC title rule):** component `Retention` → `R`; Story summary `Bug-Fix :` → `Bug` (or `R-Bug` if component also Retention); `CIM :` / `CIF :` → `CIM`; `CFC :` → `CFC` **for title** only when **you** are assignee on that CFC Story; RN customer → prepend `RN-`. When ambiguous, ask.

**Jira links in notes (mandatory for §9 work).** Base URL: `https://webgility.atlassian.net/browse/<KEY>`. For **every** Jira key **you put on the page** (Customer Issue, Story, CFC, Bug — **not** sub-tasks unless the user asked for sub-tasks), write the **full browse URL** and the **current status** from `getJiraIssue` (e.g. `https://webgility.atlassian.net/browse/UD-32242 — To Do`). One issue per line unless the user asks to compress several keys onto one line.

**Backup / creds from Jira description.** On every §9 prepare/update, read **`description`** on the **Customer Issue** (plain text / markdown from `getJiraIssue`). Extract and add to the page: (1) any **`https` URLs** that point to **DB backups**, **Dropbox/shared files**, cloud drives, or **DB admin** tools; (2) explicit **customer credentials** or login details **only as they appear** in that description (map to template lines: `Backup:`, `Dropbox DB:`, `Store`/`Login`/`Password`, `Database`/`User`/`Password`, `QBD / WD login`, etc.). If nothing is present, leave those lines blank — do not invent.

**Create:**

1. `getJiraIssue` for the Customer Issue and linked Stories (CFC/CIM/Bug as needed) — include **`description`** on the Customer Issue. Pull **status**, HubSpot links, and **scan `description` for backup URLs and customer creds** to fill template lines (see above). **Do not** paste the entire description into Confluence as prose. **Skip sub-tasks** unless the user explicitly asked to include them.
2. CQL-dedupe `title="UD-XXXXX <SUFFIX>" AND space.key="~712020cb0bd6e5b43649f9a0f56211a8cc8799"`; if it exists, offer to update instead.
3. `createConfluencePage` with `spaceId=2590998546`, `parentId=3027959816` (Customizations folder), `title=UD-<ID> <SUFFIX>`, `contentFormat=markdown`. **Placement:** create as a **new child of `3027959816`** so it appears **at the end / last** among siblings (Confluence typically orders new pages after existing ones; if your MCP/API exposes an explicit “after” or position for ordering, prefer **last**). Do not insert in the middle of the folder unless the user asks.
4. Body = **default** short line list per exemplar pages (heading, Customer issue, Story and/or CFC lines as required by the case, HubSpot, blank Backup/Dropbox, short Notes). Full Jira URLs + status for each line. **No** default paragraphs, reproduction steps, status ticker, or triage narrative. **Extras** only if the user asked.

**Update:** resolve page by title → `getConfluencePage` → refresh Jira URL lines with `getJiraIssue` when statuses may have changed → `updateConfluencePage`.

**Rules:**

- Parent is **always** the Customizations folder (`3027959816`). New pages **last** in that folder when possible.
- Never invent PR URLs, builds, nodes, or credentials — leave the placeholder unless the user asked you to fill those lines **and** gave real values.
- Never copy credentials / Dropbox / PR URLs from one customer's page into another. Only populate those fields from **this** ticket’s Jira description (or what the user pastes for this ticket).
- **Default** = minimal exemplar-style body; **expand** only when the user explicitly requests extra content or fields.

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
