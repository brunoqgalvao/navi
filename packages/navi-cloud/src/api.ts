/**
 * Navi Cloud - API Worker
 *
 * Handles deployment requests from Navi desktop app.
 * Creates user Workers in the dispatch namespace and D1 databases.
 */

export interface Env {
  REGISTRY_DB: D1Database;
  DEPLOY_SECRET: string;
  CLOUDFLARE_API_TOKEN: string;
  CLOUDFLARE_ACCOUNT_ID: string;
}

interface DeployRequest {
  slug: string;
  name?: string;
  framework?: 'vite-react' | 'static';
  needsDatabase?: boolean;
  needsAuth?: boolean;
  files: Array<{
    path: string;
    content: string; // base64 encoded
  }>;
}

interface AppRecord {
  id: string;
  slug: string;
  worker_name: string;
  d1_database_id: string | null;
  d1_database_name: string | null;
  deploy_count: number;
}

const CF_API = 'https://api.cloudflare.com/client/v4';
const DISPATCH_NAMESPACE = 'navi-user-apps';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Auth check
    const authHeader = request.headers.get('Authorization');
    if (authHeader !== `Bearer ${env.DEPLOY_SECRET}`) {
      return json({ error: 'Unauthorized' }, 401, corsHeaders);
    }

    try {
      // Routes
      if (url.pathname === '/deploy' && request.method === 'POST') {
        return await handleDeploy(request, env, corsHeaders);
      }

      if (url.pathname.match(/^\/deploy\/[\w-]+$/) && request.method === 'GET') {
        const slug = url.pathname.split('/')[2];
        return await handleGetApp(slug, env, corsHeaders);
      }

      if (url.pathname.match(/^\/deploy\/[\w-]+$/) && request.method === 'DELETE') {
        const slug = url.pathname.split('/')[2];
        return await handleDeleteApp(slug, env, corsHeaders);
      }

      if (url.pathname === '/apps' && request.method === 'GET') {
        return await handleListApps(env, corsHeaders);
      }

      return json({ error: 'Not found' }, 404, corsHeaders);
    } catch (error) {
      console.error('API Error:', error);
      return json(
        { error: error instanceof Error ? error.message : 'Internal error' },
        500,
        corsHeaders
      );
    }
  },
};

async function handleDeploy(
  request: Request,
  env: Env,
  headers: Record<string, string>
): Promise<Response> {
  const body = (await request.json()) as DeployRequest;
  const { slug, name, framework = 'vite-react', needsDatabase = false, needsAuth = false, files } = body;

  // Validate
  if (!slug || !files?.length) {
    return json({ error: 'slug and files are required' }, 400, headers);
  }

  if (!/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(slug)) {
    return json({
      error: 'Invalid slug. Must be 3-30 chars, lowercase alphanumeric with hyphens, start/end with alphanumeric.'
    }, 400, headers);
  }

  // Reserved slugs
  const reserved = ['www', 'api', 'admin', 'app', 'dashboard', 'docs', 'mail', 'smtp', 'ftp', 'navi', 'cloud'];
  if (reserved.includes(slug)) {
    return json({ error: 'This name is reserved' }, 400, headers);
  }

  // Check if app exists
  const existing = await env.REGISTRY_DB.prepare(
    'SELECT id, slug, worker_name, d1_database_id, d1_database_name, deploy_count FROM apps WHERE slug = ?'
  ).bind(slug).first<AppRecord>();

  const appId = existing?.id || generateId();
  const workerName = existing?.worker_name || `navi-${slug}-${generateId(6)}`;
  let d1DatabaseId = existing?.d1_database_id || null;
  let d1DatabaseName = existing?.d1_database_name || null;

  // Create D1 database if needed and doesn't exist
  if (needsDatabase && !d1DatabaseId) {
    const dbName = `navi-${slug}-db`;
    const db = await createD1Database(env, dbName);
    d1DatabaseId = db.uuid;
    d1DatabaseName = dbName;
  }

  // Generate the user Worker code
  const workerCode = generateWorkerCode(files, framework, needsAuth, d1DatabaseId);

  // Upload to dispatch namespace
  await uploadUserWorker(env, workerName, workerCode, d1DatabaseId);

  // Update registry
  const now = new Date().toISOString();

  if (existing) {
    await env.REGISTRY_DB.prepare(`
      UPDATE apps SET
        deploy_count = deploy_count + 1,
        last_deployed_at = ?,
        updated_at = ?,
        status = 'live',
        has_auth = ?
      WHERE slug = ?
    `).bind(now, now, needsAuth, slug).run();
  } else {
    await env.REGISTRY_DB.prepare(`
      INSERT INTO apps (id, slug, name, worker_name, d1_database_id, d1_database_name, framework, has_auth, status, last_deployed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'live', ?)
    `).bind(appId, slug, name || slug, workerName, d1DatabaseId, d1DatabaseName, framework, needsAuth, now).run();
  }

  // Log deployment
  await env.REGISTRY_DB.prepare(`
    INSERT INTO deployments (id, app_id, status, files_count, completed_at)
    VALUES (?, ?, 'live', ?, ?)
  `).bind(generateId(), appId, files.length, now).run();

  return json({
    success: true,
    url: `https://${slug}.usenavi.app`,
    slug,
    deployCount: (existing?.deploy_count || 0) + 1,
    database: d1DatabaseId ? { id: d1DatabaseId, name: d1DatabaseName } : null,
    hasAuth: needsAuth,
  }, 200, headers);
}

