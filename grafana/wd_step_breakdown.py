#!/usr/bin/env python3
"""Step-wise performance breakdown for Shopify Payout & Amazon Settlement.

This reproduces the report's *Performance Deep-Dive* step bars
("Avg Step Processing Time — …") that Grafana cannot render natively: the
per-step timings live only inside the free-text `detail` field
(`Step N: <name>: <ms> ms | Records: <n>`), so they must be parsed client-side.
This script does that parse deterministically — **no LLM** — and emits a
self-contained HTML page (same look as the daily report) plus an optional
compact Slack summary.

Pair it with the Grafana dashboard: the dashboard shows run counts / per-client
runs (and links to Kibana), and this publishes the step-level bars the same way
the daily report did, at ~zero cost.

Environment:
    KIBANA_WD_AUTH            "user:pass" for Kibana WD (required)
    WD_HEALTH_SLACK_WEBHOOK   webhook to post the summary (optional)
    SLACK_BOT_TOKEN + WD_HEALTH_CHANNEL  alternative Slack target (optional)

Usage:
    python3 grafana/wd_step_breakdown.py                       # print summary + write HTML
    python3 grafana/wd_step_breakdown.py --html out.html       # custom HTML path
    python3 grafana/wd_step_breakdown.py --post                # also post Slack summary
    python3 grafana/wd_step_breakdown.py --hours 24            # last N hours instead of report window

Default window = yesterday 09:00 IST -> today 09:00 IST (the report window).

Verified detail formats (parsed by STEP_RE, which allows an optional space
before the first colon):
    Shopify Payout  (methodType Payout_PerformanceSummary):
        Step 1: Download Orders: 73 ms | Records: 0 | Message: ...
    Amazon Settlement (methodType SettlementPaymentPostingStepPerformance):
        Step 1 : GetSettlementPaymentDetail: 102 ms | Records: 717 | Message: ...
"""
import base64
import datetime as dt
import json
import os
import re
import sys
import urllib.parse
import urllib.request

KIBANA_BASE = "https://kibana-wd.webgility.com"
KIBANA_INDEX = "61237d60-0ed9-11eb-816a-cde07dc15a1f"
IST = dt.timezone(dt.timedelta(hours=5, minutes=30))

# label, module.keyword, methodType.keyword, accent color
MODULES = [
    ("Shopify Payout", "PayoutPosting", "Payout_PerformanceSummary", "#f97316"),
    ("Amazon Settlement", "AmazonSettlementReport", "SettlementPaymentPostingStepPerformance", "#3b82f6"),
]
# allow "Step 1:" (payout) and "Step 1 :" (settlement)
STEP_RE = re.compile(r"^Step\s+(\d+)\s*:\s+(.+?):\s+(\d+)\s+ms(?:\s+\|\s+Records:\s+(\d+))?", re.M)
TOTAL_RE = re.compile(r"Total Time:\s*(\d+)\s*,?\s*ms")


def auth_header():
    creds = os.environ.get("KIBANA_WD_AUTH")
    if not creds:
        sys.exit("KIBANA_WD_AUTH not set")
    return "Basic " + base64.b64encode(creds.encode()).decode()


def report_window(hours=None):
    now_ist = dt.datetime.now(IST)
    if hours:
        return now_ist - dt.timedelta(hours=hours), now_ist
    end = now_ist.replace(hour=9, minute=0, second=0, microsecond=0)
    if now_ist < end:
        end -= dt.timedelta(days=1)
    return end - dt.timedelta(days=1), end


def daily_indices(start_utc, end_utc):
    days, d = set(), start_utc.date()
    while d <= end_utc.date():
        days.add(d); d += dt.timedelta(days=1)
    return ",".join(f"webgilitydesktop-{x.strftime('%Y.%m.%d')}" for x in sorted(days))


def es_search(indices, body):
    nd = json.dumps({"index": indices}) + "\n" + json.dumps(body) + "\n"
    req = urllib.request.Request(
        f"{KIBANA_BASE}/api/console/proxy?path={urllib.parse.quote(indices + '/_msearch', safe='')}&method=POST",
        data=nd.encode(), method="POST")
    req.add_header("Authorization", auth_header())
    req.add_header("kbn-xsrf", "true")
    req.add_header("Content-Type", "application/x-ndjson")
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read().decode())["responses"][0]


def fetch_runs(indices, module, method, start_utc, end_utc):
    base_must = [
        {"range": {"timestamp": {"gte": start_utc.isoformat(), "lt": end_utc.isoformat()}}},
        {"term": {"module.keyword": module}},
    ]
    src = ["timestamp", "subscriberID", "profileId", "email", "detail",
           "message", "processedRecords", "baseUrl", "process", "methodType"]
    body = {"size": 500, "sort": [{"timestamp": "desc"}], "_source": src,
            "query": {"bool": {"must": base_must + [{"term": {"methodType.keyword": method}}]}}}
    r = es_search(indices, body)
    hits = r.get("hits", {}).get("hits", [])
    if hits:
        return [h["_source"] for h in hits]
    body["query"]["bool"]["must"] = base_must + [{"term": {"tag.keyword": "Performance"}}]
    r = es_search(indices, body)
    return [h["_source"] for h in r.get("hits", {}).get("hits", [])]


