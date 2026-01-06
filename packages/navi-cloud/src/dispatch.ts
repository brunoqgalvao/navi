/**
 * Navi Cloud - Dispatch Worker
 *
 * Routes *.usenavi.app requests to the correct user Worker.
 * Uses Workers for Platforms dispatch namespace.
 */

export interface Env {
  REGISTRY_DB: D1Database;
  USER_WORKERS: DispatchNamespace;
  DEPLOY_SECRET: string;
}

interface AppRecord {
  slug: string;
  worker_name: string;
  status: string;
  d1_database_id: string | null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const hostname = url.hostname;

    // Extract subdomain from hostname
    // e.g., "myapp.usenavi.app" → "myapp"
    const subdomain = hostname.replace('.usenavi.app', '').toLowerCase();

    // Handle root domain
    if (subdomain === '' || hostname === 'usenavi.app' || hostname === 'www.usenavi.app') {
      return Response.redirect('https://usenavi.app', 302);
    }

    // Reserved subdomains
    const reserved = ['www', 'api', 'admin', 'app', 'dashboard', 'docs', 'mail', 'smtp', 'ftp'];
    if (reserved.includes(subdomain)) {
      return new Response('Reserved subdomain', { status: 400 });
    }

    // Look up the app in the registry
    const app = await env.REGISTRY_DB.prepare(`
      SELECT slug, worker_name, status, d1_database_id
      FROM apps
      WHERE slug = ? AND status = 'live'
    `).bind(subdomain).first<AppRecord>();

    if (!app) {
      return notFoundPage(subdomain);
    }

    try {
      // Get the user's Worker from dispatch namespace
      const userWorker = env.USER_WORKERS.get(app.worker_name);

      // Forward the request to the user's Worker
      // Pass along the D1 database binding if the app has one
      return await userWorker.fetch(request, {
        // These will be available as env in the user worker
        cf: {
          // Custom metadata we can read in the user worker
          naviApp: {
            slug: app.slug,
            d1DatabaseId: app.d1_database_id,
          },
        },
      });
    } catch (error) {
      console.error(`Dispatch error for ${subdomain}:`, error);
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
    h1 { font-size: 4rem; margin-bottom: 0.5rem; opacity: 0.3; }
    h2 { font-size: 1.5rem; margin-bottom: 1rem; }
    .slug { color: #8b5cf6; font-family: monospace; background: rgba(139, 92, 246, 0.1); padding: 2px 8px; border-radius: 4px; }
    p { color: #94a3b8; margin-bottom: 2rem; line-height: 1.6; }
    a {
      display: inline-block;
      padding: 12px 24px;
      background: #8b5cf6;
      color: white;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 500;
      transition: background 0.2s;
    }
    a:hover { background: #7c3aed; }
  </style>
</head>
<body>
  <div class="container">
    <h1>404</h1>
    <h2>App not found</h2>
    <p>
      <span class="slug">${subdomain}.usenavi.app</span> doesn't exist yet.
    </p>
    <p>
      Build something amazing with Navi and ship it here.
    </p>
    <a href="https://usenavi.app">Get Navi</a>
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
    h1 { font-size: 1.5rem; margin-bottom: 1rem; color: #ef4444; }
    p { color: #94a3b8; }
    .slug { color: #8b5cf6; font-family: monospace; }
    .retry { margin-top: 2rem; }
    a { color: #8b5cf6; }
  </style>
</head>
<body>
  <div>
    <h1>Something went wrong</h1>
    <p>${message}</p>
    <p style="margin-top: 1rem;">App: <span class="slug">${subdomain}.usenavi.app</span></p>
    <p class="retry"><a href="">Try again</a></p>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: 502,
    headers: { 'Content-Type': 'text/html' },
  });
}
