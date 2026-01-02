/**
 * Navi Cloud Router Worker
 *
 * Routes *.usenavi.app subdomains to the correct Cloudflare Pages project.
 * Deployed with wildcard route: *.usenavi.app
 *
 * Example:
 *   myapp.usenavi.app → proxies to myapp-abc123.pages.dev
 */

export interface Env {
  DB: D1Database;
}

interface AppRecord {
  slug: string;
  cf_pages_url: string;
  status: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const hostname = url.hostname;

    // Extract subdomain from hostname
    // e.g., "myapp.usenavi.app" → "myapp"
    const subdomain = hostname.replace('.usenavi.app', '').toLowerCase();

    // Reserved subdomains that should not be routed
    const reserved = ['www', 'api', 'admin', 'app', 'dashboard', 'docs', 'mail', 'smtp'];
    if (reserved.includes(subdomain)) {
      return new Response('Reserved subdomain', { status: 400 });
    }

    // Look up the app in the registry
    const app = await env.DB.prepare(`
      SELECT slug, cf_pages_url, status FROM apps WHERE slug = ? AND status = 'live'
    `).bind(subdomain).first<AppRecord>();

    if (!app) {
      return notFoundPage(subdomain);
    }

    // Proxy the request to the Pages project
    const targetUrl = new URL(url.pathname + url.search, `https://${app.cf_pages_url}`);

    const proxyRequest = new Request(targetUrl.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: 'manual',
    });

    try {
      const response = await fetch(proxyRequest);

      // Clone response with CORS headers
      const newHeaders = new Headers(response.headers);
      newHeaders.set('X-Powered-By', 'Navi Cloud');
      newHeaders.set('X-Navi-App', subdomain);

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    } catch (error) {
      console.error(`Proxy error for ${subdomain}:`, error);
      return errorPage(subdomain, 'Failed to load app');
    }
  },
};

function notFoundPage(subdomain: string): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>App Not Found - Navi Cloud</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #0f0f23 0%, #1a1a3e 100%);
      color: white;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 20px;
    }
    .container { max-width: 500px; }
    h1 { font-size: 3rem; margin-bottom: 1rem; }
    .slug { color: #8b5cf6; font-family: monospace; }
    p { color: #94a3b8; margin-bottom: 2rem; line-height: 1.6; }
    a {
      display: inline-block;
      padding: 12px 24px;
      background: #8b5cf6;
      color: white;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 500;
    }
    a:hover { background: #7c3aed; }
  </style>
</head>
<body>
  <div class="container">
    <h1>404</h1>
    <p>
      The app <span class="slug">${subdomain}.usenavi.app</span> doesn't exist yet.
    </p>
    <p>
      Want to deploy something here? Ship it with Navi!
    </p>
    <a href="https://usenavi.app">Learn about Navi</a>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: 404,
    headers: { 'Content-Type': 'text/html' },
  });
}

function errorPage(subdomain: string, message: string): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error - Navi Cloud</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f0f23;
      color: white;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 20px;
    }
    h1 { font-size: 2rem; margin-bottom: 1rem; color: #ef4444; }
    p { color: #94a3b8; }
    .slug { color: #8b5cf6; font-family: monospace; }
  </style>
</head>
<body>
  <div>
    <h1>Something went wrong</h1>
    <p>${message}</p>
    <p style="margin-top: 1rem;">App: <span class="slug">${subdomain}.usenavi.app</span></p>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: 502,
    headers: { 'Content-Type': 'text/html' },
  });
}
