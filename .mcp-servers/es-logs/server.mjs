#!/usr/bin/env node
/**
 * Minimal Elasticsearch MCP Server
 * Uses raw fetch — no @elastic/elasticsearch client, no product check, no license check.
 * Compatible with ES 7.x Basic license.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const ES_URL = (process.env.ES_URL ?? "http://172.31.66.65:9200").replace(/\/$/, "");

const server = new Server(
  { name: "es-logs", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// ── Tool definitions ──────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "es_search",
      description:
        "Search Elasticsearch indices using Query DSL. Primary tool for querying production logs " +
        "in cis-* (CIS), cns-* (CNS publisher), cnsrcv-* (CNS receiver) index patterns.",
      inputSchema: {
        type: "object",
        properties: {
          index: {
            type: "string",
            description:
              "Index pattern to search. Examples: 'cis-*', 'cns-*', 'cnsrcv-*', 'cis-*,cns-*'",
          },
          queryBody: {
            type: "object",
            description:
              "Complete Elasticsearch Query DSL object. Can include: query, sort, size, from, aggs, _source, highlight.",
          },
        },
        required: ["index", "queryBody"],
      },
    },
    {
      name: "list_indices",
      description: "List Elasticsearch indices matching an optional pattern, with doc counts and sizes.",
      inputSchema: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "Index pattern (default '*'). E.g. 'cis-*' to list only CIS indices.",
          },
        },
      },
    },
    {
      name: "es_api",
      description: "Execute any Elasticsearch REST API call directly.",
      inputSchema: {
        type: "object",
        properties: {
          method: {
            type: "string",
            enum: ["GET", "POST", "PUT", "DELETE"],
            description: "HTTP method",
          },
          path: {
            type: "string",
            description:
              "API path without leading slash. E.g. '_cluster/health', 'cis-*/_search', '_cat/indices?format=json'",
          },
          body: {
            type: "object",
            description: "Optional request body (JSON).",
          },
        },
        required: ["method", "path"],
      },
    },
  ],
}));

// ── Tool handlers ─────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // ── es_search ──────────────────────────────────────────────────────────────
    if (name === "es_search") {
      const { index, queryBody } = args;
      const url = `${ES_URL}/${encodeURIComponent(index)}/_search`;

      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(queryBody),
        signal: AbortSignal.timeout(30_000),
      });

      const data = await resp.json();

      if (!resp.ok) {
        return {
          content: [{ type: "text", text: `ES error ${resp.status}:\n${JSON.stringify(data, null, 2)}` }],
          isError: true,
        };
      }

      const hits = data.hits?.hits ?? [];
      const total =
        typeof data.hits?.total === "object"
          ? data.hits.total.value
          : (data.hits?.total ?? 0);

      let out = `Total hits: ${total} | Showing: ${hits.length}\n\n`;

      for (let i = 0; i < hits.length; i++) {
        const h = hits[i];
        out += `─── [${i + 1}] ${h._index} ───\n`;
        out += JSON.stringify(h._source ?? {}, null, 2);
        out += "\n\n";
      }

      if (data.aggregations) {
        out += `─── Aggregations ───\n${JSON.stringify(data.aggregations, null, 2)}\n`;
      }

      return { content: [{ type: "text", text: out }] };
    }

    // ── list_indices ───────────────────────────────────────────────────────────
    if (name === "list_indices") {
      const pattern = args?.pattern ?? "*";
      const url =
        `${ES_URL}/_cat/indices/${encodeURIComponent(pattern)}` +
        `?h=index,docs.count,store.size,health&s=index&format=json`;

      const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      const data = await resp.json();

      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }

    // ── es_api ─────────────────────────────────────────────────────────────────
    if (name === "es_api") {
      const { method, path, body } = args;
      const url = `${ES_URL}/${path.replace(/^\//, "")}`;

      const resp = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30_000),
      });

      const data = await resp.json();
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }

    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error: ${err.message}` }],
      isError: true,
    };
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
