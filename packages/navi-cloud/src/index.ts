/**
 * Navi Cloud - Deploy API
 *
 * Handles deployment of apps to Cloudflare Pages with D1 databases.
 * Called from Navi desktop app when user says "ship it".
 */

import { CloudflarePages } from './cloudflare-pages';
import { CloudflareD1 } from './cloudflare-d1';

export interface Env {
  DB: D1Database;
  CLOUDFLARE_API_TOKEN: string;
  CLOUDFLARE_ACCOUNT_ID: string;
  DEPLOY_SECRET: string;
  ENVIRONMENT: string;
}

interface DeployRequest {
  slug: string;
  name?: string;
  framework?: 'static' | 'sveltekit' | 'nextjs' | 'remix';
  needsDatabase?: boolean;
  files: Array<{
    path: string;
    content: string; // base64 encoded
  }>;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers for Navi desktop app
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
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }

    try {
      // Route handling
      if (url.pathname === '/deploy' && request.method === 'POST') {
        return await handleDeploy(request, env, corsHeaders);
      }

      if (url.pathname.startsWith('/deploy/') && request.method === 'GET') {
        const slug = url.pathname.split('/')[2];
        return await handleGetStatus(slug, env, corsHeaders);
      }

      if (url.pathname.startsWith('/deploy/') && request.method === 'DELETE') {
        const slug = url.pathname.split('/')[2];
        return await handleDelete(slug, env, corsHeaders);
      }

      if (url.pathname === '/apps' && request.method === 'GET') {
        return await handleListApps(env, corsHeaders);
      }

      return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
    } catch (error) {
      console.error('API Error:', error);
      return Response.json(
        { error: error instanceof Error ? error.message : 'Internal error' },
        { status: 500, headers: corsHeaders }
      );
    }
  },
};

async function handleDeploy(request: Request, env: Env, headers: HeadersInit): Promise<Response> {
  const body = await request.json() as DeployRequest;
  const { slug, name, framework = 'static', needsDatabase = false, files } = body;

  if (!slug || !files?.length) {
    return Response.json({ error: 'slug and files are required' }, { status: 400, headers });
  }

  // Validate slug (lowercase, alphanumeric, hyphens)
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) || slug.length < 3 || slug.length > 30) {
    return Response.json({
      error: 'Invalid slug. Must be 3-30 chars, lowercase alphanumeric with hyphens.'
    }, { status: 400, headers });
  }

  const pages = new CloudflarePages(env.CLOUDFLARE_API_TOKEN, env.CLOUDFLARE_ACCOUNT_ID);
  const d1 = new CloudflareD1(env.CLOUDFLARE_API_TOKEN, env.CLOUDFLARE_ACCOUNT_ID);

  // Check if app already exists
  const existing = await env.DB.prepare('SELECT * FROM apps WHERE slug = ?').bind(slug).first();

  let cfProject: string;
  let d1DatabaseId: string | null = null;
  let d1DatabaseName: string | null = null;

  if (existing) {
    // Update existing app
    cfProject = existing.cf_pages_project as string;
    d1DatabaseId = existing.cf_d1_database_id as string | null;
    d1DatabaseName = existing.cf_d1_database_name as string | null;
  } else {
    // Create new Pages project
    const projectName = `navi-${slug}-${generateId(6)}`;
    await pages.createProject(projectName);
    cfProject = projectName;

    // Create D1 database if needed
    if (needsDatabase) {
      const dbName = `navi-${slug}-db`;
      const db = await d1.createDatabase(dbName);
      d1DatabaseId = db.uuid;
      d1DatabaseName = dbName;
    }
  }

  // Deploy files to Pages
  const deployment = await pages.deploy(cfProject, files);

  // Update or insert app record
  const now = new Date().toISOString();

  if (existing) {
    await env.DB.prepare(`
      UPDATE apps SET
        deploy_count = deploy_count + 1,
        last_deployed_at = ?,
        updated_at = ?,
        status = 'live'
      WHERE slug = ?
    `).bind(now, now, slug).run();
  } else {
    await env.DB.prepare(`
      INSERT INTO apps (slug, name, cf_pages_project, cf_pages_url, cf_d1_database_id, cf_d1_database_name, framework, status, last_deployed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'live', ?)
    `).bind(
      slug,
      name || slug,
      cfProject,
      `${cfProject}.pages.dev`,
      d1DatabaseId,
      d1DatabaseName,
      framework,
      now
    ).run();
  }

  // Log deployment
  const app = await env.DB.prepare('SELECT id FROM apps WHERE slug = ?').bind(slug).first();
  if (app) {
    await env.DB.prepare(`
      INSERT INTO deployments (app_id, cf_deployment_id, status, completed_at)
      VALUES (?, ?, 'success', ?)
    `).bind(app.id, deployment.id, now).run();
  }

  return Response.json({
    success: true,
    url: `https://${slug}.usenavi.app`,
    pagesUrl: `https://${cfProject}.pages.dev`,
    deploymentId: deployment.id,
    database: d1DatabaseId ? {
      id: d1DatabaseId,
      name: d1DatabaseName,
    } : null,
  }, { headers });
}

