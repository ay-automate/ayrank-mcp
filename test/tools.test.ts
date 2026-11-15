import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { READ_TOOLS } from "../src/tools.js";
import { FREE_AUDIT_NOTICE } from "../src/config.js";
import { connect, READ_ARGS, startStub, textOf } from "./helpers.js";

let stub: Awaited<ReturnType<typeof startStub>>;
before(async () => {
  stub = await startStub();
});
after(async () => {
  await stub.close();
});

function opts(allowWrites: boolean, clock = { t: 1_000_000 }) {
  return { baseUrl: stub.url, allowWrites, fetch: globalThis.fetch, now: () => clock.t };
}

const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

const LEAD_FIELDS = new Set([
  "email", "name", "url", "source", "notes", "cta_id", "variant", "cta_page", "cta_position", "company_size",
  "buyer_questions", "booking_start", "utm_source", "utm_medium", "utm_campaign", "landing_page", "referrer",
]);

test("tools/list returns all 21 tools with schemas and descriptions", async () => {
  const client = await connect(opts(false));
  const { tools } = await client.listTools();
  assert.equal(tools.length, 21);
  const names = tools.map((t) => t.name).sort();
  const expected = [...READ_TOOLS.map((t) => t.name), "ayrank_tracking_info", "ayrank_request_free_audit", "ayrank_indexnow_submit"].sort();
  assert.deepEqual(names, expected);
  for (const t of tools) {
    assert.equal(t.inputSchema.type, "object", t.name);
    assert.ok((t.description ?? "").length > 60, t.name);
    assert.ok(!DASHES.test(t.description ?? ""), `${t.name} has a dash`);
  }
  const audit = tools.find((t) => t.name === "ayrank_request_free_audit");
  assert.ok(audit?.description?.includes(FREE_AUDIT_NOTICE));
  assert.equal(tools.find((t) => t.name === "ayrank_title_score")?.annotations?.readOnlyHint, true);
  await client.close();
});

