# WD Kibana Daily Log Report — 2026-05-05

**Report Period:** May 4, 2026 9:00 AM IST → May 5, 2026 9:00 AM IST (Monday)
**Index:** `webgilitydesktop-2026.05.04, webgilitydesktop-2026.05.05`
**Generated:** 2026-05-05

---

## Executive Summary

| Metric | Today (May 5) | Previous (May 4) | Change |
|--------|--------------|-------------------|--------|
| **Total Events** | [158,564](https://kibana-wd.webgility.com/goto/1850e4ca738b2dfeb2d45728d0ac2e72) | 32,443 | +388.8% ▲ |
| **Errors** | [30,919](https://kibana-wd.webgility.com/goto/1c4fe0a476bcb0a15cee7b2ee6fe5e54) | 5,564 | +455.8% ▲ |
| **Fatals** | [3,824](https://kibana-wd.webgility.com/goto/19d7373e6e7318d1d194901a2822e1f0) | 105 | +3,542% ▲ |
| **Warnings** | [150](https://kibana-wd.webgility.com/goto/32db034c7442e99feabc64877a267a31) | 95 | +57.9% ▲ |
| **Info** | [123,671](https://kibana-wd.webgility.com/goto/da846ac0836bb4aaacf3706c58edc054) | 26,679 | +363.5% ▲ |
| **Error Rate** | 19.50% | 17.15% | +2.35pp ▲ |

> **Key Observation:** Monday spike — total events up **+388.8%** vs Sunday. Errors surged **+455.8%** driven by transaction rollback failures (6,989), CPU-info WMI errors (8,839 combined), and SchedulerJobKilled events (2,318). Fatals exploded **+3,542%** with 401 Unauthorized errors (1,053) leading — likely expired auth tokens after the weekend.

---

## Error Breakdown by Module

| Module | Count | % of Errors | Drilldown |
|--------|------:|------------:|-----------|
| Unknown (no module) | 27,526 | 89.0% | [View](https://kibana-wd.webgility.com/goto/7f9129228acc62f766cc1bd86653092e) |
| SchedulerJobKilled | 2,318 | 7.5% | [View](https://kibana-wd.webgility.com/goto/7a965c3240654831e3b78b8bb7f71b87) |
| PostOrderToAccounting | 1,033 | 3.3% | [View](https://kibana-wd.webgility.com/goto/3a3aaf40a3c7e142b8347347d9274a9f) |
| SchedulerCrashed | 36 | 0.1% | [View](https://kibana-wd.webgility.com/goto/5e86bf7d767206703913106f09149798) |
| StoreConnection | 5 | <0.1% | [View](https://kibana-wd.webgility.com/goto/ce499f6a15dcddd87708f2547a18b61c) |
| PayoutPosting | 1 | <0.1% | [View](https://kibana-wd.webgility.com/goto/6de0ecf00d0e955d74c3f033f4f19525) |

---

## Error Breakdown by Store

| Store | Count | % of Errors | Drilldown |
|-------|------:|------------:|-----------|
| WooCommerce | 10,474 | 33.9% | [View](https://kibana-wd.webgility.com/goto/a5d04ce1c762fbcda1af7bec50bf36dd) |
| Shopify | 6,974 | 22.6% | [View](https://kibana-wd.webgility.com/goto/7bfd7edd213f285c4d7bf8797e647e80) |
| BigCommerce | 6,113 | 19.8% | [View](https://kibana-wd.webgility.com/goto/a85c6ddace2250cca7abdfc4f4f729f0) |
| eBay | 2,843 | 9.2% | [View](https://kibana-wd.webgility.com/goto/bff30427584cf1117662a54c7641c30f) |
| AmazonMarketPlace | 1,341 | 4.3% | [View](https://kibana-wd.webgility.com/goto/a55dfff86bb8354bb5e35c42d81f1ea6) |
| XCartFive | 1,089 | 3.5% | [View](https://kibana-wd.webgility.com/goto/ca2a53f1a38b1884a4a6f2d2c5183226) |
| ChannelAdvisor | 525 | 1.7% | [View](https://kibana-wd.webgility.com/goto/e3f8ebf56936815285c9729b8f929cee) |
| Magento2 | 396 | 1.3% | [View](https://kibana-wd.webgility.com/goto/1d6c0127fa2f39468514c8d919def74f) |
| Walmart | 361 | 1.2% | [View](https://kibana-wd.webgility.com/goto/d47529ac68c2b82f03e424e2f17c0145) |
| Etsy | 342 | 1.1% | [View](https://kibana-wd.webgility.com/goto/f26a7e68263080d2a5ea2152e42b8a81) |

---

## Error Breakdown by Tag

| Tag | Count | Drilldown |
|-----|------:|-----------|
| SaveSettingError | 4,038 | [View](https://kibana-wd.webgility.com/goto/07ef24273253f1db09ba60cc1199fbc1) |
| StoreConnectionError | 1,351 | [View](https://kibana-wd.webgility.com/goto/118de8e657e304bc97326249fb0c3ad3) |
| QuickBooksConnection | 1,004 | [View](https://kibana-wd.webgility.com/goto/cb1be2ef1804cc839505d58e4002518e) |
| ReturnPosting | 32 | [View](https://kibana-wd.webgility.com/goto/c7a967073042e1896adb97da61b0c267) |
| ShopifyAuthenticationError | 10 | [View](https://kibana-wd.webgility.com/goto/dc09a024c818af486296b4980c97f9a8) |
| RefundPosting | 2 | [View](https://kibana-wd.webgility.com/goto/ea3017cf7025cc4040840f5538e2e940) |
| PayoutPaymentPosting | 1 | [View](https://kibana-wd.webgility.com/goto/3ba13892d16bb8960d353d25c9e38c54) |

---

## Error Breakdown by Process

| Process | Count | Drilldown |
|---------|------:|-----------|
| Manual | 2,812 | [View](https://kibana-wd.webgility.com/goto/983f34e8689d40a6228d0102d86ddb16) |
| Scheduler | 1,579 | [View](https://kibana-wd.webgility.com/goto/4b03c74b47f95e317c5749b72c1a2ef5) |

---

## Top Error Messages

| # | Message | Count | Drilldown |
|---|---------|------:|-----------|
| 1 | The transaction was rollbacked or commited, please provide an open transaction | 6,989 | [View](https://kibana-wd.webgility.com/goto/38a8bc38d55a4a7eee2e8dbbecd23b96) |
| 2 | System Matrix Get CPU Info Error : Invalid query | 4,426 | [View](https://kibana-wd.webgility.com/goto/d7d310d700590ad57870d9aeb949cf1d) |
| 3 | System Matrix Get CPU Info Error : Invalid class | 4,413 | [View](https://kibana-wd.webgility.com/goto/8b9718c4611fde58ffe169b1516e9855) |
| 4 | SaveSettingError | 4,038 | [View](https://kibana-wd.webgility.com/goto/56cd68189918f67cf9037b559ed8c81a) |
| 5 | Job Killed | 2,318 | [View](https://kibana-wd.webgility.com/goto/ea040047902e352f88944e239a31e262) |
| 6 | Request submitted to Amazon — waiting for response | 2,064 | [View](https://kibana-wd.webgility.com/goto/fd22208271081bb29bd4f92fa07b6958) |
| 7 | StoreConnectionError | 1,351 | [View](https://kibana-wd.webgility.com/goto/823b918f8b7f88a07897132eafdba366) |
| 8 | QB Common Open connection problem | 1,004 | [View](https://kibana-wd.webgility.com/goto/202a50112747aa21ab89e965ff3b6877) |
| 9 | DBNETLIB — SQL Server does not exist or access denied | 868 | [View](https://kibana-wd.webgility.com/goto/d7f071e43a18e86d26852669d65e8d8b) |
| 10 | Thread was being aborted | 449 | [View](https://kibana-wd.webgility.com/goto/c963983e8dc5c3286a20f81fef0a9693) |
| 11 | Login timeout expired | 256 | [View](https://kibana-wd.webgility.com/goto/229ed2a7abc2f7c7e4503372aa3a9a1a) |
| 12 | Fractional time value overflows bScale | 228 | [View](https://kibana-wd.webgility.com/goto/d2b4cc7ec143400a8f5a50884ef7bd45) |
| 13 | Could not start QuickBooks | 137 | [View](https://kibana-wd.webgility.com/goto/4057b2524bad3f3ea23f685203bfbdf0) |
| 14 | COM class factory 80040154 — Class not registered | 120 | [View](https://kibana-wd.webgility.com/goto/b72f654d8c314f30269b850632889c21) |
| 15 | Modal dialog box showing in QB UI | 119 | [View](https://kibana-wd.webgility.com/goto/1f3323733cab7a40a2038d339c38a88e) |

> **Top 3 errors account for 51%** of all errors. Transaction rollback is the new #1 (not seen yesterday) — suggests database connection instability after the weekend. CPU-info WMI errors persist from multiple subscribers.

---

## Top Error Subscribers

| Subscriber ID | Error Count | % of Errors | Drilldown |
|--------------|------------:|------------:|-----------|
| 73243 | 7,125 | 23.0% | [View](https://kibana-wd.webgility.com/goto/56e823cfd94f2baeab0107ad008d5f31) |
| 94998 | 4,753 | 15.4% | [View](https://kibana-wd.webgility.com/goto/6f6731d9bc893d47a02b928a730ab5b5) |
| 38052 | 2,946 | 9.5% | [View](https://kibana-wd.webgility.com/goto/047c0e0752a222597480511c4a4e5c5c) |
| 95030 | 1,876 | 6.1% | [View](https://kibana-wd.webgility.com/goto/f0bcc97985ce8641608e2bd03e2a074a) |
| 98592 | 1,085 | 3.5% | [View](https://kibana-wd.webgility.com/goto/154edd92b7e3c853a944f6b280423d20) |
| 102624 | 913 | 3.0% | [View](https://kibana-wd.webgility.com/goto/954bf017a69e424b3f2473caa17967b0) |
| 76110 | 880 | 2.8% | [View](https://kibana-wd.webgility.com/goto/f1d8261a6f14bab7ac6bb841cb2d589b) |
| 103773 | 812 | 2.6% | [View](https://kibana-wd.webgility.com/goto/fea43feb93160dd9d6a6576a51090aa1) |
| 56483 | 517 | 1.7% | [View](https://kibana-wd.webgility.com/goto/41113c47ab7df4cab4201884dd0fa666) |
| 101889 | 449 | 1.5% | [View](https://kibana-wd.webgility.com/goto/6d0a3e25e43693aeafc7f1a7edd3cf19) |

---

## Fatal Events (3,824)

### Fatal by Message

| Message | Count | Drilldown |
|---------|------:|-----------|
| Remote server error (401) Unauthorized | 1,053 | [View](https://kibana-wd.webgility.com/goto/781118c86db5f92a32a99a35704a0ca4) |
| There is no row at position 0 | 458 | [View](https://kibana-wd.webgility.com/goto/1706092e98e1fd6b381919e56928b61f) |
| Fractional time value overflows bScale | 372 | [View](https://kibana-wd.webgility.com/goto/c9c941df6f683eec0977c154cd6f04bb) |
| Cannot access a closed Stream | 303 | [View](https://kibana-wd.webgility.com/goto/d1933334a4028137736b6fb6de1345ed) |
| QB auto-login not allowed | 155 | [View](https://kibana-wd.webgility.com/goto/2e091dde19112fe16cbc3481e6370a7b) |
| Unexpected character parsing value | 150 | [View](https://kibana-wd.webgility.com/goto/d79962ab30144fa6547ee2bea06d57fb) |
| Object reference not set (NullRef) | 129 | [View](https://kibana-wd.webgility.com/goto/dc527d35bac3a67553fe8d6c99b30790) |
| Remote server error (500) Internal Server Error | 106 | [View](https://kibana-wd.webgility.com/goto/1b89ad558c83643f718485653573aaf9) |
| Modal dialog box showing in QB UI | 104 | [View](https://kibana-wd.webgility.com/goto/ef5fa5e1c645e68a14ca99250a9357ff) |
| Remote server error (400) Bad Request | 73 | [View](https://kibana-wd.webgility.com/goto/27ca2f5245c7f467f20146a2665ba897) |

### Fatal by Store

| Store | Count | Drilldown |
|-------|------:|-----------|
| Shopify | 1,700 | [View](https://kibana-wd.webgility.com/goto/4da58e806a52e8dd1a03e1ff9c7941ec) |
| WooCommerce | 882 | [View](https://kibana-wd.webgility.com/goto/8c93dc2c4fc77d33ae613e17453b99cd) |
| BigCommerce | 583 | [View](https://kibana-wd.webgility.com/goto/265437c8df24edcca7bb02217ee60383) |
| Magento | 136 | [View](https://kibana-wd.webgility.com/goto/9f86a5288eea6cfbce445a02683bca91) |
| AmazonMarketPlace | 117 | [View](https://kibana-wd.webgility.com/goto/b1cc0a34f92a3df03d675fdcc659d069) |
| Magento2 | 85 | [View](https://kibana-wd.webgility.com/goto/760ab6d72ab4eb6ba302a924bbdcd746) |
| PinnacleCart | 40 | [View](https://kibana-wd.webgility.com/goto/02c28aa5e272fdb2a3fe825c3e67d857) |
| eBay | 33 | [View](https://kibana-wd.webgility.com/goto/75af4fbfb4e1e4d5edaf45301867a769) |
| Shift4Shop | 31 | [View](https://kibana-wd.webgility.com/goto/6ba5759b36146c3056855cfe8e32ba37) |
| YahooStore | 30 | [View](https://kibana-wd.webgility.com/goto/193e88d2fe4c1fc92981483db3df58cf) |

---

## Hourly Error Timeline (IST)

| Hour (IST) | Errors | Visual |
|------------|-------:|--------|
| 04:00 | 2 | ░ |
| 05:00 | 1 | ░ |
| 06:00 | 18 | ░ |
| 07:00 | 54 | ░ |
| 08:00 | 42 | ░ |
| 09:00 | 99 | ░ |
| 10:00 | 94 | ░ |
| 11:00 | 300 | █░░░░░░░░░ |
| 12:00 | 389 | █░░░░░░░░░ |
| 13:00 | 1,113 | ███░░░░░░░ |
| 14:00 | 1,006 | ███░░░░░░░ |
| 15:00 | 1,864 | █████░░░░░ |
| 16:00 | 3,618 | ██████████ |
| 17:00 | 2,665 | ███████░░░ |
| 18:00 | 2,619 | ███████░░░ |
| 19:00 | 2,872 | ████████░░ |
| 20:00 | 2,762 | ████████░░ |
| 21:00 | 2,566 | ███████░░░ |
| 22:00 | 2,482 | ███████░░░ |
| 23:00 | 2,180 | ██████░░░░ |
| 00:00 | 1,537 | ████░░░░░░ |
| 01:00 | 1,085 | ███░░░░░░░ |
| 02:00 | 1,027 | ███░░░░░░░ |
| 03:00 | 524 | █░░░░░░░░░ |

> **Peak hour:** 16:00 IST (3,618 errors). Errors ramped from 13:00 IST onward and sustained heavy volume through 23:00 IST — typical Monday business-hours pattern with US East Coast activity driving the peak at 16:00–20:00 IST (6:30–10:30 AM ET).

---

## Shopify Payout Performance

| Metric | Value | Drilldown |
|--------|------:|-----------|
| **Total Payouts Processed** | 3,644 | [View](https://kibana-wd.webgility.com/goto/c4c0fb7191589fc4ab1796f5688676d5) |
| **Total Time (all payouts)** | 56m 12s | — |
| **Min Time (1 payout)** | 4.7s | — |
| **Max Time (1 payout)** | 48.2s | — |
| **Avg Time (1 payout)** | 16.8s | — |

---

## Actionable Insights

1. **Transaction Rollback Surge (#1 error, 6,989 occurrences):** New top error not seen at this volume previously. Indicates database connection instability — likely SQL Server connection pool exhaustion after weekend idle. Multiple subscribers affected across WooCommerce, Shopify, and BigCommerce. Investigate SQL Server connection timeouts and pool settings.

2. **401 Unauthorized Fatals (1,053):** Leading fatal cause — likely expired OAuth tokens or API keys that weren't refreshed over the weekend. Shopify (1,700 fatals) is the hardest-hit store. Recommend checking token refresh mechanisms.

3. **Subscriber #73243 — Top Error Generator (7,125 errors, 23%):** Heavily impacting WooCommerce error counts. Combined with #94998 (4,753) and #38052 (2,946), the top 3 subscribers generate 48% of all errors. Proactive outreach recommended.

4. **SchedulerJobKilled Spike (2,318):** Monday scheduler jobs being killed at high rate — could indicate resource contention as all scheduled jobs resume simultaneously after the quiet weekend. Consider staggering scheduler start times.

5. **Performance Healthy — PayoutPosting:** Processed records up **+334%** (840 → 3,644) on Shopify PayoutPosting. Max rate hit 0.214 rec/s. Monday volume recovery is healthy and expected.

---

*Report generated from Kibana WD (`kibana-wd.webgility.com`). All drilldown links open in Kibana Discover with pre-filtered queries.*
