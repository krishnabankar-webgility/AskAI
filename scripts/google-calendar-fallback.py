#!/usr/bin/env python3
"""
Direct Google Calendar API fallback for Cloud Agents.

When the google-workspace MCP server is not available (Cloud Agent environment),
this script queries the Google Calendar API directly using the bootstrapped
OAuth credentials from bootstrap-google-credentials.py.

Usage:
    python scripts/google-calendar-fallback.py --yesterday
    python scripts/google-calendar-fallback.py --today
    python scripts/google-calendar-fallback.py --yesterday --today

Output: JSON to stdout with calendar events for the requested day(s).

Requires:
    - Bootstrapped credentials at ~/.google_workspace_mcp/credentials/<email>.json
    - Or env vars: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET,
      GOOGLE_REFRESH_TOKEN, USER_GOOGLE_EMAIL (will bootstrap automatically)
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
CALENDAR_API = "https://www.googleapis.com/calendar/v3"


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
            print("Bootstrapping credentials...", file=sys.stderr)
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
                creds = refresh_token(creds, cred_file)
        except (ValueError, TypeError):
            pass

    return creds


def refresh_token(creds: dict, cred_file: Path) -> dict:
    data = urllib.parse.urlencode({
        "client_id": creds["client_id"],
        "client_secret": creds["client_secret"],
        "refresh_token": creds["refresh_token"],
        "grant_type": "refresh_token",
    }).encode()

    req = urllib.request.Request(TOKEN_URI, data=data, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            token_resp = json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        body = exc.read().decode(errors="replace")
        print(f"ERROR: Token refresh failed (HTTP {exc.code}): {body}", file=sys.stderr)
        sys.exit(1)

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


def get_events(access_token: str, time_min: str, time_max: str) -> list:
    params = urllib.parse.urlencode({
        "timeMin": time_min,
        "timeMax": time_max,
        "singleEvents": "true",
        "orderBy": "startTime",
        "maxResults": 50,
    })

    url = f"{CALENDAR_API}/calendars/primary/events?{params}"
    req = urllib.request.Request(url)
    req.add_header("Authorization", f"Bearer {access_token}")

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        body = exc.read().decode(errors="replace")
        print(f"ERROR: Calendar API (HTTP {exc.code}): {body}", file=sys.stderr)
        return []

    events = []
    for ev in data.get("items", []):
        if ev.get("status") == "cancelled":
            continue

        attendees = ev.get("attendees", [])
        my_status = "accepted"
        for att in attendees:
            if att.get("self"):
                my_status = att.get("responseStatus", "accepted")
                break

        if my_status == "declined":
            continue

        start = ev.get("start", {})
        end = ev.get("end", {})

        events.append({
            "summary": ev.get("summary", "(No title)"),
            "start": start.get("dateTime", start.get("date", "")),
            "end": end.get("dateTime", end.get("date", "")),
            "hangoutLink": ev.get("hangoutLink", ""),
            "meetLink": (ev.get("conferenceData", {})
                         .get("entryPoints", [{}])[0]
                         .get("uri", "") if ev.get("conferenceData") else ""),
            "attendees_count": len(attendees),
            "organizer": ev.get("organizer", {}).get("displayName",
                         ev.get("organizer", {}).get("email", "")),
            "response_status": my_status,
            "description": (ev.get("description", "") or "")[:200],
        })

    return events


def format_time_ist(iso_str: str) -> str:
    if not iso_str or "T" not in iso_str:
        return "All day"
    try:
        dt = datetime.fromisoformat(iso_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        dt_ist = dt.astimezone(IST)
        return dt_ist.strftime("%H:%M")
    except (ValueError, TypeError):
        return iso_str


def main():
    parser = argparse.ArgumentParser(
        description="Google Calendar direct API fallback for Cloud Agents"
    )
    parser.add_argument("--yesterday", action="store_true",
                        help="Fetch yesterday's events (IST)")
    parser.add_argument("--today", action="store_true",
                        help="Fetch today's events (IST)")
    parser.add_argument("--json", action="store_true",
                        help="Output raw JSON instead of formatted text")
    args = parser.parse_args()

    if not args.yesterday and not args.today:
        args.yesterday = True
        args.today = True

    creds = load_credentials()
    access_token = creds["token"]

    now_ist = datetime.now(IST)
    result = {}

    if args.yesterday:
        yesterday = now_ist - timedelta(days=1)
        if now_ist.weekday() == 0:  # Monday
            yesterday = now_ist - timedelta(days=3)  # Friday
        y_start = yesterday.replace(hour=0, minute=0, second=0, microsecond=0)
        y_end = yesterday.replace(hour=23, minute=59, second=59, microsecond=0)

        events = get_events(access_token, y_start.isoformat(), y_end.isoformat())
        result["yesterday"] = {
            "date": yesterday.strftime("%a, %b %d, %Y"),
            "date_short": yesterday.strftime("%b %d"),
            "events": events,
            "count": len(events),
        }

    if args.today:
        t_start = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
        t_end = now_ist.replace(hour=23, minute=59, second=59, microsecond=0)

        events = get_events(access_token, t_start.isoformat(), t_end.isoformat())
        result["today"] = {
            "date": now_ist.strftime("%a, %b %d, %Y"),
            "date_short": now_ist.strftime("%b %d"),
            "events": events,
            "count": len(events),
        }

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        for period, data in result.items():
            print(f"\n=== {period.upper()} ({data['date']}) — {data['count']} events ===")
            if not data["events"]:
                print("  No events.")
                continue
            for i, ev in enumerate(data["events"], 1):
                st = format_time_ist(ev["start"])
                et = format_time_ist(ev["end"])
                time_range = f"{st}–{et}" if et != "All day" else "All day"
                meet = ev.get("hangoutLink") or ev.get("meetLink") or ""
                meet_str = f" · Meet: {meet}" if meet else ""
                att = f" · {ev['attendees_count']} attendees" if ev["attendees_count"] else ""
                print(f"  {i}. {ev['summary']} — {time_range}{att}{meet_str}")

    sys.exit(0)


if __name__ == "__main__":
    main()
