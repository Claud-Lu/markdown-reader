/**
 * Markdown Reader - Cloudflare Worker (Full Stack)
 * 
 * 同时提供：
 * 1. 静态页面服务 (GET /)
 * 2. CORS 代理 API (GET /proxy?url=xxx)
 * 
 * Deploy: wrangler deploy
 * @license MIT
 */

import HTML_CONTENT from "./index.html";

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // API: Proxy endpoint
    if (path === '/proxy' || path.startsWith('/proxy/')) {
      return handleProxy(url, env);
    }

    // API: Health check
    if (path === '/health') {
      return jsonResponse({ status: 'ok', version: '1.0.0' });
    }

    // Static: Serve HTML page
    return new Response(HTML_CONTENT, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  },
};

// Handle proxy requests
async function handleProxy(url, env) {
  const targetUrl = url.searchParams.get('url');
  
  if (!targetUrl) {
    return jsonResponse({ error: 'Missing "url" query parameter' }, 400);
  }

  // Validate URL
  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Invalid protocol');
    }
  } catch (e) {
    return jsonResponse({ error: 'Invalid URL provided' }, 400);
  }

  // Optional: Domain whitelist
  // const allowedDomains = env.ALLOWED_DOMAINS?.split(',') || [];
  // if (allowedDomains.length > 0 && !allowedDomains.includes(parsedUrl.hostname)) {
  //   return jsonResponse({ error: 'Domain not allowed' }, 403);
  // }

  try {
    // Try with minimal headers first (some servers block certain headers)
    const minimalHeaders = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
    };

    // Full browser headers
    const browserHeaders = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': 'https://www.google.com/',
      'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"macOS"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'max-age=0',
    };

    // Try with minimal headers first
    let response = await fetch(targetUrl, {
      method: 'GET',
      headers: minimalHeaders,
      redirect: 'follow',
    });

    // If failed, try with full browser headers
    if (!response.ok) {
      response = await fetch(targetUrl, {
        method: 'GET',
        headers: browserHeaders,
        redirect: 'follow',
      });
    }

    if (!response.ok) {
      return jsonResponse({
        error: 'Failed to fetch target URL',
        status: response.status,
        statusText: response.statusText,
        url: targetUrl,
      }, 502);
    }

    const body = await response.text();

    return new Response(body, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });

  } catch (error) {
    return jsonResponse({
      error: 'Failed to fetch content',
      message: error.message,
      url: targetUrl,
    }, 500);
  }
}

// Helper: JSON response
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}
