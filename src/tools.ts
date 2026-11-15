import { z } from "zod";
import { SERVER_VERSION } from "./config.js";

const url = (what = "The page to check, like https://example.com/page.") => z.string().min(1).max(2000).describe(what);

export interface ReadTool {
  name: string;
  title: string;
  path: string;
  description: string;
  input: z.ZodRawShape;
}

const NOTE = " Free AY Rank API, no key. JavaScript is not run, so content added by scripts is not seen.";

export const READ_TOOLS: ReadTool[] = [
  {
    name: "ayrank_ai_crawler_access",
    title: "AI crawler access",
    path: "/api/v1/ai-crawler-access-checker",
    description:
      "Use to check whether GPTBot, ClaudeBot, PerplexityBot and Google-Extended may crawl a site's homepage under its robots.txt, plus the homepage's meta robots and X-Robots-Tag rules for them. Returns allowed or blocked per bot with the deciding line. Not for one specific page or another user agent (use ayrank_robots_txt_test), and it cannot see CDN or firewall rules that fire only for the real bots, because it sends an AY Rank user agent." +
      NOTE,
    input: { domain: z.string().min(1).max(300).describe("The site, like example.com. A full URL works; only its host is used.") },
  },
  {
    name: "ayrank_robots_txt_test",
    title: "robots.txt tester",
    path: "/api/v1/robots-txt-tester",
    description:
      "Use to test one URL against the site's robots.txt for one user agent (RFC 9309: named group else *, longest match, Allow wins a tie). Returns allowed, the deciding line and lines that decide nothing. Not for meta robots or X-Robots-Tag (use ayrank_http_headers or ayrank_ai_overview_eligibility), and it does not write a robots.txt (use ayrank_robots_txt_generate).",
    input: {
      url: url("The page to test, like https://example.com/blog/post. Path and query are matched."),
      userAgent: z
        .string()
        .max(100)
        .optional()
        .describe(
          "robots.txt product token. Default Googlebot. Presets: Googlebot, Bingbot, GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, PerplexityBot, Google-Extended, Applebot-Extended, CCBot.",
        ),
    },
  },
  {
    name: "ayrank_ai_training_grounding",
    title: "AI training and grounding preferences",
    path: "/api/v1/ai-training-grounding-checker",
    description:
      "Use to read a page's AI training and grounding preferences: Bing AI Training (robots.txt __usage_ai-training group, page meta or X-Robots-Tag), Bing AI Grounding (page level), Google-Extended, and whether Bingbot and Googlebot may crawl the path. Only directives from Bing's and Google's 30 Oct 2026 posts. Not for the other AI crawlers (use ayrank_ai_crawler_access).",
    input: { url: url("The page to check, like https://example.com/blog/post.") },
  },
  {
    name: "ayrank_ai_crawler_ip_ranges",
    title: "AI crawler IP ranges",
    path: "/api/v1/ai-crawler-ip-ranges",
    description:
      "Use to get the CIDR ranges that OpenAI, Perplexity, Anthropic, Google, Bing, Apple, Common Crawl and Mistral publish for their crawlers and agents, for example to tell a real GPTBot hit in server logs from a fake one. Each source says whether it is live or a dated snapshot. Cached for 24 hours. No input. Not for checking whether a bot may crawl a site (use ayrank_ai_crawler_access).",
    input: {},
  },
  {
    name: "ayrank_ai_overview_eligibility",
    title: "AI Overview eligibility",
    path: "/api/v1/ai-overview-eligibility-checker",
    description:
      "Use to check one URL against Google's stated conditions for being a supporting link in AI Overviews and AI Mode: robots.txt, status, noindex, unavailable_after, nosnippet and max-snippet, data-nosnippet share and canonical. Returns eligible, not-eligible or cant-check with evidence per check. Eligible never means included, and it cannot tell whether the page is indexed (only Search Console can). It does not check whether Google shows the page in an AI answer." +
      NOTE,
    input: { url: url() },
  },
  {
    name: "ayrank_sitemap_validate",
    title: "Sitemap validator",
    path: "/api/v1/sitemap-validator",
    description:
      "Use to validate an XML sitemap (or find it from a site root via robots.txt, else /sitemap.xml) against the sitemaps.org protocol and Google's rules, including up to 10 child sitemaps of an index, then spot-check up to 20 listed URLs with HEAD. Not for checking every URL in a large sitemap, and not for hreflang in sitemaps.",
    input: { url: url("A sitemap URL like https://example.com/sitemap.xml, or a site root like https://example.com.") },
  },
  {
    name: "ayrank_hreflang_check",
    title: "hreflang checker",
    path: "/api/v1/hreflang-checker",
    description:
      "Use to check one page's hreflang set (link tags in the head and the HTTP Link header) against Google's rules: valid codes, self-reference, x-default, absolute URLs, then whether up to 10 alternates answer, link back and self-canonicalize. Sitemap hreflang is not read." +
      NOTE,
    input: { url: url() },
  },
  {
    name: "ayrank_http_headers",
    title: "HTTP header checker",
    path: "/api/v1/http-header-checker",
    description:
      "Use to list every response header of a URL hop by hop (redirects followed by hand, at most 5) and parse X-Robots-Tag, Link, Content-Type, Cache-Control, ETag, Last-Modified, Vary and Content-Encoding into issues such as noindex headers, redirect chains or temporary redirects. The body is never read. Headers are as seen from AY Rank's server; a CDN can answer differently by region or user agent.",
    input: { url: url("The URL to check, like https://example.com/page.") },
  },
  {
    name: "ayrank_page_size",
    title: "Page size checker",
    path: "/api/v1/page-size-checker",
    description:
      "Use to measure a URL's transferred and decoded size against Googlebot's 2 MB limit (64 MB for PDF), and for HTML see what sits past the cut and which parts (inline scripts, JSON, Next.js payload, styles, svg) take the bytes. Linked CSS, scripts and images are not fetched. No ranking claim." +
      NOTE,
    input: { url: url("The page or file to measure, like https://example.com/page.") },
  },
  {
    name: "ayrank_heading_outline",
    title: "Heading outline",
    path: "/api/v1/heading-outline-checker",
    description:
      "Use to list a page's h1 to h6 headings in order with level, announced text and landmark, and flag no h1, skipped levels, empty or image-only headings. More than one h1 is a note only. Not a content quality score." +
      NOTE,
    input: { url: url() },
  },
  {
    name: "ayrank_alt_text",
    title: "Alt text checker",
    path: "/api/v1/alt-text-checker",
    description:
      "Use to list a page's images (img, input type=image, area, svg role=img) with their alt text state: missing, empty, present or hidden, and flags such as missing alt, unnamed image links or file-name alt. It does not judge alt text quality and does not download images." +
      NOTE,
    input: { url: url() },
  },
  {
    name: "ayrank_internal_links",
    title: "Internal link checker",
    path: "/api/v1/internal-link-checker",
    description:
      "Use to list the internal links on ONE page with anchor text, rel and position (main, nav, footer), grouped by target, with flags for empty or generic anchors, nofollow, self-links and links Google cannot crawl. It does not crawl the site and does not fetch the links (use ayrank_broken_links for status codes)." +
      NOTE,
    input: { url: url() },
  },
  {
    name: "ayrank_broken_links",
    title: "Broken link checker",
    path: "/api/v1/broken-link-checker",
    description:
      "Use to find broken links on one page: AY Rank's server sends one GET to each of up to 100 links on it and reports ok, redirect, broken, denied, rate-limited, server-error, timeout and so on. Takes up to 25 s. Not a site crawl. Not for anchor text review (use ayrank_internal_links)." +
      NOTE,
    input: { url: url("The page whose links to check, like https://example.com/page.") },
  },
  {
    name: "ayrank_eeat_signals",
    title: "E-E-A-T trust signals",
    path: "/api/v1/eeat-checker",
    description:
      "Use to list 11 trust signals an article shows (byline, author page link, Article and Person JSON-LD, published and updated dates, About and Contact links, outbound links), each found or missing with evidence. Google says E-E-A-T is not a ranking factor by itself, so there is a found count and no score." +
      NOTE,
    input: { url: url("The article to check, like https://example.com/blog/post.") },
  },
  {
    name: "ayrank_indexnow_key_check",
    title: "IndexNow key check",
    path: "/api/v1/indexnow-checker",
    description:
      "Use to check that an IndexNow key file is live and matches the key (step 1 of IndexNow). Nothing is sent to IndexNow. To submit URLs after it passes, use ayrank_indexnow_submit.",
    input: {
      host: z.string().min(1).max(300).describe("The host, like www.example.com. A URL is accepted and its host is used."),
      key: z.string().min(8).max(128).describe("The IndexNow key, 8 to 128 characters of a-z, A-Z, 0-9 and dashes."),
      keyLocation: z.string().max(2000).optional().describe("The key file URL when it is not at the root, on the same host."),
    },
  },
  {
    name: "ayrank_title_score",
    title: "Title scorer",
    path: "/api/v1/title-scorer",
    description:
      "Use to score a page title from 0 to 100 on eight factors (length, power words, numbers, emotion, question format, readability, AI citability, uniqueness) with a tip per factor. It is a heuristic, not a measure of rankings or clicks. Reads no page.",
    input: { title: z.string().min(1).max(300).describe("The title to score, up to 300 characters.") },
  },
  {
    name: "ayrank_llms_txt_generate",
    title: "llms.txt generator",
    path: "/api/v1/llms-txt-generator",
    description:
      "Use to draft an llms.txt file from company details, with a completeness score. It returns text only and writes nothing to any site. It does not read the site, so it only knows what you pass in.",
    input: {
      companyName: z.string().min(1).max(200).describe("Company name."),
      websiteUrl: z.string().min(1).max(2000).describe("Absolute http(s) URL of the site."),
      description: z.string().max(2000).optional().describe("Two or three sentences on what the company does."),
      industry: z.string().max(200).optional().describe("Industry, for example SaaS or Healthcare."),
      services: z.string().max(2000).optional().describe("Comma-separated list of services."),
      keyPages: z.string().max(5000).optional().describe("Key page URLs, one per line."),
      differentiators: z.string().max(2000).optional().describe("What makes the company different, one per line."),
      contactEmail: z.string().max(254).optional().describe("Contact email."),
      socialLinks: z.string().max(2000).optional().describe("Comma-separated social profile URLs."),
    },
  },
  {
    name: "ayrank_robots_txt_generate",
    title: "robots.txt generator",
    path: "/api/v1/robots-txt-generator",
    description:
      "Use to draft a robots.txt that allows every known crawler except the ones listed in block. It returns text only and writes nothing to any site. Not for testing an existing robots.txt (use ayrank_robots_txt_test).",
    input: {
      block: z
        .string()
        .max(1000)
        .optional()
        .describe(
          "Comma-separated crawlers to disallow. Known: GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, PerplexityBot, Google-Extended, Applebot-Extended, Googlebot, Bingbot.",
        ),
      blockedDirs: z.string().max(1000).optional().describe("Comma-separated paths to disallow for every crawler, like /admin,/private."),
      sitemapUrl: z.string().max(2000).optional().describe("Absolute http(s) URL of the sitemap."),
    },
  },
];

export const USER_AGENT = `ayrank-mcp/${SERVER_VERSION} (+https://github.com/ay-automate/ayrank-mcp)`;
