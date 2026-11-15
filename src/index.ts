#!/usr/bin/env node
import { createServer as createHttpServer } from "node:http";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { optionsFromEnv, SERVER_VERSION } from "./config.js";
import { createLimiters, createServer } from "./server.js";

const argv = process.argv.slice(2);

if (argv.includes("--version")) {
  console.log(SERVER_VERSION);
  process.exit(0);
}

const opts = optionsFromEnv();

if (argv.includes("--http")) {
  const i = argv.indexOf("--port");
  const port = i >= 0 ? Number(argv[i + 1]) : 3333;
  const limiters = createLimiters(opts.now);
  // Stateless Streamable HTTP: a fresh server and transport per request, shared limiters.
  const http = createHttpServer(async (req, res) => {
    if (!req.url || !req.url.startsWith("/mcp")) {
      res.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ error: "Use /mcp" }));
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405, { "content-type": "application/json", allow: "POST" }).end(JSON.stringify({ error: "POST only" }));
      return;
    }
    const server = createServer(opts, limiters);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (err) {
      console.error("[ayrank-mcp] request failed:", err);
      if (!res.headersSent) res.writeHead(500).end();
    }
  });
  http.listen(port, "127.0.0.1", () => {
    const addr = http.address();
    const actual = typeof addr === "object" && addr ? addr.port : port;
    console.error(`[ayrank-mcp] Streamable HTTP on http://127.0.0.1:${actual}/mcp`);
  });
} else {
  const server = createServer(opts);
  await server.connect(new StdioServerTransport());
  console.error(`[ayrank-mcp] ${SERVER_VERSION} on stdio, writes ${opts.allowWrites ? "enabled" : "disabled (dry run only)"}`);
}
