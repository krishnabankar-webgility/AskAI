/**
 * Update Confluence page body via REST v1 (JIRA_EMAIL + JIRA_API_TOKEN).
 * Uses storage HTML with escaped markdown inside <pre> for fidelity without convert API.
 */
const fs = require("fs");
const https = require("https");

const pageId = process.argv[2] || "3045425160";
const mdPath =
  process.argv[3] ||
  "c:/Agentic_Unify-Enterprise/AskAI/docs/_mcp_body_only.txt";
const site = "webgility.atlassian.net";
const email = process.env.JIRA_EMAIL;
const token = process.env.JIRA_API_TOKEN;
if (!email || !token) {
  console.error("Need JIRA_EMAIL and JIRA_API_TOKEN in environment");
  process.exit(1);
}
const auth = Buffer.from(`${email}:${token}`).toString("base64");

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const o = {
      hostname: site,
      path,
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    };
    const r = https.request(o, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(d));
          } catch {
            resolve(d);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${d.slice(0, 2500)}`));
        }
      });
    });
    r.on("error", reject);
    if (body) r.write(body);
    r.end();
  });
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function main() {
  const md = fs.readFileSync(mdPath, "utf8");
  const getPath = `/wiki/rest/api/content/${pageId}?expand=version,title`;
  const current = await req("GET", getPath);
  const nextVer = current.version.number + 1;
  const title = current.title;

  const storageValue =
    `<p><em>Source: <code>AskAI/docs/confluence-daily-work-update-agent-guide.md</code> — markdown shown verbatim below.</em></p>` +
    `<pre>${escapeHtml(md)}</pre>`;

  const putPath = `/wiki/rest/api/content/${pageId}`;
  const putBody = JSON.stringify({
    id: pageId,
    type: "page",
    title,
    version: { number: nextVer, message: "Full guide from AskAI/docs (REST)" },
    body: {
      storage: {
        value: storageValue,
        representation: "storage",
      },
    },
  });

  const out = await req("PUT", putPath, putBody);
  const web = out._links && out._links.webui;
  console.log("Updated OK");
  console.log(web ? `https://webgility.atlassian.net/wiki${web}` : JSON.stringify(out).slice(0, 400));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
