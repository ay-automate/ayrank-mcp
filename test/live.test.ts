// One live READ call per read tool against www.ayrank.com, spaced to stay under
// 30 requests per 60 seconds. Write tools run live in dry-run mode only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { READ_TOOLS } from "../src/tools.js";
import { connect, READ_ARGS, textOf } from "./helpers.js";

const BASE = "https://www.ayrank.com";
const live = { baseUrl: BASE, allowWrites: false, fetch: globalThis.fetch, now: Date.now };

// ayrank_indexnow_key_check uses a made-up key on www.example.com: a 200 answer with
// verdict fail is still a valid live read.
for (const tool of READ_TOOLS) {
  test(`live ${tool.name}`, { timeout: 60_000 }, async () => {
    const client = await connect(live);
    const res = await client.callTool({ name: tool.name, arguments: READ_ARGS[tool.name] });
    const t = textOf(res);
    assert.notEqual(res.isError, true, t.slice(0, 400));
    const data = JSON.parse(t);
    assert.ok(data.poweredBy, `${tool.name}: no poweredBy in ${t.slice(0, 200)}`);
    console.log(`${tool.name}: OK, ${t.length} chars`);
    await client.close();
    await sleep(2500);
  });
}

test("live dry run: request_free_audit and indexnow_submit send nothing", async () => {
  let calls = 0;
  const counting: typeof fetch = (...a) => {
    calls += 1;
    return globalThis.fetch(...a);
  };
  const client = await connect({ ...live, fetch: counting });
  const a = await client.callTool({ name: "ayrank_request_free_audit", arguments: { email: "a@example.com", website: "https://example.com", confirm: true } });
  const s = await client.callTool({ name: "ayrank_indexnow_submit", arguments: { host: "www.example.com", key: "abcdef12345678", urlList: ["https://www.example.com/"], confirm: true } });
  assert.match(textOf(a), /^DRY RUN/);
  assert.match(textOf(s), /^DRY RUN/);
  assert.equal(calls, 0);
  await client.close();
});
