# Plan: AY Rank MCP server

An MCP server that wraps the free AY Rank tools API (https://www.ayrank.com/openapi.json, "AY Rank Free Tools API" 1.0.0). No key. The API allows 30 requests per 60 seconds per IP, shared across all /api/v1 tools.

Rule for this repo: wrap only what exists in that openapi.json, and never describe a capability the product does not have.

## Tools

One tool per job. All read tools call GET with query parameters. Every tool description says when to use it and when not to.

| # | Tool | Endpoint | Kind |
|---|------|----------|------|
| 1 | `ayrank_ai_crawler_access` | GET /api/v1/ai-crawler-access-checker (domain) | read |
| 2 | `ayrank_robots_txt_test` | GET /api/v1/robots-txt-tester (url, userAgent) | read |
| 3 | `ayrank_ai_training_grounding` | GET /api/v1/ai-training-grounding-checker (url) | read |
| 4 | `ayrank_ai_crawler_ip_ranges` | GET /api/v1/ai-crawler-ip-ranges (no params) | read |
| 5 | `ayrank_ai_overview_eligibility` | GET /api/v1/ai-overview-eligibility-checker (url) | read |
| 6 | `ayrank_sitemap_validate` | GET /api/v1/sitemap-validator (url) | read |
| 7 | `ayrank_hreflang_check` | GET /api/v1/hreflang-checker (url) | read |
| 8 | `ayrank_http_headers` | GET /api/v1/http-header-checker (url) | read |
| 9 | `ayrank_page_size` | GET /api/v1/page-size-checker (url) | read |
| 10 | `ayrank_heading_outline` | GET /api/v1/heading-outline-checker (url) | read |
| 11 | `ayrank_alt_text` | GET /api/v1/alt-text-checker (url) | read |
| 12 | `ayrank_internal_links` | GET /api/v1/internal-link-checker (url) | read |
| 13 | `ayrank_broken_links` | GET /api/v1/broken-link-checker (url) | read (the API sends one GET to each of up to 100 links on the page) |
| 14 | `ayrank_eeat_signals` | GET /api/v1/eeat-checker (url) | read |
| 15 | `ayrank_indexnow_key_check` | GET /api/v1/indexnow-checker (host, key, keyLocation) | read |
| 16 | `ayrank_title_score` | GET /api/v1/title-scorer (title) | read |
| 17 | `ayrank_llms_txt_generate` | GET /api/v1/llms-txt-generator (companyName, websiteUrl, optional fields) | read (returns text, writes nothing) |
| 18 | `ayrank_robots_txt_generate` | GET /api/v1/robots-txt-generator (block, blockedDirs, sitemapUrl) | read (returns text, writes nothing) |
| 19 | `ayrank_tracking_info` | none, static answer | read |
| 20 | `ayrank_indexnow_submit` | POST /api/v1/indexnow-checker/submit (host, key, keyLocation, urlList) | write, gated |
| 21 | `ayrank_request_free_audit` | POST /api/lead with source `mcp` | write, gated |

The API also accepts POST with a JSON body for every read tool. The server uses GET only for reads.

### Tracking

The free API does not ask any AI assistant anything, and the AI Visibility Checker is a readiness audit, not a citation tracker. Daily tracking of whether ChatGPT and other engines name a brand lives in the paid AY Rank app (app.ayrank.com). I checked: the app has no public REST API for it. It has its own MCP server at https://app.ayrank.com/api/mcp that needs a per-workspace key from a paid account (setup at https://app.ayrank.com/docs/skills).

So this server does not track. `ayrank_tracking_info` makes no network call and returns:

- what the free tools do and do not do,
- the free check at app.ayrank.com (browser only, 3 buyer questions, one assistant, no live web search, no API),
- the paid app (daily tracking with live search, 7-day free trial) with a signup link carrying UTM tags,
- the `claude mcp add` command for the app's own MCP server, for people who already have a key.

The README says the same. Because the app's server is usually added as `ayrank`, this one installs as `ayrank-tools` to avoid a name clash.

UTM on every link this server returns: `utm_source=ayrank-mcp&utm_medium=mcp&utm_campaign=ayrank-mcp&utm_content=<tool name>`.

## Write gate

Two tools change something outside the agent: `ayrank_request_free_audit` and `ayrank_indexnow_submit`.

1. A write runs only when the call passes `confirm: true` AND the server process has the environment variable `AYRANK_MCP_ALLOW_WRITES=1`.
2. Otherwise the tool makes no network call and returns a dry-run preview: the method, the URL, the exact JSON body it would send, what the server does with it, and which of the two conditions is missing.
3. Client-side rate limit: each write tool runs at most once per 60 seconds and at most 5 times per server process. Reads share one limiter of 30 calls per 60 seconds, the same as the API, and a call over the limit returns the wait time instead of hitting the API. A 429 from the API is passed back with its Retry-After.
4. Money: every endpoint is free, so no tool can spend money and none takes `max_cost`. A paid tool would only be added with a required `max_cost` that it refuses to run without.
5. Email: `ayrank_request_free_audit` creates a lead and notifies the AY Rank team; nothing is emailed to you or anyone else. The other tools send no email.

What each write does on the server:

- `ayrank_request_free_audit` posts `{ email, url, name?, notes?, buyer_questions? (up to 3, 200 characters each), source: "mcp", cta_id: "mcp", utm_source: "ayrank-mcp", utm_medium: "mcp", utm_campaign: "ayrank-mcp" }`. It creates a lead and notifies the AY Rank team; nothing is emailed to you or anyone else. Source and cta_id `mcp` match no lead magnet, so the route sends no automatic email to the requester. A person from the team follows up within 24 hours, as the website form promises. The tool does not run the audit itself. The route also limits each IP to 5 requests per minute.
- `ayrank_indexnow_submit` sends up to 100 URLs on a host the caller controls to api.indexnow.org, after the API re-checks the key file on that host.

Decision (CoS, 15 Nov 2026): both write tools stay, behind this gate. No live write call in tests: the dry run and the stub prove them.

## Versions

Exact pins in package.json, plus a package-lock.json made with `npm install` and installed with `npm ci` after that. Each direct package was checked with pin-guard verify on 15 Nov 2026.

| Package | Version | Published | pin-guard |
|---------|---------|-----------|-----------|
| @modelcontextprotocol/sdk | 1.32.2 | 2026-10-23 | PASS |
| zod | 4.6.7 | 2026-10-12 | PASS with a single-maintainer warning (the SDK needs zod) |
| typescript (dev) | 5.9.3 | 2025-09-30 | PASS |
| @types/node (dev) | 22.20.5 | 2026-10-01 | PASS with a single-maintainer warning |

No other direct dependencies. Tests use the built-in `node:test`. Node 20 or newer.

## Transport

- stdio, the default.
- Streamable HTTP with `--http`, stateless, bound to 127.0.0.1 (port from `--port`, default 3333). It uses the SDK's own StreamableHTTPServerTransport on `node:http`, about 40 lines. If it turns out to need more than that, it gets dropped and the PR says so.

## Install (README)

The package is not published to npm. Install from a clone of this repo at tag v0.1.0 and a local build (`npm ci`, `npm run build`), then point the client at `node /path/to/ayrank-mcp/dist/src/index.js`. The repo's .npmrc sets ignore-scripts, so a `github:` npx install would not build; the README does not offer it.

- Claude Code: `claude mcp add ayrank-tools -- node /path/to/ayrank-mcp/dist/src/index.js`
- Claude Desktop: the `mcpServers` JSON block with the same command and args.
- Cursor: `.cursor/mcp.json` with the same block.

Writes stay off unless `AYRANK_MCP_ALLOW_WRITES=1` sits in the server's environment.

## Registry manifests

- `server.json` for this repo, name `io.github.ay-automate/ayrank-mcp`, checked against the current schema fetched from the modelcontextprotocol/registry repo at build time. The registry checks a package it can fetch (npm and the like) or a remote URL. Nothing gets published here, so the PR will list the exact publish steps (npm publish with `mcpName` in package.json, then `mcp-publisher publish`) for a human to run.
- ayrank-skills is not an MCP server. If the registry only lists servers, it gets no server.json, and its existing `.claude-plugin/marketplace.json` stays the right metadata.

## Tests

All installs, builds and tests run on a clean Linux build machine, not on a laptop.

1. Stub tests. A local `node:http` stub serves /api/v1/* and /api/lead and records each request. The SDK client talks to the server over the in-memory transport.
   - tools/list returns all 21 tools with input schemas.
   - Each read tool hits the right path with the right query parameters and returns the stub's JSON.
   - A 429 from the stub comes back as a rate-limit message with the wait time.
   - The read limiter refuses call 31 inside 60 seconds without a request.
   - Each write tool returns a dry run, with no request, when confirm is missing, when the environment flag is missing, and when both are missing.
   - With both conditions met, each write tool sends one request with the expected body (`source: "mcp"`, only fields the lead route allows), and a second call inside 60 seconds is refused.
   - `ayrank_tracking_info` makes no request and returns the UTM links.
2. Live tests against www.ayrank.com, run once. One GET per read tool (18 calls, about 3 seconds apart, under the 30 per 60 seconds limit), checking HTTP 200 and the `poweredBy` field. The two write tools run live in dry-run mode only. No real lead, no real IndexNow submit.
3. Transport tests. Spawn the built server over stdio and list tools. Start `--http` on a free port, initialize and list tools.

Done means: tsc with 0 errors, all tests green, README install commands tested, leak scan clean, server.json valid against the fetched schema.
