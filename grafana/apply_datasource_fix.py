#!/usr/bin/env python3
"""One-time fix that makes the WD Grafana dashboard fast.

The `Elasticsearch-WD` datasource (uid QEYi3BIDz) currently points at the
WILDCARD index `webgilitydesktop-*`. Every query therefore fans out across all
historical daily indices and `terms` aggregations time out under dashboard
concurrency. Switching the datasource to a TIME-BASED daily index pattern makes
Grafana query only the indices in the selected time range, so all panels load
in ~0.3s and the detail sections can be left open.

This script flips the datasource to:
    Index name : [webgilitydesktop-]YYYY.MM.DD
    Pattern    : Daily
    Time field : timestamp

It does NOT change the ES host, version, or anything else, and the resolved
index names are identical for any given day — so other dashboards using this
datasource keep working (and get faster too).

REQUIRES Grafana `datasources:write` (Admin). The `krishna.bankar` LDAP account
is only a Viewer, so ask a Grafana admin to run this, or apply the same change
in the UI: Connections -> Data sources -> Elasticsearch-WD -> set
"Index name" = [webgilitydesktop-]YYYY.MM.DD, "Pattern" = Daily -> Save & test.

Usage:
    GRAFANA_AUTH='admin_user:admin_pass' python3 grafana/apply_datasource_fix.py
    # or rely on $KIBANA_WD_AUTH if that account has admin rights
    python3 grafana/apply_datasource_fix.py --revert   # back to webgilitydesktop-*
"""
import base64
import json
import os
import sys
import urllib.request

GURL = os.environ.get("GRAFANA_URL", "https://systems.webgility.com/graph").rstrip("/")
AUTH = os.environ.get("GRAFANA_AUTH") or os.environ.get("KIBANA_WD_AUTH")
DS_UID = "QEYi3BIDz"


def http(method, url, data=None):
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", "Basic " + base64.b64encode(AUTH.encode()).decode())
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def main():
    revert = "--revert" in sys.argv
    status, body = http("GET", f"{GURL}/api/datasources/uid/{DS_UID}")
    if status != 200:
        print("ERROR fetching datasource:", status, body)
        sys.exit(1)
    ds = json.loads(body)
    jd = ds.get("jsonData", {}) or {}
    jd.setdefault("esVersion", "7.10.0")
    jd["timeField"] = "timestamp"
    jd.setdefault("maxConcurrentShardRequests", 5)

    if revert:
        ds["database"] = "webgilitydesktop-*"
        jd.pop("interval", None)
        print("Reverting to wildcard index webgilitydesktop-*")
    else:
        ds["database"] = "[webgilitydesktop-]YYYY.MM.DD"
        jd["interval"] = "Daily"
        print("Setting daily index pattern [webgilitydesktop-]YYYY.MM.DD (Pattern=Daily)")
    ds["jsonData"] = jd

    status, body = http("PUT", f"{GURL}/api/datasources/uid/{DS_UID}", json.dumps(ds).encode())
    print("PUT status:", status)
    print(body[:400])
    if status == 403:
        print("\nAccess denied: this account lacks datasources:write. Ask a Grafana admin to run "
              "this, or change it in the UI (Connections -> Data sources -> Elasticsearch-WD).")


if __name__ == "__main__":
    main()