for (const tool of READ_TOOLS) {
  test(`${tool.name} calls GET ${tool.path} with its arguments`, async () => {
    const client = await connect(opts(false));
    const before = stub.requests.length;
    const args = READ_ARGS[tool.name];
    assert.ok(args, `no test args for ${tool.name}`);
    const res = await client.callTool({ name: tool.name, arguments: args });
    assert.notEqual(res.isError, true, textOf(res));
    assert.equal(stub.requests.length, before + 1);
    const req = stub.requests.at(-1)!;
    assert.equal(req.method, "GET");
    assert.equal(req.path, tool.path);
    assert.deepEqual(req.query, Object.fromEntries(Object.entries(args).map(([k, v]) => [k, String(v)])));
    assert.match(String(req.headers["user-agent"]), /^ayrank-mcp\//);
    const data = JSON.parse(textOf(res));
    assert.equal(data.path, tool.path);
    await client.close();
  });
}

test("a 429 from the API comes back as an error with the wait time", async () => {
  const client = await connect(opts(false));
  const res = await client.callTool({ name: "ayrank_title_score", arguments: { title: "RATE" } });
  assert.equal(res.isError, true);
  assert.match(textOf(res), /Retry after 42 s/);
  await client.close();
});

test("a 400 from the API comes back as an error with the API's message", async () => {
  const client = await connect(opts(false));
  const res = await client.callTool({ name: "ayrank_page_size", arguments: { url: "https://bad.example/" } });
  assert.equal(res.isError, true);
  assert.match(textOf(res), /HTTP 400.*Blocked URL/);
  await client.close();
});

test("read limiter refuses call 31 inside 60 seconds without a request, then recovers", async () => {
  const clock = { t: 5_000_000 };
  const client = await connect(opts(false, clock));
  for (let i = 0; i < 30; i++) {
    const r = await client.callTool({ name: "ayrank_title_score", arguments: { title: `t${i}` } });
    assert.notEqual(r.isError, true);
  }
  const before = stub.requests.length;
  const r31 = await client.callTool({ name: "ayrank_title_score", arguments: { title: "t31" } });
  assert.equal(r31.isError, true);
  assert.match(textOf(r31), /Try again in 60 s/);
  assert.equal(stub.requests.length, before);
  clock.t += 60_000;
  const r32 = await client.callTool({ name: "ayrank_title_score", arguments: { title: "t32" } });
  assert.notEqual(r32.isError, true);
  await client.close();
});

test("ayrank_tracking_info makes no request and returns UTM links", async () => {
  const client = await connect(opts(false));
  const before = stub.requests.length;
  const res = await client.callTool({ name: "ayrank_tracking_info", arguments: {} });
  const t = textOf(res);
  assert.equal(stub.requests.length, before);
  assert.match(t, /does not track/);
  assert.match(t, /app\.ayrank\.com\/\?start=signup&utm_source=ayrank-mcp&utm_medium=mcp&utm_campaign=ayrank-mcp&utm_content=ayrank_tracking_info/);
  assert.match(t, /no live web search/);
  await client.close();
});

const AUDIT = {
  email: "Owner@Example.com",
  website: "https://www.example.com",
  name: "Sam",
  buyer_questions: ["best example tool for teams", "  ", "example vs rival"],
};
const SUBMIT = { host: "www.example.com", key: "abcdef12345678", urlList: ["https://www.example.com/a"] };

for (const [label, allow, confirm] of [
  ["confirm missing", true, undefined],
  ["env flag missing", false, true],
  ["both missing", false, undefined],
] as const) {
  test(`write tools return a dry run and send nothing when ${label}`, async () => {
    const client = await connect(opts(allow));
    const before = stub.requests.length;
    const extra = confirm === undefined ? {} : { confirm };
    const a = textOf(await client.callTool({ name: "ayrank_request_free_audit", arguments: { ...AUDIT, ...extra } }));
    const s = textOf(await client.callTool({ name: "ayrank_indexnow_submit", arguments: { ...SUBMIT, ...extra } }));
    assert.equal(stub.requests.length, before);
    for (const t of [a, s]) {
      assert.match(t, /^DRY RUN\. Nothing was sent/);
      if (confirm === undefined) assert.match(t, /did not pass confirm: true/);
      if (!allow) assert.match(t, /AYRANK_MCP_ALLOW_WRITES=1/);
    }
    assert.ok(a.includes(FREE_AUDIT_NOTICE));
    assert.match(a, /"source": "mcp"/);
    assert.match(a, /POST .*\/api\/lead/);
    assert.match(s, /POST .*\/api\/v1\/indexnow-checker\/submit/);
    await client.close();
  });
}

test("request_free_audit with both gates sends one POST with source mcp and only allowed fields", async () => {
  const clock = { t: 9_000_000 };
  const client = await connect(opts(true, clock));
  const before = stub.requests.length;
  const res = await client.callTool({ name: "ayrank_request_free_audit", arguments: { ...AUDIT, confirm: true } });
  assert.notEqual(res.isError, true, textOf(res));
  assert.ok(textOf(res).includes(FREE_AUDIT_NOTICE));
  assert.equal(stub.requests.length, before + 1);
  const req = stub.requests.at(-1)!;
  assert.equal(req.method, "POST");
  assert.equal(req.path, "/api/lead");
  const body = req.body as Record<string, unknown>;
  for (const k of Object.keys(body)) assert.ok(LEAD_FIELDS.has(k), `field ${k} is not accepted by /api/lead`);
  assert.equal(body.source, "mcp");
  assert.equal(body.cta_id, "mcp");
  assert.equal(body.email, "owner@example.com");
  assert.equal(body.url, "https://www.example.com");
  assert.deepEqual(body.buyer_questions, ["best example tool for teams", "example vs rival"]);
  assert.equal(body.utm_source, "ayrank-mcp");

  const again = await client.callTool({ name: "ayrank_request_free_audit", arguments: { ...AUDIT, confirm: true } });
  assert.equal(again.isError, true);
  assert.match(textOf(again), /once per 60 seconds/);
  assert.equal(stub.requests.length, before + 1);

  for (let i = 0; i < 4; i++) {
    clock.t += 60_000;
    const r = await client.callTool({ name: "ayrank_request_free_audit", arguments: { ...AUDIT, confirm: true } });
    assert.notEqual(r.isError, true);
  }
  clock.t += 60_000;
  const sixth = await client.callTool({ name: "ayrank_request_free_audit", arguments: { ...AUDIT, confirm: true } });
  assert.equal(sixth.isError, true);
  assert.match(textOf(sixth), /already ran 5 times/);
  await client.close();
});

test("request_free_audit rejects a bad email and more than 3 questions without a request", async () => {
  const client = await connect(opts(true));
  const before = stub.requests.length;
  const bad = await client.callTool({ name: "ayrank_request_free_audit", arguments: { ...AUDIT, email: "nope", confirm: true } });
  assert.equal(bad.isError, true);
  const many = await client.callTool({ name: "ayrank_request_free_audit", arguments: { ...AUDIT, buyer_questions: ["a", "b", "c", "d"], confirm: true } });
  assert.equal(many.isError, true);
  assert.equal(stub.requests.length, before);
  await client.close();
});

test("indexnow_submit with both gates sends one POST, then refuses a second inside 60 seconds", async () => {
  const client = await connect(opts(true));
  const before = stub.requests.length;
  const res = await client.callTool({ name: "ayrank_indexnow_submit", arguments: { ...SUBMIT, confirm: true } });
  assert.notEqual(res.isError, true, textOf(res));
  assert.equal(JSON.parse(textOf(res)).submitted, true);
  const req = stub.requests.at(-1)!;
  assert.equal(req.method, "POST");
  assert.equal(req.path, "/api/v1/indexnow-checker/submit");
  assert.deepEqual(req.body, { host: "www.example.com", key: "abcdef12345678", urlList: ["https://www.example.com/a"] });
  const again = await client.callTool({ name: "ayrank_indexnow_submit", arguments: { ...SUBMIT, confirm: true } });
  assert.equal(again.isError, true);
  assert.equal(stub.requests.length, before + 1);
  await client.close();
});