async function handleGetApp(
  slug: string,
  env: Env,
  headers: Record<string, string>
): Promise<Response> {
  const app = await env.REGISTRY_DB.prepare(`
    SELECT * FROM apps WHERE slug = ?
  `).bind(slug).first();

  if (!app) {
    return json({ error: 'App not found' }, 404, headers);
  }

  const deployments = await env.REGISTRY_DB.prepare(`
    SELECT * FROM deployments WHERE app_id = ? ORDER BY started_at DESC LIMIT 5
  `).bind(app.id).all();

  return json({
    app: {
      slug: app.slug,
      name: app.name,
      url: `https://${app.slug}.usenavi.app`,
      framework: app.framework,
      hasAuth: app.has_auth,
      hasDatabase: !!app.d1_database_id,
      status: app.status,
      deployCount: app.deploy_count,
      lastDeployedAt: app.last_deployed_at,
      createdAt: app.created_at,
    },
    recentDeployments: deployments.results,
  }, 200, headers);
}

async function handleDeleteApp(
  slug: string,
  env: Env,
  headers: Record<string, string>
): Promise<Response> {
  const app = await env.REGISTRY_DB.prepare(
    'SELECT id, worker_name, d1_database_id FROM apps WHERE slug = ?'
  ).bind(slug).first<{ id: string; worker_name: string; d1_database_id: string | null }>();

  if (!app) {
    return json({ error: 'App not found' }, 404, headers);
  }

  // Delete user Worker from namespace
  await deleteUserWorker(env, app.worker_name);

  // Delete D1 database if exists
  if (app.d1_database_id) {
    await deleteD1Database(env, app.d1_database_id);
  }

  // Mark as deleted
  await env.REGISTRY_DB.prepare(`
    UPDATE apps SET status = 'deleted', updated_at = ? WHERE slug = ?
  `).bind(new Date().toISOString(), slug).run();

  return json({ success: true }, 200, headers);
}

async function handleListApps(
  env: Env,
  headers: Record<string, string>
): Promise<Response> {
  const apps = await env.REGISTRY_DB.prepare(`
    SELECT slug, name, framework, has_auth, d1_database_id, status, deploy_count, last_deployed_at, created_at
    FROM apps
    WHERE status != 'deleted'
    ORDER BY last_deployed_at DESC
  `).all();

  return json({
    count: apps.results.length,
    apps: apps.results.map((app: any) => ({
      slug: app.slug,
      name: app.name,
      url: `https://${app.slug}.usenavi.app`,
      framework: app.framework,
      hasAuth: app.has_auth,
      hasDatabase: !!app.d1_database_id,
      status: app.status,
      deployCount: app.deploy_count,
      lastDeployedAt: app.last_deployed_at,
      createdAt: app.created_at,
    })),
  }, 200, headers);
}

