#!/usr/bin/env python3
"""Zero-LLM daily WD log notification for Slack.

Replaces the costly LLM-generated daily report with a cheap scheduled script:
it queries Elasticsearch directly for the headline numbers and posts a compact
Slack message that links to the Grafana WD-Dashboard (and Kibana) pre-set to the
report window. No language model is involved, so the per-run cost is ~zero.

It queries EXPLICIT daily indices (`webgilitydesktop-YYYY.MM.DD`) via the Kibana
WD proxy, which is fast and avoids the wildcard fan-out that times out in
Grafana. Default window = yesterday 09:00 IST -> today 09:00 IST (the same
window the agent report uses).

Environment:
    KIBANA_WD_AUTH                 "user:pass" for Kibana WD (required)
    WD_HEALTH_SLACK_WEBHOOK        Slack incoming-webhook URL for the target
                                   channel (e.g. #wd_health). If set, used to post.
    SLACK_BOT_TOKEN + WD_HEALTH_CHANNEL
                                   Alternative to the webhook: bot token + channel
                                   id/name for chat.postMessage.
    GRAFANA_DASHBOARD_URL          override (default the WD-Dashboard URL)

Usage:
    python3 grafana/wd_daily_notify.py --dry-run     # print message, do not post
    python3 grafana/wd_daily_notify.py               # post to Slack
    python3 grafana/wd_daily_notify.py --webhook URL # post to an explicit webhook

Schedule (weekdays 09:00 IST = 03:30 UTC) without any LLM, e.g. cron:
    30 3 * * 1-5  cd /path/to/repo && KIBANA_WD_AUTH=... WD_HEALTH_SLACK_WEBHOOK=... \
                  python3 grafana/wd_daily_notify.py >> logs/wd_daily_notify.log 2>&1
or a GitHub Actions scheduled workflow / a Cursor scheduled cloud agent that just
runs this command (model does nothing).
"""
import base64
import datetime as dt
import json
import os
import sys
import urllib.parse
import urllib.request

KIBANA_BASE = "https://kibana-wd.webgility.com"
KIBANA_INDEX = "61237d60-0ed9-11eb-816a-cde07dc15a1f"
GRAFANA_DASH = os.environ.get(
    "GRAFANA_DASHBOARD_URL",
    "https://systems.webgility.com/graph/d/UpKNy11vk/wd-dashboard?orgId=1",
)
IST = dt.timezone(dt.timedelta(hours=5, minutes=30))


def auth_header():
    creds = os.environ.get("KIBANA_WD_AUTH")
    if not creds:
        sys.exit("KIBANA_WD_AUTH not set")
    return "Basic " + base64.b64encode(creds.encode()).decode()


def report_window(now_ist=None):
    """yesterday 09:00 IST -> today 09:00 IST (or the most recent such window)."""
    now_ist = now_ist or dt.datetime.now(IST)
    end = now_ist.replace(hour=9, minute=0, second=0, microsecond=0)
    if now_ist < end:
        end -= dt.timedelta(days=1)
    start = end - dt.timedelta(days=1)
    return start, end


def daily_indices(start_utc, end_utc):
    """Index names are date-based; cover every UTC date the window touches."""
    days = set()
    d = start_utc.date()
    while d <= end_utc.date():
        days.add(d)
        d += dt.timedelta(days=1)
    return [f"webgilitydesktop-{d.strftime('%Y.%m.%d')}" for d in sorted(days)]


def es_msearch(indices, body):
    idx = ",".join(indices)
    nd = json.dumps({"index": idx}) + "\n" + json.dumps(body) + "\n"
    req = urllib.request.Request(
        f"{KIBANA_BASE}/api/console/proxy?path={urllib.parse.quote(idx + '/_msearch', safe='')}&method=POST",
        data=nd.encode(), method="POST")
    req.add_header("Authorization", auth_header())
    req.add_header("kbn-xsrf", "true")
    req.add_header("Content-Type", "application/x-ndjson")
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())["responses"][0]


def fmt(n):
    return f"{int(n):,}"


