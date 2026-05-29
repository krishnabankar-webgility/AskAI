#!/usr/bin/env python3
"""Generate the WD-Dashboard Grafana model that replicates the daily Kibana
HTML report (see .cursor/skill-library/wd-es-kibana.skill.md) as native
Elasticsearch panels.

The dashboard reads the `Elasticsearch-WD` datasource (uid QEYi3BIDz ->
webgilitydesktop-* / timeField=timestamp) so it costs $0 of LLM spend and
fully supports the built-in time-range picker.

Usage:
    python3 grafana/build_wd_dashboard.py            # write grafana/wd-dashboard.json
    python3 grafana/build_wd_dashboard.py --push     # also upsert into live Grafana

Push reads:
    GRAFANA_URL        (default https://systems.webgility.com/graph)
    GRAFANA_AUTH       (default $KIBANA_WD_AUTH -> "user:pass" basic auth)
"""
import base64
import json
import os
import sys
import urllib.parse
import urllib.request

DS = {"type": "elasticsearch", "uid": "QEYi3BIDz"}
DASH_UID = "UpKNy11vk"
DASH_TITLE = "WD-Dashboard"
KIBANA_INDEX = "61237d60-0ed9-11eb-816a-cde07dc15a1f"
KIBANA_BASE = "https://kibana-wd.webgility.com"

_pid = [0]
_qid = [0]


def pid():
    _pid[0] += 1
    return _pid[0]


