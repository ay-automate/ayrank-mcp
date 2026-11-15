import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { FREE_AUDIT_NOTICE, SERVER_NAME, SERVER_VERSION, WRITE_FLAG, withUtm, type Options } from "./config.js";
import { ReadLimiter, WriteLimiter } from "./limits.js";
import { READ_TOOLS, USER_AGENT } from "./tools.js";

const TIMEOUT_MS = 40_000;

function text(body: string, isError = false): CallToolResult {
  return { content: [{ type: "text", text: body }], ...(isError ? { isError: true } : {}) };
}

async function readJson(res: Response): Promise<unknown> {
  const raw = await res.text();
  try {
    return JSON.parse(raw);
  } catch {
    return { nonJsonBody: raw.slice(0, 500) };
  }
}

/** Maps an HTTP answer from the AY Rank API to a tool result. */
async function toResult(res: Response): Promise<CallToolResult> {
  const body = await readJson(res);
  if (res.status === 429) {
    const retry = res.headers.get("retry-after") ?? res.headers.get("x-ratelimit-reset") ?? "60";
    return text(`Rate limited by the AY Rank API (30 requests per 60 seconds per IP). Retry after ${retry} s. ${JSON.stringify(body)}`, true);
  }
  if (!res.ok) {
    return text(`AY Rank API answered HTTP ${res.status}: ${JSON.stringify(body)}`, true);
  }
  return text(JSON.stringify(body));
}

function networkError(err: unknown): CallToolResult {
  const msg = err instanceof Error ? err.message : String(err);
  return text(`Could not reach the AY Rank API: ${msg}`, true);
}

function gateMissing(confirm: boolean | undefined, allowWrites: boolean): string[] {
  const missing: string[] = [];
  if (confirm !== true) missing.push("the call did not pass confirm: true");
  if (!allowWrites) missing.push(`the server was not started with ${WRITE_FLAG}=1`);
  return missing;
}

