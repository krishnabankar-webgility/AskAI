# WD Kibana Daily Log Report - 2026-05-06

**Report Period:** May 5, 2026 9:00 AM IST -> May 6, 2026 9:00 AM IST (Tuesday)
**UTC Window:** `2026-05-05T03:30:00.000Z` -> `2026-05-06T03:30:00.000Z`
**Index:** `webgilitydesktop-2026.05.05, webgilitydesktop-2026.05.06`
**Generated:** 2026-05-06 03:32 UTC

---

## Executive Summary

| Metric | Current Window | Prior Window | Change |
|---|---|---|---|
| **Total Events** | 92,109 | 158,565 | -41.9% down |
| **Errors** | 17,878 | 30,920 | -42.2% down |
| **Fatals** | 2,896 | 3,824 | -24.3% down |
| **Warnings** | 251 | 150 | +67.3% up |
| **Info** | 71,084 | 123,671 | -42.5% down |
| **Error Rate** | 19.41% | 19.50% | -0.09pp down |

> **Key Observation:** top error message `The transaction was rollbacked or commited, please provide an open transaction. Parameter name: transaction` occurred 3,288 times; top module `Unknown` contributed 15,744 errors; top store `WooCommerce` contributed 4,035 errors; peak hourly error volume was 2,145 at 2026-05-05T23:00:00.000+05:30.

---

## Error Breakdown by Module