def qref():
    _qid[0] += 1
    n = _qid[0]
    return chr(ord("A") + (n - 1) % 26) + ("" if n <= 26 else str((n - 1) // 26))


def _kibana_url(encoded_query):
    return (
        f"{KIBANA_BASE}/app/kibana#/discover?"
        "_g=(refreshInterval:(pause:!t,value:0),"
        "time:(from:'${__from:date:iso}',to:'${__to:date:iso}'))"
        "&_a=(columns:!(timestamp,level,message,store,module,subscriberID),"
        f"index:'{KIBANA_INDEX}',interval:auto,"
        f"query:(language:kuery,query:'{encoded_query}'),sort:!(!(timestamp,desc)))"
    )


def kibana_link(kql, title="Open in Kibana (synced time range)"):
    """Kibana 7.6.2 Discover deep-link whose time range follows the Grafana picker."""
    return {"title": title, "url": _kibana_url(urllib.parse.quote(kql, safe="")), "targetBlank": True}


def kibana_cell_link(kql_prefix, title="Open this row in Kibana"):
    """Deep-link whose KQL ends with the clicked table cell value.

    `kql_prefix` is everything before the dynamic value, e.g.
    'level.keyword:"Error" AND subscriberID:'. The cell value is appended via
    the Grafana data-link variable ${__value.raw}, kept literal (subscriber IDs
    are integers, so no URL-encoding is needed)."""
    enc = urllib.parse.quote(kql_prefix, safe="")
    return {"title": title, "url": _kibana_url(enc + "${__value.raw}"), "targetBlank": True}


def es_target(query="*", metrics=None, buckets=None, ref=None):
    return {
        "datasource": DS,
        "query": query,
        "alias": "",
        "metrics": metrics or [{"id": "1", "type": "count"}],
        "bucketAggs": buckets if buckets is not None else [],
        "timeField": "timestamp",
        "refId": ref or qref(),
    }


def terms_bucket(field, size=10, order_by="_count"):
    return [{
        "id": "2",
        "type": "terms",
        "field": field,
        "settings": {"size": str(size), "order": "desc", "orderBy": order_by, "min_doc_count": "1"},
    }]


def date_hist(level_split=False):
    dh = {"id": "2", "type": "date_histogram", "field": "timestamp",
          "settings": {"interval": "auto", "min_doc_count": "0"}}
    if level_split:
        return [{"id": "3", "type": "terms", "field": "level.keyword",
                 "settings": {"size": "5", "order": "desc", "orderBy": "_count", "min_doc_count": "1"}}, dh]
    return [dh]


def base(panel_id, title, ptype, x, y, w, h, links=None, desc=""):
    return {
        "id": panel_id,
        "title": title,
        "type": ptype,
        "description": desc,
        "datasource": DS,
        "gridPos": {"x": x, "y": y, "w": w, "h": h},
        "links": links or [],
        "options": {},
        "fieldConfig": {"defaults": {}, "overrides": []},
        "targets": [],
    }


def stat_panel(title, kql, x, y, w=4, h=4, color="blue", unit="short",
               metrics=None, reducer="lastNotNull", desc=""):
    p = base(pid(), title, "stat", x, y, w, h, links=[kibana_link(kql)], desc=desc)
    p["targets"] = [es_target(kql, metrics=metrics)]
    p["fieldConfig"]["defaults"] = {
        "unit": unit,
        "color": {"mode": "fixed", "fixedColor": color},
        "mappings": [],
    }
    p["options"] = {
        "reduceOptions": {"calcs": [reducer], "fields": "", "values": False},
        "orientation": "auto",
        "textMode": "value",
        "colorMode": "background",
        "graphMode": "area",
        "justifyMode": "auto",
    }
    return p


def bargauge_panel(title, kql, field, x, y, w, h, size=10, color="orange", desc=""):
    p = base(pid(), title, "bargauge", x, y, w, h, links=[kibana_link(kql)], desc=desc)
    p["targets"] = [es_target(kql, buckets=terms_bucket(field, size))]
    p["fieldConfig"]["defaults"] = {
        "color": {"mode": "fixed", "fixedColor": color},
        "unit": "short",
        "mappings": [],
        "thresholds": {"mode": "absolute", "steps": [{"color": color, "value": None}]},
    }
    p["options"] = {
        "displayMode": "gradient",
        "orientation": "horizontal",
        "showUnfilled": True,
        "reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": True},
    }
    return p


def table_panel(title, kql, field, x, y, w, h, size=15,
                drilldown_kql=None, cell_prefix=None, sort_by="Count", desc=""):
    p = base(pid(), title, "table", x, y, w, h, links=[kibana_link(kql)], desc=desc)
    p["targets"] = [es_target(kql, buckets=terms_bucket(field, size))]
    p["fieldConfig"]["defaults"] = {"custom": {"align": "auto", "filterable": True}, "mappings": []}
    overrides = []
    link = None
    if cell_prefix is not None:
        link = kibana_cell_link(cell_prefix)
    elif drilldown_kql is not None:
        link = kibana_link(drilldown_kql, title="Open in Kibana")
    if link is not None:
        overrides.append({
            "matcher": {"id": "byName", "options": field},
            "properties": [{"id": "links", "value": [link]}],
        })
    p["fieldConfig"]["overrides"] = overrides
    p["options"] = {"showHeader": True, "footer": {"show": False}}
    p["transformations"] = [{"id": "sortBy", "options": {"sort": [{"field": sort_by, "desc": True}]}}]
    return p


def timeseries_levels(title, x, y, w, h, desc=""):
    p = base(pid(), title, "timeseries", x, y, w, h,
             links=[kibana_link('level.keyword:"Error" or level.keyword:"Fatal"')], desc=desc)
    p["targets"] = [es_target('level.keyword:"Error" or level.keyword:"Fatal" or level.keyword:"Warning"',
                              buckets=date_hist(level_split=True))]
    p["fieldConfig"]["defaults"] = {
        "custom": {"drawStyle": "bars", "fillOpacity": 70, "lineWidth": 1,
                   "stacking": {"group": "A", "mode": "normal"}, "axisPlacement": "auto"},
        "color": {"mode": "palette-classic"},
        "unit": "short",
    }
    p["options"] = {"legend": {"calcs": ["sum"], "displayMode": "table", "placement": "right",
                               "showLegend": True}, "tooltip": {"mode": "multi", "sort": "desc"}}
    return p


def piechart_panel(title, kql, field, x, y, w, h, size=10, desc=""):
    p = base(pid(), title, "piechart", x, y, w, h, links=[kibana_link(kql)], desc=desc)
    p["targets"] = [es_target(kql, buckets=terms_bucket(field, size))]
    p["fieldConfig"]["defaults"] = {"color": {"mode": "palette-classic"}, "mappings": [],
                                    "custom": {"hideFrom": {"legend": False, "tooltip": False, "viz": False}}}
    p["options"] = {"pieType": "donut", "reduceOptions": {"calcs": ["lastNotNull"], "values": True},
                    "legend": {"displayMode": "table", "placement": "right", "values": ["value", "percent"]},
                    "tooltip": {"mode": "single"}}
    return p


def text_panel(title, x, y, w, h, md):
    p = base(pid(), title, "text", x, y, w, h)
    p["options"] = {"mode": "markdown", "content": md}
    del p["targets"]
    del p["datasource"]
    return p


def row(title, y, collapsed=False, panels=None):
    return {"id": pid(), "type": "row", "title": title, "collapsed": collapsed,
            "gridPos": {"x": 0, "y": y, "w": 24, "h": 1}, "panels": panels or []}


def build_panels():
    panels = []
    y = 0

    panels.append(text_panel("About", 0, y, 24, 3,
        "## WD Kibana Daily Report — Grafana edition\n"
        "Same insights as the daily HTML/Slack report (`reports/wd-kibana-logs/`) over "
        "**`webgilitydesktop-*`** via the **Elasticsearch-WD** datasource — **no LLM cost**. "
        "Use the **time-range picker** (top-right) to pick any window; default is the report window "
        "*yesterday 09:00 → today 09:00 IST*. Every panel links out to the matching **Kibana Discover** "
        "view with the same time range."))
    y += 3

    # 1. Executive Summary
    panels.append(row("📊 Executive Summary", y)); y += 1
    panels.append(stat_panel("Total Events", "*", 0, y, color="blue"))
    panels.append(stat_panel("Errors", 'level.keyword:"Error"', 4, y, color="orange"))
    panels.append(stat_panel("Fatals", 'level.keyword:"Fatal"', 8, y, color="red"))
    panels.append(stat_panel("Warnings", 'level.keyword:"Warning"', 12, y, color="yellow"))
    panels.append(stat_panel("Info", 'level.keyword:"Info"', 16, y, color="green"))
    er = base(pid(), "Error Rate", "gauge", 20, y, 4, 4,
              links=[kibana_link('level.keyword:"Error"')],
              desc="Errors / Total events for the selected window")
    er["targets"] = [es_target('level.keyword:"Error"', ref="A"), es_target("*", ref="B")]
    er["transformations"] = [{
        "id": "calculateField",
        "options": {"mode": "binary", "binary": {"left": "A", "operator": "/", "right": "B"},
                    "alias": "Error Rate", "replaceFields": True},
    }]
    er["fieldConfig"]["defaults"] = {
        "unit": "percentunit", "min": 0, "max": 1,
        "thresholds": {"mode": "absolute", "steps": [
            {"color": "green", "value": None}, {"color": "yellow", "value": 0.1},
            {"color": "orange", "value": 0.25}, {"color": "red", "value": 0.5}]},
    }
    er["options"] = {"reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False},
                     "showThresholdLabels": False, "showThresholdMarkers": True}
    panels.append(er)
    y += 4

    # 2. Hourly timeline
    panels.append(row("⏱ Error / Fatal / Warning Timeline", y)); y += 1
    panels.append(timeseries_levels("Events over time by level", 0, y, 24, 8,
        desc="Stacked counts by level across the selected window (bucketed automatically)."))
    y += 8

    # 3. Error breakdown
    panels.append(row("🧩 Error Breakdown", y)); y += 1
    panels.append(bargauge_panel("Errors by Module", 'level.keyword:"Error"', "module.keyword", 0, y, 6, 9, 12, "orange"))
    panels.append(bargauge_panel("Errors by Store", 'level.keyword:"Error"', "store.keyword", 6, y, 6, 9, 12, "purple"))
    panels.append(bargauge_panel("Errors by Tag", 'level.keyword:"Error"', "tag.keyword", 12, y, 6, 9, 12, "blue"))
    panels.append(bargauge_panel("Errors by Process", 'level.keyword:"Error"', "process.keyword", 18, y, 6, 9, 12, "green"))
    y += 9

    # 4/5 Top messages + subscribers
    panels.append(row("🔝 Top Error Messages & Subscribers", y)); y += 1
    panels.append(table_panel("Top Error Messages", 'level.keyword:"Error"', "message.keyword", 0, y, 12, 10, 15,
        drilldown_kql='level.keyword:"Error"'))
    panels.append(table_panel("Top Error Subscribers", 'level.keyword:"Error"', "subscriberID", 12, y, 12, 10, 15,
        cell_prefix='level.keyword:"Error" AND subscriberID:'))
    y += 10

    # 6. Fatal events
    panels.append(row("💀 Fatal Events", y)); y += 1
    panels.append(table_panel("Fatal by Message", 'level.keyword:"Fatal"', "message.keyword", 0, y, 12, 8, 15,
        drilldown_kql='level.keyword:"Fatal"'))
    panels.append(piechart_panel("Fatal by Store", 'level.keyword:"Fatal"', "store.keyword", 12, y, 12, 8, 10))
    y += 8

    # 7. Shopify payout
    panels.append(row("💳 Shopify Payout Performance", y)); y += 1
    payout_q = 'store.keyword:"Shopify" AND module.keyword:"PayoutPosting"'
    panels.append(stat_panel("Payouts Processed", payout_q, 0, y, 6, 4, "green", "short",
        metrics=[{"id": "1", "type": "sum", "field": "processedRecords"}],
        desc="Sum of processedRecords for Shopify PayoutPosting"))
    panels.append(stat_panel("Payout Log Events", payout_q, 6, y, 6, 4, "blue"))
    panels.append(stat_panel("Payout Subscribers", payout_q, 12, y, 6, 4, "purple", "short",
        metrics=[{"id": "1", "type": "cardinality", "field": "subscriberID"}]))
    panels.append(stat_panel("Avg Rate (rec/s)", payout_q + ' AND averagePerSecond:>0', 18, y, 6, 4, "orange", "short",
        metrics=[{"id": "1", "type": "avg", "field": "averagePerSecond"}]))
    y += 4
    pt = table_panel("Top Payout Subscribers (by records)", payout_q, "subscriberID", 0, y, 24, 8, 10,
        cell_prefix='module.keyword:"PayoutPosting" AND subscriberID:', sort_by="processedRecords Sum")
    pt["targets"] = [es_target(payout_q, metrics=[{"id": "1", "type": "sum", "field": "processedRecords"}],
                               buckets=terms_bucket("subscriberID", 10, order_by="1"))]
    panels.append(pt)
    y += 8

    # 8. Amazon settlement
    panels.append(row("🛒 Amazon Settlement Report", y)); y += 1
    amz_q = 'module.keyword:"AmazonSettlementReport"'
    panels.append(stat_panel("Settlement Events", amz_q, 0, y, 6, 4, "blue"))
    panels.append(stat_panel("Settlement Errors", amz_q + ' AND level.keyword:"Error"', 6, y, 6, 4, "red"))
    panels.append(stat_panel("Records Processed", amz_q, 12, y, 6, 4, "green", "short",
        metrics=[{"id": "1", "type": "sum", "field": "processedRecords"}]))
    panels.append(stat_panel("Affected Subscribers", amz_q, 18, y, 6, 4, "purple", "short",
        metrics=[{"id": "1", "type": "cardinality", "field": "subscriberID"}]))
    y += 4
    panels.append(table_panel("Top Settlement Subscribers", amz_q, "subscriberID", 0, y, 24, 8, 10,
        cell_prefix='module.keyword:"AmazonSettlementReport" AND subscriberID:'))
    y += 8

    # 9. Performance deep-dive (raw runs)
    panels.append(row("🏃 Performance Deep-Dive (raw run logs)", y)); y += 1
    panels.append(text_panel("note", 0, y, 24, 2,
        "Per-step timing bars in the HTML report are produced by parsing the free-text `detail` field "
        "(regex over `Step N: … ms`) — not natively reproducible in a Grafana panel. The panels below show "
        "the raw performance-summary runs and counts; for the step-by-step breakdown use the Kibana links."))
    y += 2
    perf_payout = 'module.keyword:"PayoutPosting" AND tag.keyword:"Performance"'
    perf_amz = 'module.keyword:"AmazonSettlementReport" AND tag.keyword:"Performance"'
    panels.append(stat_panel("Shopify Payout Perf Runs", perf_payout, 0, y, 6, 4, "blue"))
    panels.append(stat_panel("Amazon Settlement Perf Runs", perf_amz, 6, y, 6, 4, "blue"))
    panels.append(stat_panel("Payout Perf Subscribers", perf_payout, 12, y, 6, 4, "purple", "short",
        metrics=[{"id": "1", "type": "cardinality", "field": "subscriberID"}]))
    panels.append(stat_panel("Settlement Perf Subscribers", perf_amz, 18, y, 6, 4, "purple", "short",
        metrics=[{"id": "1", "type": "cardinality", "field": "subscriberID"}]))
    y += 4
    logs = base(pid(), "Performance Summary Logs (latest 50)", "logs", 0, y, 24, 11,
                links=[kibana_link('tag.keyword:"Performance"')],
                desc="Raw Payout_/Settlement_PerformanceSummary documents — open in Kibana for the parsed steps.")
    logs["targets"] = [es_target('tag.keyword:"Performance"',
                                 metrics=[{"id": "1", "type": "logs", "settings": {"limit": "50"}}])]
    logs["options"] = {"showTime": True, "wrapLogMessage": True, "enableLogDetails": True,
                       "sortOrder": "Descending", "dedupStrategy": "none"}
    panels.append(logs)
    y += 11

    return panels, y


def attach_legacy(panels, y, existing):
    """Move the pre-existing panels into a collapsed row so nothing is lost."""
    legacy = [p for p in (existing or []) if p.get("type") != "row"]
    if not legacy:
        return panels
    for i, p in enumerate(legacy):
        p["gridPos"] = {"x": (i % 2) * 12, "y": y + 1 + (i // 2) * 8, "w": 12, "h": 8}
    panels.append(row("🗂 Legacy panels (pre-existing)", y, collapsed=True, panels=legacy))
    return panels


def build(existing_panels=None):
    panels, y = build_panels()
    panels = attach_legacy(panels, y, existing_panels)
    return {
        "uid": DASH_UID,
        "title": DASH_TITLE,
        "tags": ["wd", "kibana", "daily-report", "logs"],
        "timezone": "Asia/Kolkata",
        "schemaVersion": 37,
        "version": 0,
        "refresh": "",
        "time": {"from": "now-24h", "to": "now"},
        "timepicker": {"refresh_intervals": ["5m", "15m", "30m", "1h", "6h", "12h", "24h"]},
        "templating": {"list": []},
        "annotations": {"list": []},
        "editable": True,
        "fiscalYearStartMonth": 0,
        "graphTooltip": 0,
        "links": [{"title": "Open WD Kibana", "type": "link", "icon": "external link",
                   "tags": [], "url": "https://kibana-wd.webgility.com", "targetBlank": True}],
        "panels": panels,
    }


def http(method, url, auth, data=None):
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", "Basic " + base64.b64encode(auth.encode()).decode())
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.status, r.read().decode()


def main():
    out_path = os.path.join(os.path.dirname(__file__), "wd-dashboard.json")
    gurl = os.environ.get("GRAFANA_URL", "https://systems.webgility.com/graph").rstrip("/")
    auth = os.environ.get("GRAFANA_AUTH") or os.environ.get("KIBANA_WD_AUTH")

    existing = None
    if "--push" in sys.argv or "--from-live" in sys.argv:
        try:
            _, body = http("GET", f"{gurl}/api/dashboards/uid/{DASH_UID}", auth)
            existing = json.loads(body)["dashboard"].get("panels")
            print(f"fetched {len(existing or [])} existing panel(s) from live dashboard")
        except Exception as e:
            print("warn: could not fetch existing dashboard:", e)

    dash = build(existing)
    payload = {"dashboard": dash, "overwrite": True, "folderId": 0,
               "message": "WD daily report panels (generated)"}
    with open(out_path, "w") as f:
        json.dump(payload, f, indent=2)
    print("wrote", out_path, "panels:", len(dash["panels"]))

    if "--push" in sys.argv:
        status, body = http("POST", f"{gurl}/api/dashboards/db", auth, json.dumps(payload).encode())
        print("push status:", status)
        print(body)


if __name__ == "__main__":
    main()
