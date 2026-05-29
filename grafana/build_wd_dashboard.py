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

DRILL-DOWN LINKS
  Every panel deep-links to Kibana 7.6.2 Discover with the dashboard's time
  range (via ${__from:date:iso}/${__to:date:iso}). Row/value links carry the
  exact filter for that row so the Kibana hit count matches the panel:
    * table message/subscriber cells -> the clicked cell value (${__value.raw})
    * bar-gauge / pie slices          -> the clicked category (${__field.name})

STEP-WISE PERFORMANCE BREAKDOWN
  The report's per-step bars ("Avg Step Processing Time — …") are parsed from
  the free-text `detail` field, which Grafana cannot aggregate. Produce them
  with grafana/wd_step_breakdown.py (no LLM); a dashboard link + the Performance
  Deep-Dive note point to it.

PERFORMANCE NOTE
  `Elasticsearch-WD` points at the WILDCARD index `webgilitydesktop-*`; a
  wildcard fans every query across all daily indices. `date_histogram` scales
  OK but `terms` aggregations time out under dashboard concurrency. So the
  always-open Executive Summary uses only date_histogram count tiles and every
  terms-based detail section is COLLAPSED by default. Permanent fix: set the
  datasource to a daily index pattern (`[webgilitydesktop-]YYYY.MM.DD`,
  Pattern `Daily`) — needs Grafana datasources:write; see
  grafana/apply_datasource_fix.py and docs/grafana-wd-dashboard.md.

Verified Grafana 9.2 Elasticsearch backend quirks:
  * terms bucket MUST order by a metric id ("1"), NOT "_count" (500 error).
  * terms nested with date_histogram times out — level timeline uses one
    date_histogram target per level instead.
  * a metric with NO bucket agg returns no frames — single-value stats use a
    date_histogram (reducer=sum/mean); unique counts use a large terms bucket.
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
UNIQUE_TERMS_SIZE = "5000"
STEP_HTML_PREVIEW = ("https://htmlpreview.github.io/?https://github.com/krishnabankar-webgility/"
                     "AskAI/blob/master/reports/wd-kibana-logs/wd-step-breakdown.html")

ALWAYS_OPEN = {"\U0001F4CA Executive Summary"}

_pid = [0]
_qid = [0]


def pid():
    _pid[0] += 1
    return _pid[0]