| Module | Count | % of Errors | Kibana | KQL / Filter | Indices |
|---|---|---|---|---|---|
| Unknown | 15,744 | 88.1% | [Open](https://kibana-wd.webgility.com) | `level : "Error" and not module : *` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| SchedulerJobKilled | 1,252 | 7.0% | [Open](https://kibana-wd.webgility.com) | `level : "Error" and module : "SchedulerJobKilled"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| PostOrderToAccounting | 820 | 4.6% | [Open](https://kibana-wd.webgility.com) | `level : "Error" and module : "PostOrderToAccounting"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| SchedulerCrashed | 38 | 0.2% | [Open](https://kibana-wd.webgility.com) | `level : "Error" and module : "SchedulerCrashed"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| StoreConnection | 24 | 0.1% | [Open](https://kibana-wd.webgility.com) | `level : "Error" and module : "StoreConnection"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |

---

## Error Breakdown by Store

| Store | Count | % of Errors | Kibana | KQL / Filter | Indices |
|---|---|---|---|---|---|
| WooCommerce | 4,035 | 22.6% | [Open](https://kibana-wd.webgility.com) | `level : "Error" and store : "WooCommerce"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| Shopify | 3,609 | 20.2% | [Open](https://kibana-wd.webgility.com) | `level : "Error" and store : "Shopify"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| Square | 3,018 | 16.9% | [Open](https://kibana-wd.webgility.com) | `level : "Error" and store : "Square"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| BigCommerce | 2,906 | 16.3% | [Open](https://kibana-wd.webgility.com) | `level : "Error" and store : "BigCommerce"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| AmazonMarketPlace | 1,323 | 7.4% | [Open](https://kibana-wd.webgility.com) | `level : "Error" and store : "AmazonMarketPlace"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| eBay | 1,077 | 6.0% | [Open](https://kibana-wd.webgility.com) | `level : "Error" and store : "eBay"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| Etsy | 465 | 2.6% | [Open](https://kibana-wd.webgility.com) | `level : "Error" and store : "Etsy"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| ChannelAdvisor | 334 | 1.9% | [Open](https://kibana-wd.webgility.com) | `level : "Error" and store : "ChannelAdvisor"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| Magento | 237 | 1.3% | [Open](https://kibana-wd.webgility.com) | `level : "Error" and store : "Magento"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| eBayUK | 221 | 1.2% | [Open](https://kibana-wd.webgility.com) | `level : "Error" and store : "eBayUK"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| Walmart | 214 | 1.2% | [Open](https://kibana-wd.webgility.com) | `level : "Error" and store : "Walmart"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| Magento2 | 173 | 1.0% | [Open](https://kibana-wd.webgility.com) | `level : "Error" and store : "Magento2"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |

---

## Error Breakdown by Tag

| Tag | Count | Kibana | KQL / Filter | Indices |
|---|---|---|---|---|
| Unknown | 13,155 | [Open](https://kibana-wd.webgility.com) | `level : "Error" and not tag : *` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| SaveSettingError | 2,686 | [Open](https://kibana-wd.webgility.com) | `level : "Error" and tag : "SaveSettingError"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| StoreConnectionError | 1,192 | [Open](https://kibana-wd.webgility.com) | `level : "Error" and tag : "StoreConnectionError"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| QuickBooksConnection | 755 | [Open](https://kibana-wd.webgility.com) | `level : "Error" and tag : "QuickBooksConnection"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| ReturnPosting | 61 | [Open](https://kibana-wd.webgility.com) | `level : "Error" and tag : "ReturnPosting"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| BigCommerceAuthenticationError | 12 | [Open](https://kibana-wd.webgility.com) | `level : "Error" and tag : "BigCommerceAuthenticationError"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| ShopifyAuthenticationError | 9 | [Open](https://kibana-wd.webgility.com) | `level : "Error" and tag : "ShopifyAuthenticationError"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| RefundPosting | 5 | [Open](https://kibana-wd.webgility.com) | `level : "Error" and tag : "RefundPosting"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| OrderPosting | 2 | [Open](https://kibana-wd.webgility.com) | `level : "Error" and tag : "OrderPosting"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| PaymentPosting | 1 | [Open](https://kibana-wd.webgility.com) | `level : "Error" and tag : "PaymentPosting"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |

---

## Error Breakdown by Process

| Process | Count | Kibana | KQL / Filter | Indices |
|---|---|---|---|---|
| Unknown | 14,283 | [Open](https://kibana-wd.webgility.com) | `level : "Error" and not process : *` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| Manual | 2,037 | [Open](https://kibana-wd.webgility.com) | `level : "Error" and process : "Manual"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| Scheduler | 1,558 | [Open](https://kibana-wd.webgility.com) | `level : "Error" and process : "Scheduler"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |

---

## Top Error Messages

| # | Message | Count | Kibana | KQL / Filter | Indices |
|---|---|---|---|---|---|
| 1 | The transaction was rollbacked or commited, please provide an open transaction. Parameter name: transaction | 3,288 | [Open](https://kibana-wd.webgility.com) | `level : "Error" and message : "The transaction was rollbacked or commited, please provide an open transaction. Parameter name: transaction"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| 2 | SaveSettingError | 2,686 | [Open](https://kibana-wd.webgility.com) | `level : "Error" and message : "SaveSettingError"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| 3 | System Matrix Get CPU Info Error : Invalid query | 2,616 | [Open](https://kibana-wd.webgility.com) | `level : "Error" and message : "System Matrix Get CPU Info Error : Invalid query"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| 4 | System Matrix Get CPU Info Error : Invalid class | 2,606 | [Open](https://kibana-wd.webgility.com) | `level : "Error" and message : "System Matrix Get CPU Info Error : Invalid class"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| 5 | Job Killed | 1,252 | [Open](https://kibana-wd.webgility.com) | `level : "Error" and message : "Job Killed"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| 6 | StoreConnectionError | 1,192 | [Open](https://kibana-wd.webgility.com) | `level : "Error" and message : "StoreConnectionError"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| 7 | QB Common Open connection problem | 755 | [Open](https://kibana-wd.webgility.com) | `level : "Error" and message : "QB Common Open connection problem"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| 8 | Thread was being aborted. | 381 | [Open](https://kibana-wd.webgility.com) | `level : "Error" and message : "Thread was being aborted."` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| 9 | [DBNETLIB][ConnectionOpen (Connect()).]SQL Server does not exist or access denied. | 376 | [Open](https://kibana-wd.webgility.com) | `level : "Error" and message : "[DBNETLIB][ConnectionOpen (Connect()).]SQL Server does not exist or access denied."` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| 10 | Unknown | 348 | [Open](https://kibana-wd.webgility.com) | `level : "Error" and not message : *` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| 11 | The fractional part of the provided time value overflows the scale of the corresponding SQL Server parameter or column. Increase bScale in DBPARAMBINDINFO or column scale to correct this error. | 224 | [Open](https://kibana-wd.webgility.com) | `level : "Error" and message : "The fractional part of the provided time value overflows the scale of the corresponding SQL Server parameter or column. Increase bScale in DBPARAMBINDINFO or column scale to correct this er...` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| 12 | A modal dialog box is showing in the QuickBooks user interface. Your application cannot access QuickBooks until the user dismisses the dialog box. | 190 | [Open](https://kibana-wd.webgility.com) | `level : "Error" and message : "A modal dialog box is showing in the QuickBooks user interface. Your application cannot access QuickBooks until the user dismisses the dialog box."` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| 13 | Login timeout expired | 184 | [Open](https://kibana-wd.webgility.com) | `level : "Error" and message : "Login timeout expired"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| 14 | Request has been submitted to Amazon server and waiting for a response. Please do not click on Get New Orders in the meantime. We appreciate your patience | 179 | [Open](https://kibana-wd.webgility.com) | `level : "Error" and message : "Request has been submitted to Amazon server and waiting for a response. Please do not click on Get New Orders in the meantime. We appreciate your patience"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| 15 | [DBNETLIB][ConnectionOpen (PreLoginHandshake()).]General network error. Check your network documentation. | 157 | [Open](https://kibana-wd.webgility.com) | `level : "Error" and message : "[DBNETLIB][ConnectionOpen (PreLoginHandshake()).]General network error. Check your network documentation."` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |

> Top 3 error messages account for 48.0% of all errors.

---

## Top Error Subscribers

| Subscriber ID | Error Count | % of Errors | Kibana | KQL / Filter | Indices |
|---|---|---|---|---|---|
| 73243 | 3,347 | 18.7% | [Open](https://kibana-wd.webgility.com) | `level : "Error" and subscriberID : "73243"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| 106904 | 3,013 | 16.9% | [Open](https://kibana-wd.webgility.com) | `level : "Error" and subscriberID : "106904"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| 94998 | 2,030 | 11.4% | [Open](https://kibana-wd.webgility.com) | `level : "Error" and subscriberID : "94998"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| 76110 | 960 | 5.4% | [Open](https://kibana-wd.webgility.com) | `level : "Error" and subscriberID : "76110"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| 97160 | 749 | 4.2% | [Open](https://kibana-wd.webgility.com) | `level : "Error" and subscriberID : "97160"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| 101078 | 692 | 3.9% | [Open](https://kibana-wd.webgility.com) | `level : "Error" and subscriberID : "101078"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| 614 | 409 | 2.3% | [Open](https://kibana-wd.webgility.com) | `level : "Error" and subscriberID : "614"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| 105574 | 332 | 1.9% | [Open](https://kibana-wd.webgility.com) | `level : "Error" and subscriberID : "105574"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| 56483 | 319 | 1.8% | [Open](https://kibana-wd.webgility.com) | `level : "Error" and subscriberID : "56483"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| 97366 | 266 | 1.5% | [Open](https://kibana-wd.webgility.com) | `level : "Error" and subscriberID : "97366"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| 95000 | 215 | 1.2% | [Open](https://kibana-wd.webgility.com) | `level : "Error" and subscriberID : "95000"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| 2200 | 197 | 1.1% | [Open](https://kibana-wd.webgility.com) | `level : "Error" and subscriberID : "2200"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |

---

## Fatal Events (2,896)

### Fatal by Message

| Message | Count | Kibana | KQL / Filter | Indices |
|---|---|---|---|---|
| The remote server returned an error: (401) Unauthorized. | 1,036 | [Open](https://kibana-wd.webgility.com) | `level : "Fatal" and message : "The remote server returned an error: (401) Unauthorized."` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| The fractional part of the provided time value overflows the scale of the corresponding SQL Server parameter or column. Increase bScale in DBPARAMBINDINFO or column scale to correct this error. | 361 | [Open](https://kibana-wd.webgility.com) | `level : "Fatal" and message : "The fractional part of the provided time value overflows the scale of the corresponding SQL Server parameter or column. Increase bScale in DBPARAMBINDINFO or column scale to correct this er...` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| There is no row at position 0. | 345 | [Open](https://kibana-wd.webgility.com) | `level : "Fatal" and message : "There is no row at position 0."` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| Cannot access a closed Stream. | 197 | [Open](https://kibana-wd.webgility.com) | `level : "Fatal" and message : "Cannot access a closed Stream."` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| A modal dialog box is showing in the QuickBooks user interface. Your application cannot access QuickBooks until the user dismisses the dialog box. | 130 | [Open](https://kibana-wd.webgility.com) | `level : "Fatal" and message : "A modal dialog box is showing in the QuickBooks user interface. Your application cannot access QuickBooks until the user dismisses the dialog box."` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| The QuickBooks company data file is currently open in a mode other than the one specified by your application. | 106 | [Open](https://kibana-wd.webgility.com) | `level : "Fatal" and message : "The QuickBooks company data file is currently open in a mode other than the one specified by your application."` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| Unknown | 102 | [Open](https://kibana-wd.webgility.com) | `level : "Fatal" and not message : *` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| Cannot create QBXMLRP2 COM component. | 64 | [Open](https://kibana-wd.webgility.com) | `level : "Fatal" and message : "Cannot create QBXMLRP2 COM component. "` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| This application is not allowed to log into this QuickBooks company data file automatically. The QuickBooks administrator can grant permission for an automatic login through the Integrated Application preferences. | 60 | [Open](https://kibana-wd.webgility.com) | `level : "Fatal" and message : "This application is not allowed to log into this QuickBooks company data file automatically. The QuickBooks administrator can grant permission for an automatic login through the Integrated ...` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| Could not start QuickBooks. | 51 | [Open](https://kibana-wd.webgility.com) | `level : "Fatal" and message : "Could not start QuickBooks."` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |

### Fatal by Store

| Store | Count | Kibana | KQL / Filter | Indices |
|---|---|---|---|---|
| Shopify | 1,202 | [Open](https://kibana-wd.webgility.com) | `level : "Fatal" and store : "Shopify"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| WooCommerce | 466 | [Open](https://kibana-wd.webgility.com) | `level : "Fatal" and store : "WooCommerce"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| BigCommerce | 324 | [Open](https://kibana-wd.webgility.com) | `level : "Fatal" and store : "BigCommerce"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| AmazonMarketPlace | 256 | [Open](https://kibana-wd.webgility.com) | `level : "Fatal" and store : "AmazonMarketPlace"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| eBay | 230 | [Open](https://kibana-wd.webgility.com) | `level : "Fatal" and store : "eBay"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| Magento | 138 | [Open](https://kibana-wd.webgility.com) | `level : "Fatal" and store : "Magento"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| Magento2 | 125 | [Open](https://kibana-wd.webgility.com) | `level : "Fatal" and store : "Magento2"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| PinnacleCart | 31 | [Open](https://kibana-wd.webgility.com) | `level : "Fatal" and store : "PinnacleCart"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| YahooStore | 27 | [Open](https://kibana-wd.webgility.com) | `level : "Fatal" and store : "YahooStore"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |
| CustomStore | 19 | [Open](https://kibana-wd.webgility.com) | `level : "Fatal" and store : "CustomStore"` | `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06` |

---

## Hourly Error Timeline (IST)

| Hour (IST) | Errors | Visual |
|---|---|---|
| 09:00 | 6 | `#.........` |
| 10:00 | 4 | `#.........` |
| 11:00 | 1 | `#.........` |
| 12:00 | 9 | `#.........` |
| 13:00 | 135 | `#.........` |
| 14:00 | 74 | `#.........` |
| 15:00 | 159 | `#.........` |
| 16:00 | 266 | `#.........` |
| 17:00 | 279 | `#.........` |
| 18:00 | 587 | `###.......` |
| 19:00 | 923 | `####......` |
| 20:00 | 1,515 | `#######...` |
| 21:00 | 1,169 | `#####.....` |
| 22:00 | 1,821 | `########..` |
| 23:00 | 2,145 | `##########` |
| 00:00 | 1,751 | `########..` |
| 01:00 | 1,498 | `#######...` |
| 02:00 | 1,353 | `######....` |
| 03:00 | 1,134 | `#####.....` |
| 04:00 | 1,163 | `#####.....` |
| 05:00 | 846 | `####......` |
| 06:00 | 389 | `##........` |
| 07:00 | 350 | `##........` |
| 08:00 | 301 | `#.........` |

> Peak hour: 2026-05-05T23:00:00.000+05:30 with 2,145 errors.

---

## Performance by module - Shopify (PayoutPosting)

| Metric | Current Window | Prior Window | Vs Prior Window |
|---|---|---|---|
| Matching documents | 1,192 | 1,522 | -21.7% down |
| Total payouts processed | 5,716 | 3,644 | +56.9% up |
| Total processing time | 203h 7m 42s | 119h 12m 36s | +70.4% up |
| Time per payout - average | 2m 8s | 1m 58s | +8.6% up |
| Time per payout - min | 9.52s | 4.67s | proxy/observed |
| Time per payout - max | 16m 40s | 16m 40s | proxy/observed |

Duration basis: estimated from rate fields. Query filter: `store : "Shopify" and module : "PayoutPosting"` on `webgilitydesktop-2026.05.05,webgilitydesktop-2026.05.06`.

---

## Latest Error/Fatal Samples

| Timestamp (UTC/Stored) | Level | Subscriber | Store | Module | Message |
|---|---|---|---|---|---|
| 2026-05-05T20:29:49.6663503-07:00 | Error | 101078 | AmazonMarketPlace | SchedulerJobKilled | Job Killed |
| 2026-05-05T20:29:24.7728270-07:00 | Error | 1646 | Shopify | Unknown | Thread was being aborted. |
| 2026-05-05T22:29:08.8654294-05:00 | Error | 90193 | AmazonMarketPlace | PostOrderToAccounting | QB Common Open connection problem |
| 2026-05-05T23:29:05.0585167-04:00 | Fatal | 3151 | BigCommerce | Unknown | The remote server returned an error: (401) Unauthorized. |
| 2026-05-05T23:29:04.2761645-04:00 | Fatal | 3151 | BigCommerce | Unknown | The remote server returned an error: (401) Unauthorized. |
| 2026-05-05T20:28:49.6669787-07:00 | Error | 101078 | AmazonMarketPlace | SchedulerJobKilled | Job Killed |
| 2026-05-05T20:28:07.9137862-07:00 | Error | 98361 | AmazonMarketPlace | PostOrderToAccounting | QB Common Open connection problem |
| 2026-05-05T22:28:04.7160893-05:00 | Fatal | 87389 | BigCommerce | Unknown | The remote server returned an error: (401) Unauthorized. |
| 2026-05-05T22:28:03.9828638-05:00 | Fatal | 87389 | BigCommerce | Unknown | The remote server returned an error: (401) Unauthorized. |
| 2026-05-05T20:27:49.6548048-07:00 | Error | 101078 | AmazonMarketPlace | SchedulerJobKilled | Job Killed |

---

## Actionable Insights

1. **Top error message:** `The transaction was rollbacked or commited, please provide an open transaction. Parameter name: transaction` generated 3,288 errors (18.4% of errors). Review this error path first in Kibana using the filter shown above.
2. **Top module:** `Unknown` generated 15,744 errors. Prioritize owners of this module for triage.
3. **Top store:** `WooCommerce` generated 4,035 errors. Check whether failures concentrate in one provider integration or subscriber cohort.
4. **Top subscriber:** `73243` generated 3,347 errors (18.7%). Validate whether this is expected high-volume activity or a stuck retry loop.
5. **Peak timing:** Error volume peaked at `2026-05-05T23:00:00.000+05:30` with 2,145 errors. Correlate with scheduler runs and external provider availability during that hour.

---

*Report generated from Kibana WD (`kibana-wd.webgility.com`) via the Kibana HTTPS console proxy. Drilldown rows include the exact KQL/filter context and date-scoped indices to run in Kibana Discover.*
