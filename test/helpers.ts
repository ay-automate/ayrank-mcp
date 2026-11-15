import { createServer as createHttp, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "../src/server.js";
import type { Options } from "../src/config.js";

export interface Recorded {
  method: string;
  path: string;
  query: Record<string, string>;
  body: unknown;
  headers: IncomingMessage["headers"];
}

/** A local stand-in for www.ayrank.com that records every request. */
export async function startStub(): Promise<{ url: string; requests: Recorded[]; close: () => Promise<void> }> {
  const requests: Recorded[] = [];
  const server: Server = createHttp(async (req, res) => {
    const u = new URL(req.url ?? "/", "http://stub");
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : undefined;
    requests.push({ method: req.method ?? "", path: u.pathname, query: Object.fromEntries(u.searchParams), body, headers: req.headers });
    const json = (status: number, data: unknown, extra: Record<string, string> = {}) => {
      res.writeHead(status, { "content-type": "application/json", ...extra });
      res.end(JSON.stringify(data));
    };
    if (u.searchParams.get("title") === "RATE") return json(429, { error: "Too many requests" }, { "retry-after": "42" });
    if (u.searchParams.get("url") === "https://bad.example/") return json(400, { error: "Blocked URL" });
    if (req.method === "POST" && u.pathname === "/api/lead") return json(201, { success: true });
    if (req.method === "POST" && u.pathname === "/api/v1/indexnow-checker/submit") return json(200, { submitted: true, response: { status: 202, meaning: "Accepted" } });
    if (req.method === "GET" && u.pathname.startsWith("/api/v1/")) {
      return json(200, { stub: true, path: u.pathname, query: Object.fromEntries(u.searchParams), poweredBy: { name: "AY Rank" } });
    }
    return json(404, { error: "not found" });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

export async function connect(opts: Options): Promise<Client> {
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const server = createServer(opts);
  await server.connect(serverT);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientT);
  return client;
}

export function textOf(r: unknown): string {
  const res = r as CallToolResult;
  return res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
}

/** Minimal valid arguments for every read tool. */
export const READ_ARGS: Record<string, Record<string, unknown>> = {
  ayrank_ai_crawler_access: { domain: "ayrank.com" },
  ayrank_robots_txt_test: { url: "https://www.ayrank.com/blog", userAgent: "GPTBot" },
  ayrank_ai_training_grounding: { url: "https://www.ayrank.com/" },
  ayrank_ai_crawler_ip_ranges: {},
  ayrank_ai_overview_eligibility: { url: "https://www.ayrank.com/" },
  ayrank_sitemap_validate: { url: "https://www.ayrank.com/sitemap.xml" },
  ayrank_hreflang_check: { url: "https://www.ayrank.com/" },
  ayrank_http_headers: { url: "https://www.ayrank.com/" },
  ayrank_page_size: { url: "https://www.ayrank.com/" },
  ayrank_heading_outline: { url: "https://www.ayrank.com/" },
  ayrank_alt_text: { url: "https://www.ayrank.com/" },
  ayrank_internal_links: { url: "https://www.ayrank.com/" },
  ayrank_broken_links: { url: "https://www.ayrank.com/tools" },
  ayrank_eeat_signals: { url: "https://www.ayrank.com/blog" },
  ayrank_indexnow_key_check: { host: "www.example.com", key: "abcdef12345678" },
  ayrank_title_score: { title: "Best GEO agencies in 2026, compared" },
  ayrank_llms_txt_generate: { companyName: "Example Co", websiteUrl: "https://www.example.com", description: "Example Co makes examples." },
  ayrank_robots_txt_generate: { block: "GPTBot,ClaudeBot", sitemapUrl: "https://www.example.com/sitemap.xml" },
};
