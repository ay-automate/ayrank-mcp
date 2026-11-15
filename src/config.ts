import { env as processEnv } from "node:process";

export const SERVER_NAME = "ayrank-mcp";
export const SERVER_VERSION = "0.1.0";

export const DEFAULT_BASE_URL = "https://www.ayrank.com";

/** The API allows 30 requests per 60 seconds per IP, shared across all /api/v1 tools. */
export const READ_LIMIT = { max: 30, windowMs: 60_000 };

/** Each write tool: at most once per 60 seconds and 5 times per server process. */
export const WRITE_LIMIT = { minGapMs: 60_000, maxPerProcess: 5 };

export const WRITE_FLAG = "AYRANK_MCP_ALLOW_WRITES";

export const FREE_AUDIT_NOTICE =
  "creates a lead and notifies the AY Rank team; nothing is emailed to you or anyone else";

export function utm(tool: string): string {
  return `utm_source=ayrank-mcp&utm_medium=mcp&utm_campaign=ayrank-mcp&utm_content=${tool}`;
}

export function withUtm(url: string, tool: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}${utm(tool)}`;
}

export interface Options {
  baseUrl: string;
  allowWrites: boolean;
  fetch: typeof fetch;
  now: () => number;
}

export function optionsFromEnv(env: NodeJS.ProcessEnv = processEnv): Options {
  return {
    baseUrl: (env.AYRANK_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    allowWrites: env[WRITE_FLAG] === "1",
    fetch: globalThis.fetch,
    now: Date.now,
  };
}
