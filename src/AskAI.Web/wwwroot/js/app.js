/* global marked */

const state = {
  catalog: null,
  tab: "agents",
  platform: "all",
  filter: "",
};

const els = {};

function $(id) {
  return document.getElementById(id);
}

async function loadCatalog(force) {
  const url = `/api/catalog${force ? "?refresh=true" : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Catalog HTTP ${res.status}`);
  state.catalog = await res.json();
  $("repo-foot").textContent = `Repo root: ${state.catalog.repoRoot}`;
}

function setHash(route) {
  window.location.hash = route;
}

function parseHash() {
  const h = (window.location.hash || "").replace(/^#/, "");
  if (!h) return { type: "none" };
  if (h.startsWith("agent/")) return { type: "agent", id: decodeURIComponent(h.slice("agent/".length)) };
  if (h.startsWith("doc/")) return { type: "doc", path: decodeURIComponent(h.slice("doc/".length)) };
  return { type: "none" };
}

function agentPlatforms(agent) {
  const flags = [];
  if (agent.artifacts.cursorAgent) flags.push("cursor");
  if (agent.artifacts.copilotAgent) flags.push("copilot");
  if (agent.artifacts.vsCodeAgentPicker) flags.push("vscode");
  return flags;
}

function passesPlatform(agent) {
  if (state.tab !== "agents" || state.platform === "all") return true;
  return agentPlatforms(agent).includes(state.platform);
}

function passesFilter(text) {
  if (!state.filter) return true;
  const q = state.filter.toLowerCase();
  return text.toLowerCase().includes(q);
}

function renderList() {
  const list = $("list");
  list.innerHTML = "";
  const cat = state.catalog;
  if (!cat) {
    list.innerHTML = `<div class="muted">Loading catalog…</div>`;
    return;
  }

  const frag = document.createDocumentFragment();

  if (state.tab === "about") {
    $("platform-chips").hidden = true;
    list.innerHTML = `
      <div class="card" style="cursor:default">
        <h3>AskAI catalog web</h3>
        <p class="muted">This UI reads the repository on disk (resolved automatically from the running app, or via <code>AgentCatalog:RepoRoot</code> / <code>AGENT_CATALOG_REPO_ROOT</code>).</p>
        <ul class="muted" style="font-size:0.88rem;line-height:1.45">
          <li><strong>Agents</strong> — Cursor subagents, Copilot mirrors, VS Code picker entries, and GitHub prompts when present.</li>
          <li><strong>Skills</strong> — canonical files under <code>.cursor/skill-library/</code>.</li>
          <li><strong>Copilot mirrors</strong> — copies or references under <code>.github/copilot/skills/</code>.</li>
          <li><strong>Catalog assistant</strong> — keyword search over names/descriptions/paths (no external LLM).</li>
        </ul>
        <p style="margin-top:10px"><button type="button" class="linkish" data-open="${encodeURIComponent("AGENTS.md")}">Open AGENTS.md</button></p>
      </div>`;
    list.querySelector("button[data-open]")?.addEventListener("click", (ev) => {
      const p = decodeURIComponent(ev.currentTarget.getAttribute("data-open"));
      setHash(`doc/${encodeURIComponent(p)}`);
    });
    return;
  }

  if (state.tab === "agents") {
    $("platform-chips").hidden = false;
    for (const agent of cat.agents) {
      if (!passesPlatform(agent)) continue;
      const hay = `${agent.id} ${agent.displayName || ""} ${agent.description || ""} ${agent.summaryExcerpt || ""}`;
      if (!passesFilter(hay)) continue;

      const card = document.createElement("button");
      card.type = "button";
      card.className = "card";
      card.innerHTML = `
        <h3>${escapeHtml(agent.displayName || agent.id)}</h3>
        <p>${escapeHtml(agent.description || agent.summaryExcerpt || "")}</p>
        <div class="pill-row">
          ${agentPlatforms(agent)
            .map((p) => `<span class="pill">${p}</span>`)
            .join("")}
        </div>`;
      card.addEventListener("click", () => setHash(`agent/${encodeURIComponent(agent.id)}`));
      frag.appendChild(card);
    }
  } else {
    $("platform-chips").hidden = true;
    const items =
      state.tab === "skills"
        ? cat.skills
        : state.tab === "copilot"
          ? cat.copilotSkillMirrors
          : state.tab === "prompts"
            ? collectPrompts(cat)
            : [];

    for (const item of items) {
      if (!passesFilter(item.relativePath)) continue;
      const card = document.createElement("button");
      card.type = "button";
      card.className = "card";
      card.innerHTML = `<h3>${escapeHtml(item.relativePath)}</h3><p>${escapeHtml(item.label || "")}</p>`;
      card.addEventListener("click", () => setHash(`doc/${encodeURIComponent(item.relativePath)}`));
      frag.appendChild(card);
    }
  }

  list.appendChild(frag);
  if (!list.childElementCount) list.innerHTML = `<div class="muted">No items match.</div>`;
}

function collectPrompts(cat) {
  const map = new Map();
  for (const agent of cat.agents) {
    if (agent.artifacts.gitHubPrompt) map.set(agent.artifacts.gitHubPrompt.relativePath, agent.artifacts.gitHubPrompt);
  }
  for (const p of cat.orphanPrompts || []) map.set(p.relativePath, p);
  return Array.from(map.values());
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function renderAgentDetail(id) {
  const res = await fetch(`/api/catalog/agents/${encodeURIComponent(id)}`);
  if (!res.ok) {
    showEmpty(`Agent not found: ${escapeHtml(id)}`);
    return;
  }
  const agent = await res.json();
  $("detail-empty").hidden = true;
  $("detail-doc").hidden = true;
  const host = $("detail-agent");
  host.hidden = false;
  host.className = "agent-detail";
  host.innerHTML = `
    <h2>${escapeHtml(agent.displayName || agent.id)} <span class="muted small">/ ${escapeHtml(agent.id)}</span></h2>
    <p class="muted">${escapeHtml(agent.description || "")}</p>
    <div class="agent-meta">
      <div class="meta-block">
        <h4>Model</h4>
        <div>${escapeHtml(agent.model || "inherit / unspecified")}</div>
      </div>
      <div class="meta-block">
        <h4>Bound skills</h4>
        <div>${agent.boundSkills.map((s) => `<code>${escapeHtml(s)}</code>`).join("<br/>") || "<span class='muted'>None listed in bindings table.</span>"}</div>
      </div>
    </div>
    <div class="meta-block" style="margin-bottom:12px">
      <h4>Artifacts</h4>
      <div class="links">
        ${linkButton(agent.artifacts.cursorAgent)}
        ${linkButton(agent.artifacts.copilotAgent)}
        ${linkButton(agent.artifacts.vsCodeAgentPicker)}
        ${linkButton(agent.artifacts.gitHubPrompt)}
      </div>
    </div>
    <div class="insights">
      <div class="meta-block">
        <h4>Capabilities</h4>
        <ul>${agent.insights.capabilities.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>
      </div>
      <div class="meta-block">
        <h4>Weaknesses</h4>
        <ul>${agent.insights.weaknesses.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>
      </div>
      <div class="meta-block">
        <h4>Performance</h4>
        <p class="muted" style="margin:0;font-size:0.88rem">${escapeHtml(agent.insights.performance || "")}</p>
      </div>
      <div class="meta-block">
        <h4>Learnings</h4>
        <ul>${agent.insights.learnings.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>
      </div>
      <div class="meta-block">
        <h4>Suggestions</h4>
        <ul>${agent.insights.suggestions.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>
      </div>
    </div>`;
}

function linkButton(artifact) {
  if (!artifact) return "";
  return `<button type="button" class="linkish" data-open="${encodeURIComponent(artifact.relativePath)}">${escapeHtml(artifact.label)} — ${escapeHtml(artifact.relativePath)}</button>`;
}

async function renderDoc(path) {
  $("detail-empty").hidden = true;
  $("detail-agent").hidden = true;
  const pane = $("detail-doc");
  pane.hidden = false;
  $("doc-title").textContent = path;
  $("doc-render").innerHTML = `<p class="muted">Loading…</p>`;
  const res = await fetch(`/api/raw?path=${encodeURIComponent(path)}`);
  if (!res.ok) {
    $("doc-render").innerHTML = `<p>Could not load document (HTTP ${res.status}).</p>`;
    return;
  }
  const payload = await res.json();
  $("doc-render").innerHTML = marked.parse(payload.content || "");
  $("copy-doc").onclick = async () => {
    await navigator.clipboard.writeText(payload.content || "");
    $("copy-doc").textContent = "Copied";
    setTimeout(() => ($("copy-doc").textContent = "Copy markdown"), 1200);
  };
}

function showEmpty(msg) {
  $("detail-agent").hidden = true;
  $("detail-doc").hidden = true;
  $("detail-empty").hidden = false;
  $("detail-empty").innerHTML = `<h2>Browse</h2><p>${msg || "Select an item from the list."}</p>`;
}

async function routeFromHash() {
  const route = parseHash();
  if (route.type === "agent") {
    await renderAgentDetail(route.id);
    return;
  }
  if (route.type === "doc") {
    await renderDoc(route.path);
    return;
  }
  showEmpty("");
}

function wireTabs() {
  $("main-tabs").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-tab]");
    if (!btn) return;
    for (const b of $("main-tabs").querySelectorAll("button")) b.classList.remove("active");
    btn.classList.add("active");
    state.tab = btn.dataset.tab;
    renderList();
  });

  $("platform-chips").addEventListener("click", (e) => {
    const chip = e.target.closest("button[data-platform]");
    if (!chip) return;
    for (const c of $("platform-chips").querySelectorAll("button")) c.classList.remove("active");
    chip.classList.add("active");
    state.platform = chip.dataset.platform;
    renderList();
  });

  $("filter").addEventListener("input", (e) => {
    state.filter = e.target.value || "";
    renderList();
  });

  $("detail-pane").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-open]");
    if (!btn) return;
    const path = decodeURIComponent(btn.dataset.open);
    setHash(`doc/${encodeURIComponent(path)}`);
  });
}

