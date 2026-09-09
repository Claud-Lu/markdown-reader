import { DocumentError, normalizeDocumentUrl, readBoundedText } from './src/document.js';

const DEFAULT_DOMAINS = ['raw.githubusercontent.com', 'github.com', 'gitlab.com', 'gitee.com'];
const EVENTS = new Set(['read_success', 'read_failure', 'read_engaged', 'copy_code', 'share_link', 'print_document', 'return_visit']);
const SOURCES = new Set(['url', 'file', 'paste']);
const REASONS = new Set(['network', 'timeout', 'too_large', 'unsupported_type', 'empty', 'invalid_url', 'proxy_denied', 'load_failed']);
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: http: data: blob:; font-src 'self'; connect-src 'self' https: http:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
function analyticsEnabled(env) {
  try { return env.ANALYTICS_ENABLED === 'true' && Boolean(env.ANALYTICS_PROJECT) && new URL(env.ANALYTICS_ENDPOINT).protocol === 'https:'; }
  catch { return false; }
}
export function publicConfig(env) {
  let feedbackUrl = '';
  try { const url = new URL(env.FEEDBACK_URL); if (url.protocol === 'https:' && !url.username && !url.password) feedbackUrl = url.href; } catch { /* Optional. */ }
  return { analyticsEnabled: analyticsEnabled(env), feedbackUrl };
}
export async function fetchDocument(value, env = {}, fetcher = fetch) {
  const allowed = env.ALLOWED_DOMAINS ? env.ALLOWED_DOMAINS.split(',').map(host => host.trim().toLowerCase()).filter(Boolean) : DEFAULT_DOMAINS;
  let target = normalizeDocumentUrl(value);
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    for (let redirect = 0; redirect <= 4; redirect++) {
      if (!allowed.includes(new URL(target).hostname)) throw new DocumentError('此来源未启用代理读取。可下载后打开，或由部署者配置允许的域名。', 'proxy_denied', 403);
      const response = await fetcher(target, {
        method: 'GET', redirect: 'manual', signal: controller.signal,
        headers: { Accept: 'text/markdown, text/plain, application/octet-stream;q=0.5', 'User-Agent': 'MarkdownReader/2.0' },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location'); await response.body?.cancel();
        if (!location) throw new DocumentError('文档跳转地址无效。', 'load_failed', 502);
        target = normalizeDocumentUrl(location, target); continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new DocumentError(response.status === 404 ? '没有找到文档，请检查链接是否仍然有效。' : '来源站点暂时无法读取，请稍后重试或下载后打开。', 'load_failed', 502);
      }
      return { markdown: await readBoundedText(response), sourceUrl: target };
    }
    throw new DocumentError('文档跳转次数过多，请使用最终原文链接。', 'load_failed', 502);
  } catch (error) {
    if (controller.signal.aborted) throw new DocumentError('读取超时，请稍后重试或下载后打开。', 'timeout', 504);
    if (error instanceof DocumentError) throw error;
    throw new DocumentError('无法连接文档来源，请稍后重试。', 'network', 502);
  } finally { clearTimeout(timer); }
}
export function analyticsPayload(raw, request, env) {
  if (!raw || typeof raw !== 'object' || (raw.type !== 'pageview' && !EVENTS.has(raw.name))) return null;
  const validId = value => typeof value === 'string' && /^[a-f\d-]{36}$/.test(value) ? value : null;
  const userId = validId(raw.visitorId); const sessionId = validId(raw.sessionId);
  if (!userId || !sessionId) return null;
  let referrer = '';
  try { const url = new URL(raw.referrer); if (['https:', 'http:'].includes(url.protocol)) referrer = url.origin; } catch { /* Unknown. */ }
  const metadata = {};
  if (SOURCES.has(raw.source)) metadata.source = raw.source;
  if (REASONS.has(raw.reason)) metadata.reason = raw.reason;
  return {
    project: env.ANALYTICS_PROJECT, type: raw.type === 'pageview' ? 'pageview' : 'custom',
    ...(raw.type !== 'pageview' ? { name: raw.name } : {}),
    timestamp: new Date().toISOString(), userId, sessionId,
    url: new URL(request.url).origin + '/', path: '/', referrer,
    userAgent: (request.headers.get('user-agent') || '').slice(0, 512), metadata,
  };
}
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/analytics') {
      if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
      if (request.headers.get('origin') !== url.origin) return json({ error: 'Forbidden' }, 403);
      if (!analyticsEnabled(env)) return new Response(null, { status: 204 });
      if (Number(request.headers.get('content-length')) > 2048) return json({ error: 'Payload too large' }, 413);
      let raw;
      try { raw = JSON.parse(await readBoundedText(request, 2048)); } catch { return json({ error: 'Invalid event' }, 400); }
      const payload = analyticsPayload(raw, request, env);
      if (!payload) return json({ error: 'Invalid event' }, 400);
      ctx.waitUntil(fetch(env.ANALYTICS_ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Origin: url.origin },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(4000),
      }).then(response => response.body?.cancel()).catch(() => {}));
      return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
    }
    if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'Method not allowed' }, 405);
    if (url.pathname === '/health') return json({ status: 'ok', version: '2.0.0' });
    if (url.pathname === '/api/config') return json(publicConfig(env));
    if (url.pathname === '/api/document' || url.pathname === '/proxy') {
      try {
        const result = await fetchDocument(url.searchParams.get('url'), env);
        if (url.pathname === '/proxy') return new Response(result.markdown, { headers: { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
        return json(result);
      } catch (error) { return json({ error: error.message, code: error.code || 'load_failed' }, error.status || 502); }
    }
    if (url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);
    const response = await env.ASSETS.fetch(request); const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);
    if (headers.get('content-type')?.includes('text/html')) headers.set('Cache-Control', 'no-cache');
    return new Response(response.body, { status: response.status, headers });
  },
};