def gather(indices, start_utc, end_utc):
    rng = {"range": {"timestamp": {"gte": start_utc.isoformat(), "lt": end_utc.isoformat()}}}
    body = {
        "size": 0, "track_total_hits": True,
        "query": {"bool": {"must": [rng]}},
        "aggs": {
            "by_level": {"terms": {"field": "level.keyword", "size": 10}},
            "err_modules": {
                "filter": {"term": {"level.keyword": "Error"}},
                "aggs": {"top": {"terms": {"field": "module.keyword", "size": 5}}},
            },
            "payout": {
                "filter": {"bool": {"must": [
                    {"term": {"store.keyword": "Shopify"}},
                    {"term": {"module.keyword": "PayoutPosting"}}]}},
                "aggs": {"records": {"sum": {"field": "processedRecords"}}},
            },
            "settlement": {"filter": {"term": {"module.keyword": "AmazonSettlementReport"}}},
        },
    }
    r = es_msearch(indices, body)
    aggs = r["aggregations"]
    levels = {b["key"]: b["doc_count"] for b in aggs["by_level"]["buckets"]}
    total = r["hits"]["total"]
    total = total["value"] if isinstance(total, dict) else total
    return {
        "total": total,
        "levels": levels,
        "err_modules": [(b["key"], b["doc_count"]) for b in aggs["err_modules"]["top"]["buckets"]],
        "payout_records": int(aggs["payout"]["records"]["value"] or 0),
        "settlement_events": aggs["settlement"]["doc_count"],
    }


def kibana_link(kql, start_utc, end_utc):
    q = urllib.parse.quote(kql, safe="")
    url = (f"{KIBANA_BASE}/app/kibana#/discover?_g=(time:(from:'{start_utc.isoformat()}Z'"
           f",to:'{end_utc.isoformat()}Z'))&_a=(index:'{KIBANA_INDEX}',query:(language:kuery,query:'{q}'))")
    return url


def build_message(data, start_ist, end_ist, start_utc, end_utc):
    g_from = int(start_utc.replace(tzinfo=dt.timezone.utc).timestamp() * 1000)
    g_to = int(end_utc.replace(tzinfo=dt.timezone.utc).timestamp() * 1000)
    dash_url = GRAFANA_DASH + f"&from={g_from}&to={g_to}"
    lv = data["levels"]
    errors = lv.get("Error", 0)
    rate = (errors / data["total"] * 100) if data["total"] else 0
    mods = ", ".join(f"{m} ({fmt(c)})" for m, c in data["err_modules"]) or "none"
    period = f"{start_ist:%b %d, %H:%M} \u2192 {end_ist:%b %d, %H:%M} IST"
    text = (
        f"*\U0001F4CA WD Kibana Daily Log Report \u2014 {end_ist:%Y-%m-%d}*\n"
        f"Period: {period}\n\n"
        f"\U0001F310 *Dashboard:* <{dash_url}|Open WD-Dashboard in Grafana>\n\n"
        f"*Executive Summary*\n"
        f"\u2022 Total events: *{fmt(data['total'])}*\n"
        f"\u2022 Errors: *{fmt(errors)}*  (error rate {rate:.1f}%)\n"
        f"\u2022 Fatals: *{fmt(lv.get('Fatal', 0))}*   Warnings: *{fmt(lv.get('Warning', 0))}*   "
        f"Info: *{fmt(lv.get('Info', 0))}*\n\n"
        f"*Top error modules:* {mods}\n"
        f"*Shopify payouts processed:* {fmt(data['payout_records'])}   "
        f"*Amazon settlement events:* {fmt(data['settlement_events'])}\n"
    )
    return text, dash_url


def post_slack(text, webhook=None):
    webhook = webhook or os.environ.get("WD_HEALTH_SLACK_WEBHOOK")
    if webhook:
        req = urllib.request.Request(webhook, data=json.dumps({"text": text}).encode(),
                                     method="POST", headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as r:
            return f"webhook {r.status}: {r.read().decode()[:100]}"
    token = os.environ.get("SLACK_BOT_TOKEN")
    channel = os.environ.get("WD_HEALTH_CHANNEL")
    if token and channel:
        req = urllib.request.Request("https://slack.com/api/chat.postMessage",
            data=json.dumps({"channel": channel, "text": text}).encode(), method="POST",
            headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
        with urllib.request.urlopen(req, timeout=30) as r:
            return "chat.postMessage: " + r.read().decode()[:120]
    return "NO Slack target configured (set WD_HEALTH_SLACK_WEBHOOK or SLACK_BOT_TOKEN+WD_HEALTH_CHANNEL)"


def main():
    dry = "--dry-run" in sys.argv
    webhook = None
    if "--webhook" in sys.argv:
        webhook = sys.argv[sys.argv.index("--webhook") + 1]
    start_ist, end_ist = report_window()
    start_utc = start_ist.astimezone(dt.timezone.utc).replace(tzinfo=None)
    end_utc = end_ist.astimezone(dt.timezone.utc).replace(tzinfo=None)
    indices = daily_indices(start_utc, end_utc)
    data = gather(indices, start_utc, end_utc)
    text, dash_url = build_message(data, start_ist, end_ist, start_utc, end_utc)
    print("Indices:", ",".join(indices))
    print("-" * 60)
    print(text)
    print("-" * 60)
    print("Dashboard URL:", dash_url)
    if dry:
        print("[dry-run] not posting to Slack")
        return
    print(post_slack(text, webhook))


if __name__ == "__main__":
    main()
