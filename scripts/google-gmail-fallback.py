#!/usr/bin/env python3
"""
Direct Gmail API fallback for Cloud Agents.

When the google-workspace MCP server is not available, this script queries
the Gmail API directly for meeting recaps, Gemini summaries, and actionable
emails in the yesterday IST window.

Usage:
    python scripts/google-gmail-fallback.py
    python scripts/google-gmail-fallback.py --json

Output: formatted text or JSON to stdout with matching emails.

Requires:
    - Bootstrapped credentials at ~/.google_workspace_mcp/credentials/<email>.json
    - Or env vars for auto-bootstrap (see bootstrap-google-credentials.py)
"""

import argparse
import json
import os
import subprocess
import sys
import urllib.request
import urllib.parse
from datetime import datetime, timedelta, timezone
from pathlib import Path

IST = timezone(timedelta(hours=5, minutes=30))
TOKEN_URI = "https://oauth2.googleapis.com/token"
GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me"


def load_credentials() -> dict:
    email = os.getenv("USER_GOOGLE_EMAIL", "").strip()
    if not email:
        print("ERROR: USER_GOOGLE_EMAIL not set", file=sys.stderr)
        sys.exit(1)

    creds_dir = Path.home() / ".google_workspace_mcp" / "credentials"
    cred_file = creds_dir / f"{email}.json"

    if not cred_file.exists():
        bootstrap = Path(__file__).parent / "bootstrap-google-credentials.py"
        if bootstrap.exists():
            result = subprocess.run(
                [sys.executable, str(bootstrap)],
                capture_output=True, text=True
            )
            if result.returncode != 0:
                print(f"Bootstrap failed: {result.stderr}", file=sys.stderr)
                sys.exit(1)

    if not cred_file.exists():
        print(f"ERROR: No credential file at {cred_file}", file=sys.stderr)
        sys.exit(1)

    with open(cred_file) as f:
        creds = json.load(f)

    expiry_str = creds.get("expiry", "")
    if expiry_str:
        try:
            expiry = datetime.fromisoformat(expiry_str)
            if expiry.tzinfo is None:
                expiry = expiry.replace(tzinfo=timezone.utc)
            if expiry < datetime.now(timezone.utc) + timedelta(minutes=5):
                creds = _refresh(creds, cred_file)
        except (ValueError, TypeError):
            pass

    return creds


def _refresh(creds: dict, cred_file: Path) -> dict:
    data = urllib.parse.urlencode({
        "client_id": creds["client_id"],
        "client_secret": creds["client_secret"],
        "refresh_token": creds["refresh_token"],
        "grant_type": "refresh_token",
    }).encode()

    req = urllib.request.Request(TOKEN_URI, data=data, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")

    with urllib.request.urlopen(req, timeout=15) as resp:
        token_resp = json.loads(resp.read())

    creds["token"] = token_resp["access_token"]
    if "refresh_token" in token_resp:
        creds["refresh_token"] = token_resp["refresh_token"]
    expires_in = token_resp.get("expires_in", 3600)
    creds["expiry"] = (
        datetime.now(timezone.utc) + timedelta(seconds=expires_in)
    ).isoformat()

    fd = os.open(str(cred_file), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(creds, f, indent=2)

    return creds


def gmail_search(access_token: str, query: str, max_results: int = 10) -> list:
    params = urllib.parse.urlencode({"q": query, "maxResults": max_results})
    url = f"{GMAIL_API}/messages?{params}"
    req = urllib.request.Request(url)
    req.add_header("Authorization", f"Bearer {access_token}")

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        body = exc.read().decode(errors="replace")
        print(f"ERROR: Gmail search (HTTP {exc.code}): {body}", file=sys.stderr)
        return []

    return data.get("messages", [])


def gmail_get_message(access_token: str, msg_id: str) -> dict:
    url = f"{GMAIL_API}/messages/{msg_id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date"
    req = urllib.request.Request(url)
    req.add_header("Authorization", f"Bearer {access_token}")

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError:
        return {}


def main():
    parser = argparse.ArgumentParser(
        description="Gmail direct API fallback for Cloud Agents"
    )
    parser.add_argument("--json", action="store_true",
                        help="Output raw JSON")
    args = parser.parse_args()

    creds = load_credentials()
    access_token = creds["token"]

    queries = [
        'subject:(recap OR summary OR "meeting notes" OR "action items" OR "Gemini") newer_than:2d',
        'from:(messages-noreply@google.com OR meet) newer_than:2d',
    ]

    all_messages = []
    seen_ids = set()

    for q in queries:
        hits = gmail_search(access_token, q)
        for h in hits:
            if h["id"] not in seen_ids:
                seen_ids.add(h["id"])
                msg = gmail_get_message(access_token, h["id"])
                if msg:
                    headers = {
                        hdr["name"]: hdr["value"]
                        for hdr in msg.get("payload", {}).get("headers", [])
                    }
                    all_messages.append({
                        "id": msg.get("id"),
                        "subject": headers.get("Subject", "(No subject)"),
                        "from": headers.get("From", ""),
                        "date": headers.get("Date", ""),
                        "snippet": msg.get("snippet", "")[:200],
                    })

    if args.json:
        print(json.dumps(all_messages, indent=2))
    else:
        print(f"\n=== GMAIL: Meeting recaps / Gemini summaries ({len(all_messages)} found) ===")
        if not all_messages:
            print("  No matching emails found.")
        for i, m in enumerate(all_messages, 1):
            print(f"  {i}. {m['subject']}")
            print(f"     From: {m['from']}  |  Date: {m['date']}")
            if m["snippet"]:
                print(f"     Snippet: {m['snippet'][:120]}...")


if __name__ == "__main__":
    main()
