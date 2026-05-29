# WD Kibana Daily Report → Grafana Dashboard (no-LLM)

This documents the **WD-Dashboard** Grafana build that replicates the daily
`wd-es-kibana` HTML/Slack report as native panels, plus a zero-LLM daily Slack
notification. It answers: *can we render the same reports as a Grafana (or
Kibana) dashboard with a date-range picker, and get a daily Slack/mail
notification, without paying for an LLM run every day?*

**Short answer: yes — Grafana.** The same Elasticsearch data the agent queries
is already wired into Grafana, so the dashboard costs **$0 of model spend** and
supports an interactive time-range picker. The LLM agent is only needed for the
narrative/prose parts (Actionable Insights) and the regex-parsed per-step
performance bars.

- Live dashboard: <https://systems.webgility.com/graph/d/UpKNy11vk/wd-dashboard?orgId=1>
- Generator: [`grafana/build_wd_dashboard.py`](../grafana/build_wd_dashboard.py)
- Dashboard model (committed): [`grafana/wd-dashboard.json`](../grafana/wd-dashboard.json)
- Daily Slack notifier: [`grafana/wd_daily_notify.py`](../grafana/wd_daily_notify.py)
- Datasource speed fix (admin): [`grafana/apply_datasource_fix.py`](../grafana/apply_datasource_fix.py)

---

## Grafana vs Kibana — which is fast & cost-efficient?

Both eliminate the per-run LLM cost (a dashboard re-queries Elasticsearch for
free; only an LLM costs money). The deciding factors:

| Factor | Grafana | Kibana (7.6.2) |
|---|---|---|
| Data already connected | ✅ `Elasticsearch-WD` datasource → `webgilitydesktop-*` | ✅ index pattern exists |
| Daily Slack/email notification | ✅ native (Slack contact point / Enterprise reporting) **or** the tiny script here | ⚠️ needs Watcher/ElastAlert or a script |
| Time-range picker, drill-down | ✅ built-in; panels deep-link back to Kibana | ✅ built-in |
| One page, all sections | ✅ rows on one dashboard | ✅ one dashboard |
| LLM cost | **$0** | **$0** |

**Recommendation: Grafana.** The datasource is already configured, the target
dashboard URL was provided, and Slack delivery is one small scheduled script
(below). Kibana can do the same but Slack/email needs extra tooling
(Watcher/ElastAlert) and most users don't have CIS/WO Kibana access. Building a
Kibana `wd-dashboard` is a reasonable fallback if Grafana access is ever lost.

**What does NOT move to a dashboard:** the report's *Actionable Insights*
(written commentary) and the *Performance Deep-Dive per-step bars* (built by
regex-parsing the free-text `detail` field, `Step N: … ms`). Those still need
the agent if you want them; the dashboard links to Kibana for the raw step data.

---

## What the dashboard contains

One page, all sections, controlled by the Grafana **time-range picker** (default
= *yesterday 09:00 → today 09:00 IST*, the report window). Every panel
deep-links to the matching **Kibana Discover** view with the same time range;
subscriber/ID table rows link to that subscriber in Kibana.

| Report section | Grafana panel(s) |
|---|---|
| Executive Summary | Total / Errors / Fatals / Warnings / Info stat tiles |
| Hourly timeline | Stacked bar timeseries by level (Error/Fatal/Warning) |
| Error breakdown | Bar gauges by Module / Store / Tag / Process |
| Top error messages / subscribers | Tables (terms) with Kibana row links |
| Fatal events | Table by message + donut by store |
| Shopify Payout Performance | Records / events / subscribers / avg-rate tiles + top-subscriber table |
| Amazon Settlement | Events / errors / records / subscribers tiles + table |
| Performance Deep-Dive | Run-count + per-subscriber-run tiles/tables (steps → Kibana) |

Regenerate & push:

```bash
export KIBANA_WD_AUTH='user:pass'      # same LDAP creds used for Kibana
python3 grafana/build_wd_dashboard.py            # write grafana/wd-dashboard.json
python3 grafana/build_wd_dashboard.py --push     # upsert into live Grafana (uid UpKNy11vk)
```

Auth: the generator/notifier reuse `KIBANA_WD_AUTH` (the Kibana LDAP creds) for
Grafana basic auth — Grafana accepts the same Webgility LDAP login.

---

## ⚡ Performance: the one config change that makes it instant

The `Elasticsearch-WD` datasource points at the **wildcard** index
`webgilitydesktop-*`. A wildcard fans every query out across *all* historical
daily indices:

