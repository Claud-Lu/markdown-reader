/**
 * Markdown Reader - Cloudflare Worker Proxy
 * 
 * This worker acts as a CORS proxy to fetch markdown files from any URL.
 * Deploy this to Cloudflare Workers and set your custom domain.
 * 
 * @license MIT
 */

// CORS headers to allow cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    
    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get target URL from query parameter
    const targetUrl = url.searchParams.get('url');
    
    if (!targetUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing "url" query parameter' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Validate URL
    let parsedUrl;
    try {
      parsedUrl = new URL(targetUrl);
      // Only allow http and https protocols
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Invalid protocol');
      }
    } catch (e) {
      return new Response(
        JSON.stringify({ error: 'Invalid URL provided' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Optional: Add rate limiting or domain whitelist here
    // const allowedDomains = env.ALLOWED_DOMAINS?.split(',') || [];
    // if (allowedDomains.length > 0 && !allowedDomains.includes(parsedUrl.hostname)) {
    //   return new Response(
    //     JSON.stringify({ error: 'Domain not allowed' }),
    //     { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }}
    //   );
    // }

    try {
      // Fetch the target URL
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; MarkdownReader/1.0)',
        },
      });

      if (!response.ok) {
        return new Response(
          JSON.stringify({ 
            error: 'Failed to fetch target URL',
            status: response.status,
            statusText: response.statusText 
          }),
          { 
            status: 502, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      // Get the response body
      const body = await response.text();

      // Return with CORS headers
      return new Response(body, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
        },
      });

    } catch (error) {
      return new Response(
        JSON.stringify({ 
          error: 'Failed to fetch content',
          message: error.message 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
  },
};
