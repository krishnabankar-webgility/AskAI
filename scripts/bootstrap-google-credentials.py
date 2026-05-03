#!/usr/bin/env python3
"""
Bootstrap Google OAuth credentials for Cursor Cloud Agents.

This script creates the credential file that workspace-mcp expects,
using environment variables injected by Cursor Cloud Agent Secrets.
It must run BEFORE the workspace-mcp server starts.

Required env vars (from Cursor Cloud Secrets):
    GOOGLE_OAUTH_CLIENT_ID
    GOOGLE_OAUTH_CLIENT_SECRET
    GOOGLE_REFRESH_TOKEN        <-- obtained via extract-google-refresh-token.py
    USER_GOOGLE_EMAIL           <-- e.g. krishna.bankar@webgility.com

Optional env vars:
    GOOGLE_OAUTH_SCOPES         <-- JSON array string, or omitted for defaults
    WORKSPACE_MCP_CREDENTIALS_DIR  <-- override credential storage path

The script:
  1. Reads the refresh token and client credentials from env.
  2. Exchanges the refresh token for a fresh access token via Google's
     token endpoint.
  3. Writes the credential JSON file to the path workspace-mcp expects.
  4. Exits 0 on success so the MCP server can start normally.
"""

import json
import os
import sys
import urllib.request
import urllib.parse
from datetime import datetime, timedelta
from pathlib import Path


TOKEN_URI = "https://oauth2.googleapis.com/token"

DEFAULT_READONLY_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
]


def get_credentials_dir() -> Path:
    for env_var in ("WORKSPACE_MCP_CREDENTIALS_DIR", "GOOGLE_MCP_CREDENTIALS_DIR"):
        val = os.getenv(env_var)
        if val:
            return Path(val).expanduser()
    return Path.home() / ".google_workspace_mcp" / "credentials"


def refresh_access_token(client_id: str, client_secret: str, refresh_token: str) -> dict:
    """Exchange a refresh token for a new access token."""
    data = urllib.parse.urlencode({
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }).encode()

    req = urllib.request.Request(TOKEN_URI, data=data, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        body = exc.read().decode(errors="replace")
        print(f"ERROR: Token refresh failed (HTTP {exc.code}): {body}", file=sys.stderr)
        sys.exit(1)


def main():
    client_id = os.getenv("GOOGLE_OAUTH_CLIENT_ID", "").strip()
    client_secret = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET", "").strip()
    refresh_token = os.getenv("GOOGLE_REFRESH_TOKEN", "").strip()
    user_email = os.getenv("USER_GOOGLE_EMAIL", "").strip()

    missing = []
    if not client_id:
        missing.append("GOOGLE_OAUTH_CLIENT_ID")
    if not client_secret:
        missing.append("GOOGLE_OAUTH_CLIENT_SECRET")
    if not refresh_token:
        missing.append("GOOGLE_REFRESH_TOKEN")
    if not user_email:
        missing.append("USER_GOOGLE_EMAIL")

    if missing:
        print(f"SKIP: Missing env var(s): {', '.join(missing)}", file=sys.stderr)
        print("Google Workspace MCP credentials not bootstrapped.", file=sys.stderr)
        print("Set these in Cursor Dashboard > Cloud Agents > Secrets.", file=sys.stderr)
        sys.exit(0)

    scopes_env = os.getenv("GOOGLE_OAUTH_SCOPES", "").strip()
    if scopes_env:
        try:
            scopes = json.loads(scopes_env)
        except json.JSONDecodeError:
            scopes = [s.strip() for s in scopes_env.split(",") if s.strip()]
    else:
        scopes = DEFAULT_READONLY_SCOPES

    creds_dir = get_credentials_dir()
    creds_dir.mkdir(parents=True, exist_ok=True)
    os.chmod(str(creds_dir), 0o700)

    print(f"Bootstrapping Google credentials for {user_email}...")
    print(f"Refreshing access token...")
    token_response = refresh_access_token(client_id, client_secret, refresh_token)

    access_token = token_response.get("access_token")
    expires_in = token_response.get("expires_in", 3600)
    new_refresh = token_response.get("refresh_token", refresh_token)

    if not access_token:
        print(f"ERROR: No access_token in response: {token_response}", file=sys.stderr)
        sys.exit(1)

    expiry = (datetime.utcnow() + timedelta(seconds=expires_in)).isoformat()

    creds_data = {
        "token": access_token,
        "refresh_token": new_refresh,
        "token_uri": TOKEN_URI,
        "client_id": client_id,
        "client_secret": client_secret,
        "scopes": scopes,
        "expiry": expiry,
    }

    cred_file = creds_dir / f"{user_email}.json"
    fd = os.open(str(cred_file), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(creds_data, f, indent=2)

    print(f"OK: Credentials written to {cred_file}")
    print(f"    Access token expires: {expiry}")
    print(f"    Scopes: {len(scopes)}")


if __name__ == "__main__":
    main()