- A single 24h query is fast in isolation (~0.3–1.5 s).
- `date_histogram` aggregations scale OK (5+ concurrent ≈ 10 s).
- **`terms` aggregations build global ordinals across every index and time out**
  even 2-concurrent. With ~35 panels firing at once, every query hits the 30 s
  timeout. (Querying explicit daily indices returns in ~0.3 s even 7-concurrent.)

This is exactly what the `wd-es-kibana` skill warns about: *"Use specific date
indices … instead of wildcard … to avoid query timeouts."*

**Permanent fix (recommended):** switch the datasource to a **time-based daily
index pattern** so Grafana only queries the day(s) in the selected range:

- Index name: `[webgilitydesktop-]YYYY.MM.DD`
- Pattern: `Daily`
- Time field: `timestamp`

Apply it one of two ways (**requires Grafana `datasources:write` / Admin** — the
`krishna.bankar` LDAP account is only a Viewer):

```bash
# As a Grafana admin account:
GRAFANA_AUTH='admin_user:admin_pass' python3 grafana/apply_datasource_fix.py
# revert if ever needed:
GRAFANA_AUTH='admin_user:admin_pass' python3 grafana/apply_datasource_fix.py --revert
```

…or in the UI: **Connections → Data sources → Elasticsearch-WD** → set *Index
name* = `[webgilitydesktop-]YYYY.MM.DD`, *Pattern* = `Daily` → **Save & test**.
The resolved index names are identical per day, so other dashboards keep working
(and get faster too).

**After the fix:** every panel — terms aggregations included — loads in ~0.3 s,
and you can leave all sections expanded.

**Until the fix (current state, Viewer-only):** the dashboard ships with detail
sections **collapsed by default**. A collapsed Grafana row does not run its
panels' queries until expanded, so:

- The always-open **Executive Summary** (5 `date_histogram` tiles) loads on
  every visit.
- Expand one detail section at a time; it loads its few panels and renders.
- Avoid expanding many heavy (terms) sections simultaneously until the
  datasource fix is applied.

---

## Daily Slack notification (no LLM)

[`grafana/wd_daily_notify.py`](../grafana/wd_daily_notify.py) queries the
**explicit daily indices** (fast, no wildcard fan-out) for the headline numbers
and posts a compact Slack message that links to the Grafana dashboard pre-set to
the report window. No model is involved → ~zero cost.

```bash
python3 grafana/wd_daily_notify.py --dry-run                 # preview, no post
WD_HEALTH_SLACK_WEBHOOK='https://hooks.slack.com/...' \
    python3 grafana/wd_daily_notify.py                       # post via webhook
SLACK_BOT_TOKEN=xoxb-... WD_HEALTH_CHANNEL=C0B30EAD5BJ \
    python3 grafana/wd_daily_notify.py                       # post via bot token
```

- Target channel `#wd-health` = `C0B30EAD5BJ` (where the report is posted today).
- Use an incoming webhook (`WD_HEALTH_SLACK_WEBHOOK`) **or** a bot token +
  channel id (`SLACK_BOT_TOKEN` + `WD_HEALTH_CHANNEL`). The bot must be a member
  of the channel.
- **Email** instead of Slack: point Grafana Alerting at an email contact point,
  or pipe this script's output to `mail`. Slack is recommended to match today's
  flow.

Example message (real data):

```
📊 WD Kibana Daily Log Report — 2026-05-29
Period: May 28, 09:00 → May 29, 09:00 IST

🌐 Dashboard: Open WD-Dashboard in Grafana   (link pre-set to the window)

Executive Summary
• Total events: 111,177
• Errors: 22,061  (error rate 19.8%)
• Fatals: 2,016   Warnings: 183   Info: 86,917

Top error modules: Unknown (14,275), InventorySync (5,864), SchedulerJobKilled (1,139), …
Shopify payouts processed: 11,395   Amazon settlement events: 284
```

### Schedule it (weekdays 09:00 IST = 03:30 UTC), still no LLM

`cron`:

```cron
30 3 * * 1-5  cd /path/to/repo && KIBANA_WD_AUTH=... WD_HEALTH_SLACK_WEBHOOK=... \
              python3 grafana/wd_daily_notify.py >> logs/wd_daily_notify.log 2>&1
```

…or a GitHub Actions scheduled workflow / a Cursor scheduled cloud agent whose
only step runs this command. Because it is a plain script, the scheduled run
costs nothing in model usage — the whole point of moving off the LLM report.

---

## Notes

- Numbers in the dashboard (e.g. `now-24h`) and the notifier (the 09:00→09:00
  IST window) can differ simply because they cover different windows.
- Read-only: nothing here writes to Elasticsearch.
- The pre-existing two "Object Reference Error" panels are preserved in a
  collapsed **Legacy panels** row at the bottom of the dashboard.