function wireBot() {
  const panel = $("bot-body");
  $("bot-toggle").addEventListener("click", () => {
    const open = panel.hidden;
    panel.hidden = !open;
    $("bot-toggle").setAttribute("aria-expanded", open ? "true" : "false");
  });

  $("bot-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = $("bot-input").value.trim();
    if (!text) return;
    appendBotMessage(text, true);
    $("bot-input").value = "";
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });
    const payload = await res.json();
    const note = payload.note ? `<div class="muted small">${escapeHtml(payload.note)}</div>` : "";
    appendBotMessage((marked && marked.parse ? marked.parse : (x) => x)(payload.answerMarkdown || "") + note, false);
  });
}

function appendBotMessage(html, isUser) {
  const wrap = $("bot-messages");
  const div = document.createElement("div");
  div.className = `bubble ${isUser ? "user" : ""}`;
  div.innerHTML = isUser ? escapeHtml(html) : html;
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
}

window.addEventListener("hashchange", () => routeFromHash());

window.addEventListener("DOMContentLoaded", async () => {
  wireTabs();
  wireBot();
  try {
    await loadCatalog(false);
    renderList();
    await routeFromHash();
  } catch (err) {
    $("list").innerHTML = `<div class="muted">Failed to load catalog: ${escapeHtml(String(err))}</div>`;
  }
});