function dryRun(tool: string, method: string, url: string, body: unknown, effect: string, missing: string[]): CallToolResult {
  return text(
    [
      `DRY RUN. Nothing was sent, because ${missing.join(" and ")}.`,
      `${tool} would send:`,
      `${method} ${url}`,
      JSON.stringify(body, null, 2),
      `Effect: ${effect}`,
      `To send it for real, the server needs ${WRITE_FLAG}=1 in its environment and the call needs confirm: true.`,
    ].join("\n"),
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface Limiters {
  read: ReadLimiter;
  audit: WriteLimiter;
  indexNow: WriteLimiter;
}

/** Limiters live outside the server so HTTP mode, which builds a server per request, still shares them. */
export function createLimiters(now: () => number): Limiters {
  return { read: new ReadLimiter(now), audit: new WriteLimiter(now), indexNow: new WriteLimiter(now) };
}

export function createServer(opts: Options, limiters: Limiters = createLimiters(opts.now)): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  const readLimiter = limiters.read;
  const auditLimiter = limiters.audit;
  const indexNowLimiter = limiters.indexNow;

  for (const tool of READ_TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.input,
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async (args: Record<string, unknown>): Promise<CallToolResult> => {
        const wait = readLimiter.take();
        if (wait > 0) {
          return text(`Rate limit: this server keeps to the API's 30 requests per 60 seconds. Try again in ${wait} s.`, true);
        }
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries(args ?? {})) {
          if (typeof v === "string" && v !== "") qs.set(k, v);
        }
        const q = qs.toString();
        try {
          const res = await opts.fetch(`${opts.baseUrl}${tool.path}${q ? `?${q}` : ""}`, {
            headers: { accept: "application/json", "user-agent": USER_AGENT },
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
          return await toResult(res);
        } catch (err) {
          return networkError(err);
        }
      },
    );
  }

  server.registerTool(
    "ayrank_tracking_info",
    {
      title: "AI answer tracking: what exists",
      description:
        "Use when someone asks to track whether ChatGPT, Perplexity, Gemini, Claude or Google AI answers name or cite a brand. This server cannot do that: the free AY Rank API never asks any AI assistant anything. This tool returns where tracking does exist (the paid AY Rank app and its own MCP server) and the free one-off check. Makes no network call.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (): Promise<CallToolResult> => {
      const t = "ayrank_tracking_info";
      return text(
        [
          "What this server can and cannot do:",
          "- It wraps the free AY Rank tools API. Those tools read your pages, robots.txt, headers and sitemaps. None of them asks an AI assistant anything, so this server does not track whether AI answers name or cite you.",
          "",
          "Free one-off check (browser only, no API):",
          `- ${withUtm("https://app.ayrank.com/tools/ai-visibility-checker", t)}`,
          "- It reads your site, writes 3 buyer questions and asks one AI assistant from what it knows, with no live web search. It shows Named or Not named, the position and the brands named instead. A few checks a day, no sign-up.",
          "",
          "Daily tracking (paid AY Rank app, 7-day free trial):",
          `- Sign up: ${withUtm("https://app.ayrank.com/?start=signup", t)}`,
          "- It asks ChatGPT and other engines your buyer questions every day with live search and tracks named, position, share of voice and the sources each answer read.",
          "- The app has its own MCP server for this, with a key from your workspace (Settings, Agent and API access):",
          '  claude mcp add --transport http ayrank https://app.ayrank.com/api/mcp --header "Authorization: Bearer <your ayr_key>"',
          `- Set-up guide: ${withUtm("https://app.ayrank.com/docs/skills", t)}`,
        ].join("\n"),
      );
    },
  );

  server.registerTool(
    "ayrank_request_free_audit",
    {
      title: "Request a free AI visibility audit",
      description:
        `Use only when the user asks for the free AY Rank AI visibility audit and gives their own email and website. It ${FREE_AUDIT_NOTICE}. A person from the AY Rank team follows up within 24 hours; this tool does not run the audit itself. Gated: without confirm: true and ${WRITE_FLAG}=1 on the server it returns a dry run and sends nothing. At most once per 60 seconds. Never call it with an email the user did not give you.`,
      inputSchema: {
        email: z.string().min(3).max(254).describe("The requester's own work email."),
        website: z.string().min(1).max(500).describe("The site to audit, like https://example.com."),
        name: z.string().max(200).optional().describe("The requester's name."),
        buyer_questions: z
          .array(z.string().max(200))
          .max(3)
          .optional()
          .describe("Up to 3 questions a buyer would ask ChatGPT, Perplexity or Google about this market, 200 characters each."),
        notes: z.string().max(1500).optional().describe("Anything else the team should know."),
        confirm: z.boolean().optional().describe("Must be true to send. Leave out to get a dry run."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args): Promise<CallToolResult> => {
      const email = args.email.trim().toLowerCase();
      if (!EMAIL_RE.test(email)) return text("That email does not look valid.", true);
      const questions = (args.buyer_questions ?? []).map((q) => q.trim()).filter(Boolean);
      const note = "Free AI visibility audit request from the AY Rank MCP server";
      const body: Record<string, unknown> = {
        email,
        url: args.website.trim(),
        ...(args.name?.trim() ? { name: args.name.trim() } : {}),
        notes: args.notes?.trim() ? `${note}\n${args.notes.trim()}` : note,
        ...(questions.length ? { buyer_questions: questions } : {}),
        source: "mcp",
        cta_id: "mcp",
        utm_source: "ayrank-mcp",
        utm_medium: "mcp",
        utm_campaign: "ayrank-mcp",
      };
      const endpoint = `${opts.baseUrl}/api/lead`;
      const effect = `It ${FREE_AUDIT_NOTICE}. A person from the AY Rank team follows up within 24 hours.`;
      const missing = gateMissing(args.confirm, opts.allowWrites);
      if (missing.length) return dryRun("ayrank_request_free_audit", "POST", endpoint, body, effect, missing);
      const blocked = auditLimiter.take();
      if (blocked) return text(blocked, true);
      try {
        const res = await opts.fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json", "user-agent": USER_AGENT },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (res.ok) {
          return text(`Sent. The request ${FREE_AUDIT_NOTICE}. A person from the AY Rank team follows up within 24 hours.`);
        }
        return await toResult(res);
      } catch (err) {
        return networkError(err);
      }
    },
  );

  server.registerTool(
    "ayrank_indexnow_submit",
    {
      title: "Submit URLs to IndexNow",
      description:
        `Use to submit up to 100 URLs on a host you control to IndexNow (step 2, after ayrank_indexnow_key_check passes). The AY Rank API checks the URLs and re-checks the key file, then posts them to api.indexnow.org, which shares them with the search engines that take part in IndexNow. Gated: without confirm: true and ${WRITE_FLAG}=1 on the server it returns a dry run and sends nothing. At most once per 60 seconds. Not for sites you do not control.`,
      inputSchema: {
        host: z.string().min(1).max(300).describe("The host, like www.example.com."),
        key: z.string().min(8).max(128).describe("The IndexNow key whose key file is live on the host."),
        keyLocation: z.string().max(2000).optional().describe("The key file URL when it is not at the root, on the same host."),
        urlList: z.array(z.string().max(2000)).min(1).max(100).describe("URLs on the host, at most 100."),
        confirm: z.boolean().optional().describe("Must be true to send. Leave out to get a dry run."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args): Promise<CallToolResult> => {
      const body: Record<string, unknown> = {
        host: args.host.trim(),
        key: args.key.trim(),
        ...(args.keyLocation?.trim() ? { keyLocation: args.keyLocation.trim() } : {}),
        urlList: args.urlList,
      };
      const endpoint = `${opts.baseUrl}/api/v1/indexnow-checker/submit`;
      const effect =
        "The AY Rank API checks the URLs, re-checks the key file on the host, and only if it passes posts the URLs to api.indexnow.org.";
      const missing = gateMissing(args.confirm, opts.allowWrites);
      if (missing.length) return dryRun("ayrank_indexnow_submit", "POST", endpoint, body, effect, missing);
      const blocked = indexNowLimiter.take();
      if (blocked) return text(blocked, true);
      try {
        const res = await opts.fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json", "user-agent": USER_AGENT },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        return await toResult(res);
      } catch (err) {
        return networkError(err);
      }
    },
  );

  return server;
}