async function handleGetStatus(slug: string, env: Env, headers: HeadersInit): Promise<Response> {
  const app = await env.DB.prepare(`
    SELECT * FROM apps WHERE slug = ?
  `).bind(slug).first();

  if (!app) {
    return Response.json({ error: 'App not found' }, { status: 404, headers });
  }

  const deployments = await env.DB.prepare(`
    SELECT * FROM deployments WHERE app_id = ? ORDER BY started_at DESC LIMIT 5
  `).bind(app.id).all();

  return Response.json({
    app: {
      slug: app.slug,
      name: app.name,
      url: `https://${app.slug}.usenavi.app`,
      pagesUrl: `https://${app.cf_pages_url}`,
      framework: app.framework,
      status: app.status,
      deployCount: app.deploy_count,
      lastDeployedAt: app.last_deployed_at,
      createdAt: app.created_at,
      hasDatabase: !!app.cf_d1_database_id,
    },
    recentDeployments: deployments.results,
  }, { headers });
}

async function handleDelete(slug: string, env: Env, headers: HeadersInit): Promise<Response> {
  const app = await env.DB.prepare('SELECT * FROM apps WHERE slug = ?').bind(slug).first();

  if (!app) {
    return Response.json({ error: 'App not found' }, { status: 404, headers });
  }

  const pages = new CloudflarePages(env.CLOUDFLARE_API_TOKEN, env.CLOUDFLARE_ACCOUNT_ID);
  const d1 = new CloudflareD1(env.CLOUDFLARE_API_TOKEN, env.CLOUDFLARE_ACCOUNT_ID);

  // Delete Pages project
  await pages.deleteProject(app.cf_pages_project as string);

  // Delete D1 database if exists
  if (app.cf_d1_database_id) {
    await d1.deleteDatabase(app.cf_d1_database_id as string);
  }

  // Mark as deleted in DB
  await env.DB.prepare(`
    UPDATE apps SET status = 'deleted', updated_at = ? WHERE slug = ?
  `).bind(new Date().toISOString(), slug).run();

  return Response.json({ success: true, message: `App ${slug} deleted` }, { headers });
}

async function handleListApps(env: Env, headers: HeadersInit): Promise<Response> {
  const apps = await env.DB.prepare(`
    SELECT slug, name, cf_pages_url, framework, status, deploy_count, last_deployed_at, created_at
    FROM apps
    WHERE status != 'deleted'
    ORDER BY last_deployed_at DESC
  `).all();

  return Response.json({
    count: apps.results.length,
    apps: apps.results.map(app => ({
      slug: app.slug,
      name: app.name,
      url: `https://${app.slug}.usenavi.app`,
      pagesUrl: `https://${app.cf_pages_url}`,
      framework: app.framework,
      status: app.status,
      deployCount: app.deploy_count,
      lastDeployedAt: app.last_deployed_at,
      createdAt: app.created_at,
    })),
  }, { headers });
}

function generateId(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