def qref():
    _qid[0] += 1
    n = _qid[0]
    return chr(ord("A") + (n - 1) % 26) + ("" if n <= 26 else str((n - 1) // 26))


def _kibana_url(query_body):
    return (
        f"{KIBANA_BASE}/app/kibana#/discover?"
        "_g=(refreshInterval:(pause:!t,value:0),"
        "time:(from:'${__from:date:iso}',to:'${__to:date:iso}'))"
        "&_a=(columns:!(timestamp,level,message,store,module,subscriberID),"
        f"index:'{KIBANA_INDEX}',interval:auto,"
        f"query:(language:kuery,query:'{query_body}'),sort:!(!(timestamp,desc)))"
    )


def kibana_link(kql, title="Open in Kibana (synced time range)"):
    return {"title": title, "url": _kibana_url(urllib.parse.quote(kql, safe="")), "targetBlank": True}


def kibana_value_link(prefix, suffix="", var="${__value.raw}", title="Open this row in Kibana"):
    body = urllib.parse.quote(prefix, safe="") + var + urllib.parse.quote(suffix, safe="")
    return {"title": title, "url": _kibana_url(body), "targetBlank": True}


def es_target(query="*", metrics=None, buckets=None, ref=None, alias=""):
    return {
        "datasource": DS, "query": query, "alias": alias,
        "metrics": metrics or [{"id": "1", "type": "count"}],
        "bucketAggs": buckets if buckets is not None else [],
        "timeField": "timestamp", "refId": ref or qref(),
    }


def terms_bucket(field, size=10, order_by="1"):
    return [{"id": "2", "type": "terms", "field": field,
             "settings": {"size": str(size), "order": "desc", "orderBy": order_by, "min_doc_count": "1"}}]


def date_hist(interval="auto", min_doc_count="0"):
    return [{"id": "2", "type": "date_histogram", "field": "timestamp",
             "settings": {"interval": interval, "min_doc_count": min_doc_count}}]


def base(panel_id, title, ptype, x, y, w, h, links=None, desc=""):
    return {"id": panel_id, "title": title, "type": ptype, "description": desc,
            "datasource": DS, "gridPos": {"x": x, "y": y, "w": w, "h": h},
            "links": links or [], "options": {},
            "fieldConfig": {"defaults": {}, "overrides": []}, "targets": []}


def stat_panel(title, kql, x, y, w=4, h=4, color="blue", unit="short",
               agg="count", field=None, desc=""):
    p = base(pid(), title, "stat", x, y, w, h, links=[kibana_link(kql)], desc=desc)
    if agg == "unique":
        p["targets"] = [es_target(kql, metrics=[{"id": "1", "type": "count"}],
                                  buckets=terms_bucket(field, UNIQUE_TERMS_SIZE))]
        reduce = {"calcs": ["count"], "fields": "/^Count$/", "values": False}
    else:
        if agg == "sum":
            metrics, calc = [{"id": "1", "type": "sum", "field": field}], "sum"
        elif agg == "avg":
            metrics, calc = [{"id": "1", "type": "avg", "field": field}], "mean"
        else:
            metrics, calc = [{"id": "1", "type": "count"}], "sum"
        p["targets"] = [es_target(kql, metrics=metrics, buckets=date_hist("1h", "1"))]
        reduce = {"calcs": [calc], "fields": "", "values": False}
    p["fieldConfig"]["defaults"] = {"unit": unit, "color": {"mode": "fixed", "fixedColor": color}, "mappings": []}
    p["options"] = {"reduceOptions": reduce, "orientation": "auto", "textMode": "value",
                    "colorMode": "background", "graphMode": "area", "justifyMode": "auto"}
    return p


def bargauge_panel(title, base_kql, field, x, y, w, h, size=10, color="orange", desc=""):
    p = base(pid(), title, "bargauge", x, y, w, h, links=[kibana_link(base_kql)], desc=desc)
    p["targets"] = [es_target(base_kql, buckets=terms_bucket(field, size))]
    cat_link = kibana_value_link(f'{base_kql} AND {field}:"', '"', var="${__field.name}",
                                 title="Open this category in Kibana")
    p["fieldConfig"]["defaults"] = {
        "color": {"mode": "fixed", "fixedColor": color}, "unit": "short", "mappings": [],
        "links": [cat_link],
        "thresholds": {"mode": "absolute", "steps": [{"color": color, "value": None}]}}
    p["options"] = {"displayMode": "gradient", "orientation": "horizontal", "showUnfilled": True,
                    "reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": True}}
    return p


def table_panel(title, kql, field, x, y, w, h, size=15, metrics=None,
                drilldown_kql=None, cell_prefix=None, cell_suffix="",
                sort_by="Count", order_by="1", desc=""):
    p = base(pid(), title, "table", x, y, w, h, links=[kibana_link(kql)], desc=desc)
    p["targets"] = [es_target(kql, metrics=metrics, buckets=terms_bucket(field, size, order_by))]
    p["fieldConfig"]["defaults"] = {"custom": {"align": "auto", "filterable": True}, "mappings": []}
    link = kibana_value_link(cell_prefix, cell_suffix) if cell_prefix is not None else (
        kibana_link(drilldown_kql, title="Open in Kibana") if drilldown_kql is not None else None)
    p["fieldConfig"]["overrides"] = [{
        "matcher": {"id": "byName", "options": field},
        "properties": [{"id": "links", "value": [link]}]}] if link else []
    p["options"] = {"showHeader": True, "footer": {"show": False}}
    p["transformations"] = [{"id": "sortBy", "options": {"sort": [{"field": sort_by, "desc": True}]}}]
    return p


def timeseries_levels(title, x, y, w, h, desc=""):
    p = base(pid(), title, "timeseries", x, y, w, h,
             links=[kibana_link('level.keyword:"Error" or level.keyword:"Fatal"')], desc=desc)
    p["targets"] = [
        es_target('level.keyword:"Error"', buckets=date_hist(), ref="A", alias="Error"),
        es_target('level.keyword:"Fatal"', buckets=date_hist(), ref="B", alias="Fatal"),
        es_target('level.keyword:"Warning"', buckets=date_hist(), ref="C", alias="Warning"),
    ]
    p["fieldConfig"]["defaults"] = {
        "custom": {"drawStyle": "bars", "fillOpacity": 70, "lineWidth": 1,
                   "stacking": {"group": "A", "mode": "normal"}, "axisPlacement": "auto"},
        "color": {"mode": "palette-classic"}, "unit": "short"}
    p["fieldConfig"]["overrides"] = [
        {"matcher": {"id": "byFrameRefID", "options": r},
         "properties": [{"id": "color", "value": {"mode": "fixed", "fixedColor": c}}]}
        for r, c in (("A", "orange"), ("B", "red"), ("C", "yellow"))]
    p["options"] = {"legend": {"calcs": ["sum"], "displayMode": "table", "placement": "right",
                               "showLegend": True}, "tooltip": {"mode": "multi", "sort": "desc"}}
    return p


def piechart_panel(title, base_kql, field, x, y, w, h, size=10, desc=""):
    p = base(pid(), title, "piechart", x, y, w, h, links=[kibana_link(base_kql)], desc=desc)
    p["targets"] = [es_target(base_kql, buckets=terms_bucket(field, size))]
    cat_link = kibana_value_link(f'{base_kql} AND {field}:"', '"', var="${__field.name}",
                                 title="Open this category in Kibana")
    p["fieldConfig"]["defaults"] = {"color": {"mode": "palette-classic"}, "mappings": [],
                                    "links": [cat_link],
                                    "custom": {"hideFrom": {"legend": False, "tooltip": False, "viz": False}}}
    p["options"] = {"pieType": "donut", "reduceOptions": {"calcs": ["lastNotNull"], "values": True},
                    "legend": {"displayMode": "table", "placement": "right", "values": ["value", "percent"]},
                    "tooltip": {"mode": "single"}}
    return p


def text_panel(title, x, y, w, h, md):
    p = base(pid(), title, "text", x, y, w, h)
    p["options"] = {"mode": "markdown", "content": md}
    del p["targets"]; del p["datasource"]
    return p


def row(title, y, collapsed=False, panels=None):
    return {"id": pid(), "type": "row", "title": title, "collapsed": collapsed,
            "gridPos": {"x": 0, "y": y, "w": 24, "h": 1}, "panels": panels or []}


def build_flat():
    panels = []
    y = 0

    panels.append(text_panel("About", 0, y, 24, 4,
        "## WD Kibana Daily Report \u2014 Grafana edition\n"
        "Same insights as the daily HTML/Slack report (`reports/wd-kibana-logs/`) over "
        "**`webgilitydesktop-*`** via the **Elasticsearch-WD** datasource \u2014 **no LLM cost**. "
        "Pick any window with the **time-range picker** (top-right); default = report window "
        "*yesterday 09:00 \u2192 today 09:00 IST*. Click any table row or chart bar to open the matching "
        "**Kibana Discover** view (same filter + time range).\n\n"
        "**Expand a section below to load it.** Detail sections are collapsed by default because the "
        "Elasticsearch-WD datasource uses a wildcard index (`webgilitydesktop-*`); running every panel at "
        "once overwhelms the cluster. *Permanent fix (admin): set the datasource to a daily index pattern "
        "(`[webgilitydesktop-]YYYY.MM.DD`, Pattern = Daily) \u2014 then every panel loads instantly. "
        "See `grafana/apply_datasource_fix.py` and `docs/grafana-wd-dashboard.md`.*"))
    y += 4

    panels.append(row("\U0001F4CA Executive Summary", y)); y += 1
    panels.append(stat_panel("Total Events", "*", 0, y, 4, 5, "blue"))
    panels.append(stat_panel("Errors", 'level.keyword:"Error"', 4, y, 5, 5, "orange"))
    panels.append(stat_panel("Fatals", 'level.keyword:"Fatal"', 9, y, 5, 5, "red"))
    panels.append(stat_panel("Warnings", 'level.keyword:"Warning"', 14, y, 5, 5, "yellow"))
    panels.append(stat_panel("Info", 'level.keyword:"Info"', 19, y, 5, 5, "green"))
    y += 5

    panels.append(row("\u23F1 Error / Fatal / Warning Timeline", y)); y += 1
    panels.append(timeseries_levels("Events over time by level", 0, y, 24, 8,
        desc="Stacked counts by level across the selected window."))
    y += 8

    panels.append(row("\U0001F9E9 Error Breakdown", y)); y += 1
    panels.append(bargauge_panel("Errors by Module", 'level.keyword:"Error"', "module.keyword", 0, y, 6, 9, 12, "orange"))
    panels.append(bargauge_panel("Errors by Store", 'level.keyword:"Error"', "store.keyword", 6, y, 6, 9, 12, "purple"))
    panels.append(bargauge_panel("Errors by Tag", 'level.keyword:"Error"', "tag.keyword", 12, y, 6, 9, 12, "blue"))
    panels.append(bargauge_panel("Errors by Process", 'level.keyword:"Error"', "process.keyword", 18, y, 6, 9, 12, "green"))
    y += 9

    panels.append(row("\U0001F51D Top Error Messages & Subscribers", y)); y += 1
    panels.append(table_panel("Top Error Messages", 'level.keyword:"Error"', "message.keyword", 0, y, 12, 10, 15,
        cell_prefix='level.keyword:"Error" AND message.keyword:"', cell_suffix='"'))
    panels.append(table_panel("Top Error Subscribers", 'level.keyword:"Error"', "subscriberID", 12, y, 12, 10, 15,
        cell_prefix='level.keyword:"Error" AND subscriberID:'))
    y += 10

    panels.append(row("\U0001F480 Fatal Events", y)); y += 1
    panels.append(table_panel("Fatal by Message", 'level.keyword:"Fatal"', "message.keyword", 0, y, 12, 8, 15,
        cell_prefix='level.keyword:"Fatal" AND message.keyword:"', cell_suffix='"'))
    panels.append(piechart_panel("Fatal by Store", 'level.keyword:"Fatal"', "store.keyword", 12, y, 12, 8, 10))
    y += 8

    panels.append(row("\U0001F4B3 Shopify Payout Performance", y)); y += 1
    payout_q = 'store.keyword:"Shopify" AND module.keyword:"PayoutPosting"'
    panels.append(stat_panel("Payouts Processed", payout_q, 0, y, 6, 4, "green", "short",
        agg="sum", field="processedRecords", desc="Sum of processedRecords for Shopify PayoutPosting"))
    panels.append(stat_panel("Payout Log Events", payout_q, 6, y, 6, 4, "blue"))
    panels.append(stat_panel("Payout Subscribers", payout_q, 12, y, 6, 4, "purple", "short",
        agg="unique", field="subscriberID"))
    panels.append(stat_panel("Avg Rate (rec/s)", payout_q + ' AND averagePerSecond:>0', 18, y, 6, 4, "orange", "short",
        agg="avg", field="averagePerSecond", desc="Mean of per-hour averagePerSecond"))
    y += 4
    panels.append(table_panel("Top Payout Subscribers (by records)", payout_q, "subscriberID", 0, y, 24, 8, 10,
        metrics=[{"id": "1", "type": "sum", "field": "processedRecords"}],
        cell_prefix='module.keyword:"PayoutPosting" AND subscriberID:', sort_by="Sum"))
    y += 8

    panels.append(row("\U0001F6D2 Amazon Settlement Report", y)); y += 1
    amz_q = 'module.keyword:"AmazonSettlementReport"'
    panels.append(stat_panel("Settlement Events", amz_q, 0, y, 6, 4, "blue"))
    panels.append(stat_panel("Settlement Errors", amz_q + ' AND level.keyword:"Error"', 6, y, 6, 4, "red"))
    panels.append(stat_panel("Records Processed", amz_q, 12, y, 6, 4, "green", "short",
        agg="sum", field="processedRecords"))
    panels.append(stat_panel("Affected Subscribers", amz_q, 18, y, 6, 4, "purple", "short",
        agg="unique", field="subscriberID"))
    y += 4
    panels.append(table_panel("Top Settlement Subscribers", amz_q, "subscriberID", 0, y, 24, 8, 10,
        cell_prefix='module.keyword:"AmazonSettlementReport" AND subscriberID:'))
    y += 8

    panels.append(row("\U0001F3C3 Performance Deep-Dive (run logs + step breakdown)", y)); y += 1
    panels.append(text_panel("note", 0, y, 24, 3,
        "**Per-step timing bars** (the report's *Avg Step Processing Time \u2014 Shopify Payout / Amazon "
        "Settlement* charts) are parsed from the free-text `detail` field (`Step N: \u2026 ms`), which Grafana "
        "cannot aggregate natively. Generate them with **`grafana/wd_step_breakdown.py`** (no LLM \u2014 it "
        f"writes a step-breakdown HTML and posts a Slack summary): [\U0001F4C8 Open latest step breakdown]({STEP_HTML_PREVIEW}).\n\n"
        "The panels below show performance-summary **run counts** and **per-subscriber runs**; click any "
        "subscriber to open that client's runs (with the raw `detail` steps) in Kibana."))
    y += 3
    perf_payout = 'module.keyword:"PayoutPosting" AND tag.keyword:"Performance"'
    perf_amz = 'module.keyword:"AmazonSettlementReport" AND tag.keyword:"Performance"'
    panels.append(stat_panel("Shopify Payout Perf Runs", perf_payout, 0, y, 6, 4, "blue"))
    panels.append(stat_panel("Amazon Settlement Perf Runs", perf_amz, 6, y, 6, 4, "blue"))
    panels.append(stat_panel("Payout Perf Subscribers", perf_payout, 12, y, 6, 4, "purple", "short",
        agg="unique", field="subscriberID"))
    panels.append(stat_panel("Settlement Perf Subscribers", perf_amz, 18, y, 6, 4, "purple", "short",
        agg="unique", field="subscriberID"))
    y += 4
    panels.append(table_panel("Top Payout Perf Subscribers (runs)", perf_payout, "subscriberID", 0, y, 12, 8, 15,
        cell_prefix='module.keyword:"PayoutPosting" AND tag.keyword:"Performance" AND subscriberID:'))
    panels.append(table_panel("Top Settlement Perf Subscribers (runs)", perf_amz, "subscriberID", 12, y, 12, 8, 15,
        cell_prefix='module.keyword:"AmazonSettlementReport" AND tag.keyword:"Performance" AND subscriberID:'))
    y += 8

    return panels, y


def attach_legacy(panels, y, existing):
    legacy = [p for p in (existing or []) if p.get("type") != "row"]
    if not legacy:
        return panels
    for i, p in enumerate(legacy):
        p["gridPos"] = {"x": (i % 2) * 12, "y": y + 1 + (i // 2) * 8, "w": 12, "h": 8}
    panels.append(row("\U0001F5C2 Legacy panels (pre-existing)", y, collapsed=True, panels=legacy))
    return panels


def collapse_sections(flat):
    out, i = [], 0
    while i < len(flat):
        p = flat[i]
        if p.get("type") != "row":
            out.append(p); i += 1; continue
        if p.get("panels"):
            out.append(p); i += 1; continue
        j = i + 1
        children = []
        while j < len(flat) and flat[j].get("type") != "row":
            children.append(flat[j]); j += 1
        if p["title"] in ALWAYS_OPEN:
            p["collapsed"] = False
            p["panels"] = []
            out.append(p)
            out.extend(children)
        else:
            p["collapsed"] = True
            p["panels"] = children
            out.append(p)
        i = j
    return out


def build(existing_panels=None):
    flat, y = build_flat()
    flat = attach_legacy(flat, y, existing_panels)
    panels = collapse_sections(flat)
    return {
        "uid": DASH_UID, "title": DASH_TITLE,
        "tags": ["wd", "kibana", "daily-report", "logs"],
        "timezone": "Asia/Kolkata", "schemaVersion": 37, "version": 0, "refresh": "",
        "time": {"from": "now-24h", "to": "now"},
        "timepicker": {"refresh_intervals": ["5m", "15m", "30m", "1h", "6h", "12h", "24h"]},
        "templating": {"list": []}, "annotations": {"list": []},
        "editable": True, "fiscalYearStartMonth": 0, "graphTooltip": 0,
        "links": [
            {"title": "Open WD Kibana", "type": "link", "icon": "external link",
             "tags": [], "url": KIBANA_BASE, "targetBlank": True},
            {"title": "Step Breakdown (HTML)", "type": "link", "icon": "external link",
             "tags": [], "url": STEP_HTML_PREVIEW, "targetBlank": True},
        ],
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
    n_rows = sum(1 for p in dash["panels"] if p.get("type") == "row")
    print("wrote", out_path, "top-level items:", len(dash["panels"]), "rows:", n_rows)

    if "--push" in sys.argv:
        status, body = http("POST", f"{gurl}/api/dashboards/db", auth, json.dumps(payload).encode())
        print("push status:", status)
        print(body)


if __name__ == "__main__":
    main()
