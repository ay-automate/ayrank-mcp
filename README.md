# ayrank-mcp

An MCP server for the free [AY Rank tools API](https://www.ayrank.com/openapi.json). It gives an AI agent the same checks as https://www.ayrank.com/tools: AI crawler access, robots.txt tests, sitemap and hreflang validation, response headers, page size, headings, alt text, internal and broken links, trust signals, IndexNow and AI Overview eligibility. No API key.

The API allows 30 requests per 60 seconds per IP across all tools. The server keeps to that limit on its side too.

## Tools

18 read tools, each one a GET on one endpoint of the API:

| Tool | What it does | Endpoint |
|------|--------------|----------|
| `ayrank_ai_crawler_access` | Can GPTBot, ClaudeBot, PerplexityBot and Google-Extended crawl the homepage | /api/v1/ai-crawler-access-checker |
| `ayrank_robots_txt_test` | Test one URL against robots.txt for one user agent | /api/v1/robots-txt-tester |
| `ayrank_ai_training_grounding` | Bing AI training and grounding, Google-Extended | /api/v1/ai-training-grounding-checker |
| `ayrank_ai_crawler_ip_ranges` | Published IP ranges of AI and search crawlers | /api/v1/ai-crawler-ip-ranges |
| `ayrank_ai_overview_eligibility` | Google's stated conditions for AI Overviews and AI Mode links | /api/v1/ai-overview-eligibility-checker |
| `ayrank_sitemap_validate` | Validate an XML sitemap and spot-check its URLs | /api/v1/sitemap-validator |
| `ayrank_hreflang_check` | Check one page's hreflang set and its alternates | /api/v1/hreflang-checker |
| `ayrank_http_headers` | Every response header, hop by hop | /api/v1/http-header-checker |
| `ayrank_page_size` | Size against Googlebot's 2 MB limit | /api/v1/page-size-checker |
| `ayrank_heading_outline` | h1 to h6 outline and its issues | /api/v1/heading-outline-checker |
| `ayrank_alt_text` | Images and their alt text | /api/v1/alt-text-checker |
| `ayrank_internal_links` | Internal links on one page with anchors | /api/v1/internal-link-checker |
| `ayrank_broken_links` | Status of up to 100 links on one page | /api/v1/broken-link-checker |
| `ayrank_eeat_signals` | 11 trust signals of an article | /api/v1/eeat-checker |
| `ayrank_indexnow_key_check` | Is the IndexNow key file live and matching | /api/v1/indexnow-checker |
| `ayrank_title_score` | Score a title from 0 to 100 | /api/v1/title-scorer |
| `ayrank_llms_txt_generate` | Draft an llms.txt (returns text, writes nothing) | /api/v1/llms-txt-generator |
| `ayrank_robots_txt_generate` | Draft a robots.txt (returns text, writes nothing) | /api/v1/robots-txt-generator |

One info tool:

- `ayrank_tracking_info` makes no network call. See "Tracking" below.

Two write tools, off by default:

- `ayrank_request_free_audit` asks for the free AY Rank AI visibility audit. It posts to https://www.ayrank.com/api/lead with source `mcp` and creates a lead and notifies the AY Rank team; nothing is emailed to you or anyone else. A person from the team follows up within 24 hours. The tool does not run the audit itself.
- `ayrank_indexnow_submit` sends up to 100 URLs on a host you control to IndexNow. The AY Rank API re-checks your key file first, then posts the URLs to api.indexnow.org.

## Tracking

This server does not track whether ChatGPT, Perplexity, Gemini, Claude or Google AI answers name or cite your brand. The free API never asks an AI assistant anything.

- The free check at [app.ayrank.com](https://app.ayrank.com/tools/ai-visibility-checker?utm_source=github&utm_medium=readme&utm_campaign=ayrank-mcp) runs in a browser only: 3 buyer questions, one assistant answering from what it knows, no live web search, no API.
- Daily tracking with live search is in the paid [AY Rank app](https://app.ayrank.com/?start=signup&utm_source=github&utm_medium=readme&utm_campaign=ayrank-mcp) (7-day free trial). The app has its own MCP server that needs a key from your workspace. Its set-up guide is at https://app.ayrank.com/docs/skills.

`ayrank_tracking_info` returns the same facts and links to the agent.

## Write gate

A write tool sends a request only when both are true:

1. the call passes `confirm: true`, and
2. the server runs with `AYRANK_MCP_ALLOW_WRITES=1` in its environment.

Otherwise it sends nothing and returns a dry run: the method, the URL, the exact JSON body and what would happen. Each write tool runs at most once per 60 seconds and 5 times per server process. Every endpoint is free, so no tool spends money.

## Install

The package is not on npm. Install it from this GitHub repo and build it locally. You need Node.js 20 or newer and git.

```bash
git clone --branch v0.1.0 --depth 1 https://github.com/ay-automate/ayrank-mcp.git
cd ayrank-mcp
npm ci
npm run build
pwd
```

`npm ci` installs the exact versions in package-lock.json. The last line prints the folder; below it is written as `/path/to/ayrank-mcp`.

### Claude Code

```bash
claude mcp add ayrank-tools -- node /path/to/ayrank-mcp/dist/src/index.js
```

With the write tools turned on:

```bash
claude mcp add ayrank-tools -e AYRANK_MCP_ALLOW_WRITES=1 -- node /path/to/ayrank-mcp/dist/src/index.js
```

The name is `ayrank-tools`, so it does not clash with the AY Rank app's own MCP server, which its guide adds as `ayrank`.

### Claude Desktop

Add this to `claude_desktop_config.json` (Settings, Developer, Edit Config), then restart Claude Desktop:

```json
{
  "mcpServers": {
    "ayrank-tools": {
      "command": "node",
      "args": ["/path/to/ayrank-mcp/dist/src/index.js"]
    }
  }
}
```

To turn on the write tools, add `"env": { "AYRANK_MCP_ALLOW_WRITES": "1" }` next to `args`.

### Cursor

Add this to `.cursor/mcp.json` in a project, or to `~/.cursor/mcp.json` for every project:

```json
{
  "mcpServers": {
    "ayrank-tools": {
      "command": "node",
      "args": ["/path/to/ayrank-mcp/dist/src/index.js"]
    }
  }
}
```

### Streamable HTTP

```bash
node /path/to/ayrank-mcp/dist/src/index.js --http --port 3333
```

It listens on http://127.0.0.1:3333/mcp only, stateless, POST only.

## Settings

| Variable | Default | Meaning |
|----------|---------|---------|
| `AYRANK_MCP_ALLOW_WRITES` | unset | `1` lets the write tools send when a call passes `confirm: true` |
| `AYRANK_BASE_URL` | https://www.ayrank.com | API base URL, used by the tests to point at a local stub |

## Development

```bash
npm ci
npm run build
npm test                      # every tool against a local stub, plus stdio and HTTP transports
npm run test:live             # one live read per read tool on www.ayrank.com, writes as dry runs only
npm run validate:server-json  # server.json against the MCP registry schema
```

MIT licensed.
