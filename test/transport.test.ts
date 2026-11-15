import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { env } from "node:process";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const entry = fileURLToPath(new URL("../src/index.js", import.meta.url));

test("stdio: the built server lists 21 tools", async () => {
  const transport = new StdioClientTransport({ command: process.execPath, args: [entry], env: { PATH: env.PATH ?? "" } });
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.equal(tools.length, 21);
  await client.close();
});

test("--http: initialize and list tools over Streamable HTTP", async () => {
  const child = spawn(process.execPath, [entry, "--http", "--port", "0"], { stdio: ["ignore", "ignore", "pipe"] });
  try {
    const url = await new Promise<string>((resolve, reject) => {
      let err = "";
      child.stderr.on("data", (d) => {
        err += String(d);
        const m = err.match(/(http:\/\/127\.0\.0\.1:\d+\/mcp)/);
        if (m) resolve(m[1]);
      });
      child.on("exit", (code) => reject(new Error(`server exited ${code}: ${err}`)));
      setTimeout(() => reject(new Error(`no listen line: ${err}`)), 10_000);
    });
    const client = new Client({ name: "test", version: "0.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(url)));
    const { tools } = await client.listTools();
    assert.equal(tools.length, 21);
    const dry = await client.callTool({ name: "ayrank_request_free_audit", arguments: { email: "a@example.com", website: "https://example.com" } });
    assert.match(JSON.stringify(dry), /DRY RUN/);
    await client.close();
  } finally {
    child.kill();
  }
});