// --- Cloudflare API Helpers ---

async function createD1Database(env: Env, name: string): Promise<{ uuid: string }> {
  const response = await fetch(`${CF_API}/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/d1/database`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name }),
  });

  const data = await response.json() as { success: boolean; result: { uuid: string }; errors: any[] };

  if (!data.success) {
    throw new Error(`Failed to create D1 database: ${JSON.stringify(data.errors)}`);
  }

  return data.result;
}

async function deleteD1Database(env: Env, databaseId: string): Promise<void> {
  await fetch(`${CF_API}/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${databaseId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
    },
  });
}

async function uploadUserWorker(
  env: Env,
  workerName: string,
  code: string,
  d1DatabaseId: string | null
): Promise<void> {
  // Build metadata for the worker
  const metadata: any = {
    main_module: 'worker.js',
  };

  // Add D1 binding if database exists
  if (d1DatabaseId) {
    metadata.bindings = [
      {
        type: 'd1',
        name: 'DB',
        id: d1DatabaseId,
      },
    ];
  }

  // Create form data with worker script
  const formData = new FormData();
  formData.append('metadata', JSON.stringify(metadata));
  formData.append('worker.js', new Blob([code], { type: 'application/javascript+module' }), 'worker.js');

  const response = await fetch(
    `${CF_API}/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/dispatch/namespaces/${DISPATCH_NAMESPACE}/scripts/${workerName}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
      },
      body: formData,
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to upload user worker: ${error}`);
  }
}

async function deleteUserWorker(env: Env, workerName: string): Promise<void> {
  await fetch(
    `${CF_API}/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/dispatch/namespaces/${DISPATCH_NAMESPACE}/scripts/${workerName}`,
    {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
      },
    }
  );
}

// --- Code Generation ---

function generateWorkerCode(
  files: Array<{ path: string; content: string }>,
  framework: string,
  needsAuth: boolean,
  d1DatabaseId: string | null
): string {
  // Build a file map from the uploaded files
  const fileMap: Record<string, string> = {};
  for (const file of files) {
    fileMap[file.path] = file.content;
  }

  // Generate worker that serves the static files
  return `
// Auto-generated Navi Cloud Worker
// Framework: ${framework}
// Has Auth: ${needsAuth}
// Has Database: ${!!d1DatabaseId}

const FILES = ${JSON.stringify(fileMap)};

const MIME_TYPES = {
  'html': 'text/html',
  'css': 'text/css',
  'js': 'application/javascript',
  'mjs': 'application/javascript',
  'json': 'application/json',
  'png': 'image/png',
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'gif': 'image/gif',
  'svg': 'image/svg+xml',
  'ico': 'image/x-icon',
  'woff': 'font/woff',
  'woff2': 'font/woff2',
  'ttf': 'font/ttf',
  'eot': 'application/vnd.ms-fontobject',
};

function getMimeType(path) {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  return MIME_TYPES[ext] || 'application/octet-stream';
}

function decodeBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let path = url.pathname.slice(1) || 'index.html';

    // Try exact match first
    if (FILES[path]) {
      const content = decodeBase64(FILES[path]);
      return new Response(content, {
        headers: {
          'Content-Type': getMimeType(path),
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    // Try with .html extension
    if (FILES[path + '.html']) {
      const content = decodeBase64(FILES[path + '.html']);
      return new Response(content, {
        headers: {
          'Content-Type': 'text/html',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    // Try index.html in directory
    if (FILES[path + '/index.html']) {
      const content = decodeBase64(FILES[path + '/index.html']);
      return new Response(content, {
        headers: {
          'Content-Type': 'text/html',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    // SPA fallback - serve index.html for unknown routes
    if (FILES['index.html']) {
      const content = decodeBase64(FILES['index.html']);
      return new Response(content, {
        headers: {
          'Content-Type': 'text/html',
          'Cache-Control': 'no-cache',
        },
      });
    }

    return new Response('Not Found', { status: 404 });
  },
};
`;
}

// --- Utilities ---

function generateId(length = 12): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function json(data: any, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}
