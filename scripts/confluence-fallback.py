#!/usr/bin/env python3
"""
Direct Confluence REST API fallback for Cloud Agents.

When the Atlassian MCP (plugin-atlassian-atlassian) is not available, this script
queries the Confluence REST API directly to find new pages created in the
Yesterday IST window — the only Confluence data the daily-work-update digest needs.

Usage:
    python scripts/confluence-fallback.py
    python scripts/confluence-fallback.py --json
    python scripts/confluence-fallback.py --space-key "~712020cb0bd6e5b43649f9a0f56211a8cc8799"

Output: formatted text or JSON to stdout with pages created in the window.

Required env vars:
    JIRA_EMAIL      — Atlassian account email (same as Jira)
    JIRA_API_TOKEN  — Atlassian API token (same token works for Confluence)
    JIRA_BASE_URL   — e.g. https://webgility.atlassian.net (Confluence shares the domain)
"""

import argparse
import base64
import json
import os
import sys
import urllib.request
import urllib.parse
from datetime import datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))


def get_auth_header() -> str:
    email = os.getenv("JIRA_EMAIL", "").strip()
    token = os.getenv("JIRA_API_TOKEN", "").strip()
    if not email or not token:
        print("ERROR: JIRA_EMAIL and JIRA_API_TOKEN required for Confluence REST",
              file=sys.stderr)
        sys.exit(1)
    encoded = base64.b64encode(f"{email}:{token}".encode()).decode()
    return f"Basic {encoded}"


def get_base_url() -> str:
    url = os.getenv("JIRA_BASE_URL", "https://webgility.atlassian.net").strip()
    return url.rstrip("/")


def cql_search(auth: str, base_url: str, cql: str, limit: int = 25) -> list:
    params = urllib.parse.urlencode({
        "cql": cql,
        "limit": limit,
        "expand": "version,space",
    })
    url = f"{base_url}/wiki/rest/api/content/search?{params}"
    req = urllib.request.Request(url)
    req.add_header("Authorization", auth)
    req.add_header("Accept", "application/json")

    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        body = exc.read().decode(errors="replace")
        print(f"ERROR: Confluence CQL search (HTTP {exc.code}): {body}",
              file=sys.stderr)
        return []

    return data.get("results", [])


def main():
    parser = argparse.ArgumentParser(
        description="Confluence REST API fallback for Cloud Agents"
    )
    parser.add_argument("--json", action="store_true",
                        help="Output raw JSON")
    parser.add_argument("--space-key", default=None,
                        help="Confluence space key to search (default: all spaces)")
    parser.add_argument("--account-id",
                        default="712020:cb0bd6e5-b436-49f9-a0f5-6211a8cc8799",
                        help="Confluence account ID for Krishna")
    args = parser.parse_args()

    auth = get_auth_header()
    base_url = get_base_url()

    now_ist = datetime.now(IST)
    yesterday = now_ist - timedelta(days=1)
    if now_ist.weekday() == 0:  # Monday
        yesterday = now_ist - timedelta(days=3)

    date_str = yesterday.strftime("%Y-%m-%d")

    space_clause = f' AND space = "{args.space_key}"' if args.space_key else ""
    cql = (
        f'type = page AND creator = "{args.account_id}"'
        f' AND created >= "{date_str}"'
        f' AND created < "{(yesterday + timedelta(days=1)).strftime("%Y-%m-%d")}"'
        f'{space_clause}'
        f' ORDER BY created DESC'
    )

    print(f"Searching Confluence: {cql}", file=sys.stderr)
    results = cql_search(auth, base_url, cql)

    pages = []
    for r in results:
        space_info = r.get("space", {})
        version_info = r.get("version", {})
        pages.append({
            "id": r.get("id"),
            "title": r.get("title"),
            "type": r.get("type"),
            "space_key": space_info.get("key", ""),
            "space_name": space_info.get("name", ""),
            "created_by": version_info.get("by", {}).get("displayName", ""),
            "created_date": version_info.get("when", ""),
            "url": f"{base_url}/wiki{r.get('_links', {}).get('webui', '')}",
        })

    if args.json:
        print(json.dumps(pages, indent=2))
    else:
        print(f"\n=== CONFLUENCE: New pages created ({date_str}) — {len(pages)} found ===")
        if not pages:
            print("  No new pages created in the window.")
        for i, p in enumerate(pages, 1):
            print(f"  {i}. {p['title']}")
            print(f"     Space: {p['space_name']} ({p['space_key']})")
            print(f"     Created: {p['created_date']}")
            print(f"     URL: {p['url']}")

    sys.exit(0)


if __name__ == "__main__":
    main()
