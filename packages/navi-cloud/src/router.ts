/**
 * Navi Cloud - Router Worker (Free Tier)
 *
 * Routes *.usenavi.app to the correct Cloudflare Pages project.
 * Also handles the deploy API at api.usenavi.app
 */

export interface Env {
  REGISTRY_DB: D1Database;
  DEPLOY_SECRET: string;
  CLOUDFLARE_API_TOKEN: string;
  CLOUDFLARE_ACCOUNT_ID: string;
}

interface AppRecord {
  slug: string;
  pages_project: string;
  pages_url: string;
  status: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const hostname = url.hostname;

    // Extract subdomain
    const subdomain = hostname.replace('.usenavi.app', '').toLowerCase();

    // Handle API requests at api.usenavi.app
    if (subdomain === 'api') {
      return handleApi(request, env);
    }

    // Handle root domain
    if (subdomain === '' || hostname === 'usenavi.app' || subdomain === 'www') {
      return Response.redirect('https://usenavi.app', 302);
    }

    // Reserved subdomains
    const reserved = ['admin', 'app', 'dashboard', 'docs', 'mail', 'smtp', 'ftp'];
    if (reserved.includes(subdomain)) {
      return new Response('Reserved subdomain', { status: 400 });
    }

    // Look up the app
    const app = await env.REGISTRY_DB.prepare(`
      SELECT slug, pages_project, pages_url, status
      FROM apps WHERE slug = ? AND status = 'live'
    `).bind(subdomain).first<AppRecord>();

    if (!app) {
      return notFoundPage(subdomain);
    }

    // Proxy to the Pages project
    const targetUrl = new URL(url.pathname + url.search, `https://${app.pages_url}`);

    try {
      const response = await fetch(targetUrl.toString(), {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });

      // Return with custom headers
      const newHeaders = new Headers(response.headers);
      newHeaders.set('X-Powered-By', 'Navi Cloud');
      newHeaders.set('X-Navi-App', subdomain);

      return new Response(response.body, {
        status: response.status,
        headers: newHeaders,
      });
    } catch (error) {
      console.error(`Proxy error for ${subdomain}:`, error);
      return errorPage(subdomain);
    }
  },
};

// --- API Handler ---

async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth check for mutating operations
  if (method !== 'GET') {
    const auth = request.headers.get('Authorization');
    if (auth !== `Bearer ${env.DEPLOY_SECRET}`) {
      return json({ error: 'Unauthorized' }, 401, corsHeaders);
    }
  }

  try {
    // POST /deploy - Deploy an app
    if (url.pathname === '/deploy' && method === 'POST') {
      return await handleDeploy(request, env, corsHeaders);
    }

    // GET /deploy/:slug - Get app status
    if (url.pathname.match(/^\/deploy\/[\w-]+$/) && method === 'GET') {
      const slug = url.pathname.split('/')[2];
      return await handleGetApp(slug, env, corsHeaders);
    }

    // DELETE /deploy/:slug - Delete app
    if (url.pathname.match(/^\/deploy\/[\w-]+$/) && method === 'DELETE') {
      const slug = url.pathname.split('/')[2];
      return await handleDeleteApp(slug, env, corsHeaders);
    }

    // GET /apps - List all apps
    if (url.pathname === '/apps' && method === 'GET') {
      return await handleListApps(env, corsHeaders);
    }

    return json({ error: 'Not found' }, 404, corsHeaders);
  } catch (error) {
    console.error('API Error:', error);
    return json({ error: String(error) }, 500, corsHeaders);
  }
}

// --- Deploy Handler ---

interface DeployRequest {
  slug: string;
  name?: string;
  files: Array<{ path: string; content: string }>;
}

async function handleDeploy(
  request: Request,
  env: Env,
  headers: Record<string, string>
): Promise<Response> {
  const body = (await request.json()) as DeployRequest;
  const { slug, name, files } = body;

  if (!slug || !files?.length) {
    return json({ error: 'slug and files required' }, 400, headers);
  }

  // Validate slug
  if (!/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(slug)) {
    return json({ error: 'Invalid slug (3-30 chars, lowercase alphanumeric + hyphens)' }, 400, headers);
  }

  // Reserved
  const reserved = ['www', 'api', 'admin', 'app', 'dashboard', 'docs', 'navi', 'cloud'];
  if (reserved.includes(slug)) {
    return json({ error: 'Reserved name' }, 400, headers);
  }

  // Check existing
  const existing = await env.REGISTRY_DB.prepare(
    'SELECT id, pages_project FROM apps WHERE slug = ?'
  ).bind(slug).first<{ id: string; pages_project: string }>();

  const projectName = existing?.pages_project || `navi-${slug}-${randomId(6)}`;

  // Create Pages project if new
  if (!existing) {
    const created = await createPagesProject(env, projectName);
    if (!created.success) {
      return json({ error: created.error }, 500, headers);
    }
  }

  // Deploy files using wrangler pages deploy (via API)
  const deployed = await deployToPages(env, projectName, files);
  if (!deployed.success) {
    return json({ error: deployed.error }, 500, headers);
  }

  // Update registry
  const now = new Date().toISOString();
  const pagesUrl = `${projectName}.pages.dev`;

  if (existing) {
    await env.REGISTRY_DB.prepare(`
      UPDATE apps SET
        deploy_count = deploy_count + 1,
        last_deployed_at = ?,
        status = 'live'
      WHERE slug = ?
    `).bind(now, slug).run();
  } else {
    await env.REGISTRY_DB.prepare(`
      INSERT INTO apps (id, slug, name, pages_project, pages_url, status, last_deployed_at)
      VALUES (?, ?, ?, ?, ?, 'live', ?)
    `).bind(randomId(), slug, name || slug, projectName, pagesUrl, now).run();
  }

  return json({
    success: true,
    url: `https://${slug}.usenavi.app`,
    pagesUrl: `https://${pagesUrl}`,
  }, 200, headers);
}