def parse_run(src):
    detail = src.get("detail", "") or ""
    steps = []
    for m in STEP_RE.finditer(detail):
        steps.append({"num": int(m.group(1)), "name": m.group(2).strip(),
                      "ms": int(m.group(3)), "records": int(m.group(4) or 0)})
    if not steps:
        return None
    tm = TOTAL_RE.search(detail) or TOTAL_RE.search(src.get("message", "") or "")
    total = int(tm.group(1)) if tm else sum(s["ms"] for s in steps)
    maxstep = max(steps, key=lambda s: s["ms"])
    return {"sub": src.get("subscriberID"), "email": src.get("email", ""),
            "records": src.get("processedRecords", 0) or 0, "process": src.get("process", ""),
            "total": total, "maxstep": maxstep, "steps": steps}


def fmt_ms(ms):
    ms = int(ms)
    if ms < 1000:
        return f"{ms}ms"
    s = ms / 1000.0
    if s < 60:
        return f"{s:.1f}s"
    if s < 3600:
        return f"{int(s // 60)}m {int(s % 60)}s"
    h = int(s // 3600); rem = s - h * 3600
    return f"{h}h {int(rem // 60)}m {int(rem % 60)}s"


def aggregate(runs):
    parsed = [p for p in (parse_run(r) for r in runs) if p]
    step_stats, order = {}, {}
    for p in parsed:
        for s in p["steps"]:
            st = step_stats.setdefault(s["name"], {"count": 0, "total": 0, "max": 0})
            st["count"] += 1; st["total"] += s["ms"]; st["max"] = max(st["max"], s["ms"])
            order.setdefault(s["name"], s["num"])
    steps = sorted(
        ({"name": n, "num": order[n], "count": st["count"],
          "avg": st["total"] / st["count"], "max": st["max"]} for n, st in step_stats.items()),
        key=lambda x: x["num"])
    by_sub = {}
    for p in parsed:
        b = by_sub.setdefault(p["sub"], {"total": 0, "runs": 0, "records": 0,
                                         "email": p["email"], "maxstep": ("", 0)})
        b["total"] += p["total"]; b["runs"] += 1; b["records"] += p["records"]
        if p["maxstep"]["ms"] > b["maxstep"][1]:
            b["maxstep"] = (p["maxstep"]["name"], p["maxstep"]["ms"])
    top = sorted(by_sub.items(), key=lambda kv: kv[1]["total"], reverse=True)[:5]
    return parsed, steps, top


def bar_color(pct):
    return "#ef4444" if pct > 80 else "#f97316" if pct > 50 else "#eab308" if pct > 25 else "#3b82f6"


def render_section(label, accent, steps, top, n_runs, period):
    if not steps:
        return (f"<div class='card'><h2 style='color:{accent}'>🏃 {label} — Performance Deep-Dive</h2>"
                f"<p class='muted'>No performance-summary logs found in {period}.</p></div>")
    max_avg = max(s["avg"] for s in steps) or 1
    rows = []
    for s in steps:
        pct = s["avg"] / max_avg * 100
        rows.append(
            f"<div class='step-row'><div class='step-label' title=\"{s['name']}\">"
            f"S{s['num']}: {s['name'][:26]}</div><div class='step-bar-wrap'>"
            f"<div class='step-bar' style='width:{pct:.1f}%;background:{bar_color(pct)}'></div>"
            f"<span class='step-bar-val'>{fmt_ms(s['avg'])} avg&nbsp;/&nbsp;{fmt_ms(s['max'])} max&nbsp;"
            f"({s['count']} runs)</span></div></div>")
    trows = []
    for i, (sub, b) in enumerate(top, 1):
        trows.append(
            f"<tr><td>{i}</td><td>{sub}</td><td class='muted'>{b['email']}</td>"
            f"<td class='r'>{b['runs']}</td><td class='r'>{b['records']}</td>"
            f"<td class='r'><b>{fmt_ms(b['total'])}</b></td>"
            f"<td>{b['maxstep'][0]}<br><span class='muted'>{fmt_ms(b['maxstep'][1])}</span></td></tr>")
    return f"""
<div class='card'>
  <h2 style='color:{accent}'>🏃 {label} — Performance Deep-Dive</h2>
  <p class='muted'>{n_runs} sampled runs · {period}</p>
  <h3>Top Clients by Total Processing Time</h3>
  <table><thead><tr><th>#</th><th>Subscriber</th><th>Email</th><th>Runs</th>
    <th>Transactions</th><th>Total Time</th><th>Slowest Step</th></tr></thead>
    <tbody>{''.join(trows)}</tbody></table>
  <h3 style='margin-top:18px'>Avg Step Processing Time — {label} ({n_runs} runs)</h3>
  <div class='step-chart'>{''.join(rows)}</div>
</div>"""


def build_html(sections, period):
    css = """
body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:24px}
h1{font-size:1.3rem}h2{font-size:1rem;margin:0 0 4px}h3{font-size:.82rem;color:#475569;margin:14px 0 8px}
.card{background:#fff;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.08);padding:18px 20px;margin:16px 0}
.muted{color:#94a3b8;font-size:.72rem}
table{width:100%;border-collapse:collapse;font-size:.76rem}
th{background:#f1f5f9;color:#475569;text-align:left;padding:7px 10px;font-size:.7rem;border-bottom:2px solid #e2e8f0}
td{padding:7px 10px;border-bottom:1px solid #f1f5f9;vertical-align:top}td.r{text-align:right}
.step-chart{margin:8px 0}
.step-row{display:flex;align-items:center;gap:8px;margin-bottom:7px}
.step-label{font-size:.68rem;color:#475569;min-width:210px;max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right}
.step-bar-wrap{flex:1;display:flex;align-items:center;gap:8px;min-width:0}
.step-bar{height:16px;border-radius:4px;min-width:4px;flex-shrink:0}
.step-bar-val{font-size:.65rem;color:#64748b;white-space:nowrap}
"""
    return (f"<!doctype html><html><head><meta charset='utf-8'>"
            f"<title>WD Performance Step Breakdown — {period}</title><style>{css}</style></head><body>"
            f"<h1>WD Performance Step Breakdown</h1><p class='muted'>{period} · parsed from log "
            f"<code>detail</code> (no LLM)</p>{''.join(sections)}</body></html>")


def slack_summary(results, period):
    lines = [f"*🏃 WD Performance Step Breakdown — {period}*"]
    for label, steps, n in results:
        if not steps:
            lines.append(f"\n*{label}:* no runs"); continue
        slow = sorted(steps, key=lambda s: s["avg"], reverse=True)[:3]
        top = " · ".join(f"S{s['num']} {s['name'][:18]} {fmt_ms(s['avg'])} avg" for s in slow)
        lines.append(f"\n*{label}* ({n} runs) — slowest steps: {top}")
    return "\n".join(lines)


def post_slack(text):
    wh = os.environ.get("WD_HEALTH_SLACK_WEBHOOK")
    if wh:
        req = urllib.request.Request(wh, data=json.dumps({"text": text}).encode(),
                                     method="POST", headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as r:
            return f"webhook {r.status}"
    tok, ch = os.environ.get("SLACK_BOT_TOKEN"), os.environ.get("WD_HEALTH_CHANNEL")
    if tok and ch:
        req = urllib.request.Request("https://slack.com/api/chat.postMessage",
            data=json.dumps({"channel": ch, "text": text}).encode(), method="POST",
            headers={"Content-Type": "application/json", "Authorization": "Bearer " + tok})
        with urllib.request.urlopen(req, timeout=30) as r:
            return "chat.postMessage: " + r.read().decode()[:80]
    return "no Slack target configured"


def main():
    hours = None
    if "--hours" in sys.argv:
        hours = int(sys.argv[sys.argv.index("--hours") + 1])
    html_path = "reports/wd-kibana-logs/wd-step-breakdown.html"
    if "--html" in sys.argv:
        html_path = sys.argv[sys.argv.index("--html") + 1]

    start_ist, end_ist = report_window(hours)
    start_utc = start_ist.astimezone(dt.timezone.utc).replace(tzinfo=None)
    end_utc = end_ist.astimezone(dt.timezone.utc).replace(tzinfo=None)
    indices = daily_indices(start_utc, end_utc)
    period = f"{start_ist:%b %d %H:%M} → {end_ist:%b %d %H:%M} IST"
    print("Indices:", indices, "| window:", period)

    sections, results = [], []
    for label, module, method, accent in MODULES:
        runs = fetch_runs(indices, module, method, start_utc, end_utc)
        parsed, steps, top = aggregate(runs)
        n = len(parsed)
        print(f"\n=== {label}: {n} parsed runs ===")
        for s in steps:
            print(f"  S{s['num']:<2} {s['name'][:34]:34} avg {fmt_ms(s['avg']):>9}  max {fmt_ms(s['max']):>9}  ({s['count']} runs)")
        sections.append(render_section(label, accent, steps, top, n, period))
        results.append((label, steps, n))

    os.makedirs(os.path.dirname(html_path), exist_ok=True)
    with open(html_path, "w") as f:
        f.write(build_html(sections, period))
    print("\nHTML written:", html_path)

    summary = slack_summary(results, period)
    print("\n--- Slack summary ---\n" + summary)
    if "--post" in sys.argv:
        print(post_slack(summary))


if __name__ == "__main__":
    main()
