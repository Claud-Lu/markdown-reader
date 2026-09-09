# Markdown Reader

A lightweight, open-source Markdown reader. Paste text, open a local file, or read a public document URL. Built with vanilla JavaScript, Vite and Cloudflare Workers.

一个轻量的开源 Markdown 阅读器，让技术文档、AI 笔记和长文更容易阅读。

## Features / 功能

- Paste Markdown, open `.md` / `.markdown` / `.txt` files, or drag a file anywhere onto the page (maximum 2 MB).
- Open public raw URLs and GitHub / GitLab / Gitee file pages. Resolve relative links and images against the final source URL.
- Navigate all six heading levels, including Chinese and repeated headings; original Markdown fragment links are mapped to stable reader anchors.
- Read highlighted code, copy code blocks, view Mermaid diagrams and native MathML equations. Diagram and math libraries load only when needed.
- Choose light, dark or system appearance, font size, line spacing and content width. Read comfortably on desktop or mobile.
- Resume by heading or progress. Recent records stay in the current browser; v1 URL history is retained. No document bodies are persisted.
- Share public URL documents at the current chapter; print a clean reading layout or save it as PDF through the browser print dialog.
- Inspect or edit the source of the current document. Edits become local pasted text, avoiding misleading source/share links.
- Optional feedback and privacy-minimized analytics integrations, **disabled by default**. No author-specific services or credentials are required.

## Quick start

Requires Node.js 24.15 or later.

```sh
npm ci
npm run build
npm run preview
```

Open `http://localhost:8787`. Preview runs the built assets and Worker routes locally using the generic `wrangler.example.toml` configuration.

For frontend development, keep that preview running and use `npm run dev` in another terminal. Vite proxies `/api` requests to the local Worker.

## Deploy your own copy

1. Copy `wrangler.example.toml` to `wrangler.toml` (ignored by Git).
2. Set your Worker name and, optionally, your custom domain in that private file.
3. Sign in with `npx wrangler login` or supply a Cloudflare API token through your environment.
4. Run `npm run deploy`.

All rendering dependencies are bundled with the site. Visitors do not fetch rendering scripts from external CDNs. Mermaid has larger optional chunks, fetched only when diagrams occur.

Example reading link:

```text
https://reader.example.com/?url=https%3A%2F%2Fraw.githubusercontent.com%2Fexample%2Fdocs%2Fmain%2FREADME.md
```

The existing `?fullscreen=1` parameter remains supported as focus mode.

### URL fetching

The browser first attempts to fetch the source with no credentials and no referrer. If CORS or a network error prevents this, it uses the same-origin Worker proxy.

The proxy permits exact hostnames from `ALLOWED_DOMAINS`. Defaults are `raw.githubusercontent.com`, `github.com`, `gitlab.com` and `gitee.com`; each redirect must also be allowed. Add only sources you trust in your deployment configuration. The allowlist is also the DNS trust boundary; do not allow arbitrary wildcard hosts. Private / IP-literal URLs, credential-bearing URLs and nonstandard ports are rejected. Requests time out and are capped at 2 MB; HTML, media and binary responses are rejected. Proxy responses are not publicly cached.

GitHub branch names containing slashes are passed through to the raw endpoint; the reader does not query repository metadata. Local relative image files are not uploaded automatically. Markdown-dialect features such as Obsidian wikilinks are not supported.

### Optional analytics and feedback

No analytics are enabled in the open-source defaults. To opt in for **your deployment**, configure these outside Git:

```toml
[vars]
ANALYTICS_ENABLED = "true"
ANALYTICS_PROJECT = "your-project"
ANALYTICS_ENDPOINT = "https://metrics.example.com/api/events"
FEEDBACK_URL = "https://example.com/feedback"
```

The browser talks only to `/api/analytics`; the Worker forwards a strict, sanitized event schema to the configured endpoint. The endpoint should accept a JSON event with `project`, `type`, `name`, `userId`, `sessionId`, `timestamp`, `url`, `path`, `referrer`, `userAgent` and `metadata`. The page URL is always the reader origin plus `/`, the referrer contains only an origin, and metadata accepts only fixed source/error categories. No document body, title, filename, raw source URL or query string is sent. Never put tokens in the endpoint URL; any future authenticated adapter must attach credentials server-side.

Supported events are `pageview`, `read_success`, `read_failure`, `read_engaged`, `copy_code`, `share_link`, `print_document` and `return_visit`. Successful rendering is recorded after completion, not when an import button is clicked. Reading engagement requires 30 visible seconds and at least 25% progress. Sample documents, localhost, detected automation, DNT and GPC opt-outs do not produce usage events. `return_visit` is a browser identifier signal, not a verified person or a cohort retention rate.

`GET /api/config` exposes only the enablement flag and the public feedback URL; it never returns the analytics endpoint or project configuration. Update the deployment's privacy notice before enabling analytics and protect your receiving service against abuse. The integration is deliberately replaceable; a fork never reports to the original author's service automatically.

## Privacy

- Pasted text and local files are processed in the browser. Document text is never stored by the reader or its default server.
- URL mode contacts the document host and may use the deployment's Worker proxy. Remote images contact their source hosts with no referrer.
- Local reading records contain a content hash, title, safe public URL (query-bearing URLs are omitted), heading, progress and timestamp. Reopen a local file or paste the same text to resume; the body is not saved.
- Disable recording in Reading Settings or clear the recent list to remove stored records. Sharing query-bearing URLs requires manual review and copying.
- Source/configuration endpoints and browser-visible assets are public. Environment variables do not make values secret if they are sent to a browser. Keep credentials, private service addresses, personal data, real operational logs and local paths out of public source and release artifacts.

## Validation and contributions

```sh
npm test
npm run build
node scripts/check-release.js
```

`npm run check` runs all three. Tests exercise Markdown sanitization, heading links, code/math rendering, record privacy and v1 migration, bounded URL loading, redirect controls and analytics minimization. Browser checks should cover desktop/mobile layouts, history navigation, resume, clipboard, diagrams and printing.

The privacy scanner checks release inputs and production assets for credentials and private paths. Operators may add their own sensitive strings to an ignored `.release-private-patterns` file, or set `RELEASE_PRIVATE_PATTERNS_FILE`. Never commit those operator-specific rules.

Development uses `dev`; `main` is the existing release branch. CI validates changes on both branches. Production deployment is manual (`workflow_dispatch`) and uses a protected `production` environment: store `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and the complete private `WRANGLER_CONFIG` as environment secrets. This keeps custom domains and deployment integrations out of the public repository.

## Project structure

```text
index.html                  Accessible home and reader interface
src/app.js                  Import, navigation and reading controls
src/renderer.js             Sanitized Markdown, headings, code, math and diagrams
src/storage.js              Browser-local settings and reading records
src/document.js             URL normalization and document limits
src/analytics.js            Optional, minimized usage events
worker.js                   Assets, bounded proxy and optional analytics relay
wrangler.example.toml       Generic deployment template
scripts/check-release.js    Public release privacy check
```

## License

MIT. Dependency licenses remain with their respective authors. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