// --- Pages API Helpers ---

async function createPagesProject(env: Env, projectName: string): Promise<{ success: boolean; error?: string }> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/pages/projects`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: projectName,
        production_branch: 'main',
      }),
    }
  );

  const data = await response.json() as any;
  if (!data.success) {
    return { success: false, error: data.errors?.[0]?.message || 'Failed to create project' };
  }
  return { success: true };
}

async function deployToPages(
  env: Env,
  projectName: string,
  files: Array<{ path: string; content: string }>
): Promise<{ success: boolean; error?: string }> {
  // Create deployment
  const createRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/pages/projects/${projectName}/deployments`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    }
  );

  const createData = await createRes.json() as any;
  if (!createData.success) {
    return { success: false, error: 'Failed to create deployment' };
  }

  const deploymentId = createData.result.id;

  // Upload files
  const formData = new FormData();

  for (const file of files) {
    const content = Uint8Array.from(atob(file.content), c => c.charCodeAt(0));
    formData.append(file.path, new Blob([content]), file.path);
  }

  const uploadRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/pages/projects/${projectName}/deployments/${deploymentId}/files`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
      },
      body: formData,
    }
  );

  if (!uploadRes.ok) {
    return { success: false, error: 'Failed to upload files' };
  }

  return { success: true };
}

async function deletePagesProject(env: Env, projectName: string): Promise<void> {
  await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/pages/projects/${projectName}`,
    {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
    }
  );
}

// --- Other Handlers ---

async function handleGetApp(slug: string, env: Env, headers: Record<string, string>): Promise<Response> {
  const app = await env.REGISTRY_DB.prepare('SELECT * FROM apps WHERE slug = ?').bind(slug).first();
  if (!app) return json({ error: 'Not found' }, 404, headers);

  return json({
    slug: app.slug,
    name: app.name,
    url: `https://${app.slug}.usenavi.app`,
    pagesUrl: `https://${app.pages_url}`,
    status: app.status,
    deployCount: app.deploy_count,
    lastDeployedAt: app.last_deployed_at,
  }, 200, headers);
}

async function handleDeleteApp(slug: string, env: Env, headers: Record<string, string>): Promise<Response> {
  const app = await env.REGISTRY_DB.prepare('SELECT pages_project FROM apps WHERE slug = ?').bind(slug).first<{ pages_project: string }>();
  if (!app) return json({ error: 'Not found' }, 404, headers);

  await deletePagesProject(env, app.pages_project);
  await env.REGISTRY_DB.prepare("UPDATE apps SET status = 'deleted' WHERE slug = ?").bind(slug).run();

  return json({ success: true }, 200, headers);
}

async function handleListApps(env: Env, headers: Record<string, string>): Promise<Response> {
  const apps = await env.REGISTRY_DB.prepare(`
    SELECT slug, name, pages_url, status, deploy_count, last_deployed_at
    FROM apps WHERE status != 'deleted'
    ORDER BY last_deployed_at DESC
  `).all();

  return json({
    count: apps.results.length,
    apps: apps.results.map((a: any) => ({
      slug: a.slug,
      name: a.name,
      url: `https://${a.slug}.usenavi.app`,
      pagesUrl: `https://${a.pages_url}`,
      status: a.status,
      deployCount: a.deploy_count,
    })),
  }, 200, headers);
}

// --- Utilities ---

function randomId(len = 12): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < len; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function json(data: any, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function notFoundPage(subdomain: string): Response {
  return new Response(`
<!DOCTYPE html>
<html>
<head>
  <title>Not Found - Navi Cloud</title>
  <style>
    body { font-family: system-ui; background: #0f0f23; color: white; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .c { text-align: center; }
    h1 { font-size: 4rem; opacity: 0.3; margin: 0; }
    code { background: rgba(139,92,246,0.2); padding: 2px 8px; border-radius: 4px; color: #8b5cf6; }
    a { color: #8b5cf6; }
  </style>
</head>
<body>
  <div class="c">
    <h1>404</h1>
    <p><code>${subdomain}.usenavi.app</code> doesn't exist.</p>
    <p><a href="https://usenavi.app">Get Navi</a></p>
  </div>
</body>
</html>`, { status: 404, headers: { 'Content-Type': 'text/html' } });
}

function errorPage(subdomain: string): Response {
  return new Response(`
<!DOCTYPE html>
<html>
<head>
  <title>Error - Navi Cloud</title>
  <style>
    body { font-family: system-ui; background: #0f0f23; color: white; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    h1 { color: #ef4444; }
  </style>
</head>
<body>
  <div style="text-align:center">
    <h1>Error</h1>
    <p>Failed to load ${subdomain}.usenavi.app</p>
  </div>
</body>
</html>`, { status: 502, headers: { 'Content-Type': 'text/html' } });
}
