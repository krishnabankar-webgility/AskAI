#!/usr/bin/env python3
"""
Extract the Google OAuth refresh token from your local workspace-mcp credentials.

Run this on your LOCAL machine (where you already completed the browser OAuth
flow) to obtain the refresh token.  Then store the value as the Cursor Cloud
Agent secret  GOOGLE_REFRESH_TOKEN  so that Cloud Agents can authenticate
without an interactive browser.

Usage
-----
    python scripts/extract-google-refresh-token.py

The script looks for credential files under the default workspace-mcp
credentials directory (~/.google_workspace_mcp/credentials/).  If yours
is elsewhere, pass the directory:

    python scripts/extract-google-refresh-token.py /path/to/credentials

Output
------
Prints the refresh token and instructions to add it as a Cursor Cloud Secret.
"""

import json
import os
import sys
from pathlib import Path


def find_credentials_dir() -> Path:
    for env_var in ("WORKSPACE_MCP_CREDENTIALS_DIR", "GOOGLE_MCP_CREDENTIALS_DIR"):
        val = os.getenv(env_var)
        if val:
            return Path(val).expanduser()
    return Path.home() / ".google_workspace_mcp" / "credentials"


def main():
    if len(sys.argv) > 1:
        creds_dir = Path(sys.argv[1])
    else:
        creds_dir = find_credentials_dir()

    if not creds_dir.exists():
        print(f"ERROR: Credentials directory not found: {creds_dir}")
        print()
        print("Have you completed the Google OAuth flow locally?")
        print("Run the workspace-mcp server once via Cursor and authenticate")
        print("in your browser, then re-run this script.")
        sys.exit(1)

    json_files = list(creds_dir.glob("*.json"))
    json_files = [f for f in json_files if "oauth_states" not in f.name]

    if not json_files:
        print(f"ERROR: No credential files found in {creds_dir}")
        sys.exit(1)

    for cred_file in json_files:
        try:
            data = json.loads(cred_file.read_text())
        except (json.JSONDecodeError, OSError) as exc:
            print(f"  SKIP {cred_file.name}: {exc}")
            continue

        refresh_token = data.get("refresh_token")
        email = cred_file.stem
        scopes = data.get("scopes", [])

        print(f"File:          {cred_file}")
        print(f"Account:       {email}")
        print(f"Scopes:        {len(scopes)} scope(s)")
        print(f"Refresh token: {'PRESENT' if refresh_token else 'MISSING'}")

        if refresh_token:
            print()
            print("=" * 70)
            print("REFRESH TOKEN (copy this value):")
            print("=" * 70)
            print(refresh_token)
            print("=" * 70)
            print()
            print("Next steps:")
            print("  1. Go to: https://cursor.com/dashboard  (Cloud Agents > Secrets)")
            print("  2. Add a new secret:")
            print("       Name:  GOOGLE_REFRESH_TOKEN")
            print(f"       Value: {refresh_token}")
            print("  3. Cloud Agents will now auto-authenticate with Google Workspace")
            print()

            scopes_json = json.dumps(scopes)
            print("Optional — also store the scopes as a secret for completeness:")
            print(f"       Name:  GOOGLE_OAUTH_SCOPES")
            print(f"       Value: {scopes_json}")
        else:
            print("  WARNING: No refresh token found. Re-authenticate locally")
            print("  with prompt=consent to obtain a refresh token.")
        print()


if __name__ == "__main__":
    main()
