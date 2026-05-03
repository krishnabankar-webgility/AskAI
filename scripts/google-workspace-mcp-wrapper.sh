#!/usr/bin/env bash
# Wrapper that bootstraps Google OAuth credentials from env vars
# before launching workspace-mcp.  Used by .cursor/mcp.json so that
# Cursor Cloud Agents (which cannot complete interactive OAuth) get
# valid credentials on every fresh VM boot.
#
# On local desktop where GOOGLE_REFRESH_TOKEN is not set, the
# bootstrap step is skipped and workspace-mcp launches normally
# (using credentials from a prior interactive browser flow).
#
# Usage (standalone):
#   ./scripts/google-workspace-mcp-wrapper.sh --single-user --transport stdio ...
#
# Usage (from mcp.json, already configured):
#   The "command" in .cursor/mcp.json points to this script.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -n "${GOOGLE_REFRESH_TOKEN:-}" ]; then
    python3 "$SCRIPT_DIR/bootstrap-google-credentials.py" 2>&1 || true
fi

exec uvx workspace-mcp "$@"
