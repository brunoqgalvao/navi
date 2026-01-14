/**
 * Deploy Routes - Navi Cloud Integration
 * @experimental This feature is gated behind the "Deploy to Cloud" experimental setting
 *
 * Handles deployment of apps from the local machine to Navi Cloud.
 * Acts as a proxy to the Navi Cloud API with local file reading capabilities.
 */

import { json, error } from "../utils/response";
import { readdir, readFile, stat } from "fs/promises";
import { join, relative } from "path";

// Feature flag check - reads from query param passed by frontend
// The frontend checks localStorage for the experimental setting

// Navi Cloud API endpoint
const NAVI_CLOUD_API = process.env.NAVI_CLOUD_API || "https://api.usenavi.app";
const NAVI_CLOUD_SECRET = process.env.NAVI_CLOUD_SECRET || "";

interface DeployRequest {
  projectPath: string;
  slug?: string;
  name?: string;
  framework?: "static" | "vite-react";
  needsDatabase?: boolean;
  needsAuth?: boolean;
  outputDir?: string;
}

interface FileEntry {
  path: string;
  content: string; // base64
}

// Max file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function handleDeployRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  // Check if feature is enabled via query param (passed from frontend)
  // The skill also has its own check but API routes are additionally gated
  const featureEnabled = url.searchParams.get("experimentalEnabled") === "true";

  // Deploy an app
  if (url.pathname === "/api/deploy" && method === "POST") {
    if (!featureEnabled) {
      return error("Deploy to Cloud is an experimental feature. Enable it in Settings → Experimental to use this feature.", 403);
    }
    const body = (await req.json()) as DeployRequest;
    return await handleDeploy(body);
  }

  // Get deploy status
  if (url.pathname.match(/^\/api\/deploy\/[\w-]+$/) && method === "GET") {
    const slug = url.pathname.split("/")[3];
    return await handleGetStatus(slug);
  }

  // List deployed apps
  if (url.pathname === "/api/deploys" && method === "GET") {
    return await handleListDeploys();
  }

  // Delete a deployment
  if (url.pathname.match(/^\/api\/deploy\/[\w-]+$/) && method === "DELETE") {
    const slug = url.pathname.split("/")[3];
    return await handleDelete(slug);
  }

  // Detect framework
  if (url.pathname === "/api/deploy/detect" && method === "POST") {
    const body = (await req.json()) as { projectPath: string };
    return await handleDetectFramework(body.projectPath);
  }

  return null;
}

async function handleDeploy(body: DeployRequest): Promise<Response> {
  const { projectPath, slug, name, framework, needsDatabase, needsAuth, outputDir } = body;

  if (!projectPath) {
    return error("projectPath is required", 400);
  }

  try {
    // Step 1: Detect framework if not specified
    const detectedFramework = framework || (await detectFramework(projectPath));

    // Step 2: Determine output directory
    const buildDir = outputDir || getBuildDir(detectedFramework, projectPath);

    // Step 3: Collect files from build directory
    const files = await collectFiles(buildDir);

    if (files.length === 0) {
      return error(
        `No files found in ${buildDir}. Did you run 'bun run build'?`,
        400
      );
    }

    // Calculate total size
    const totalSize = files.reduce((sum, f) => sum + f.content.length * 0.75, 0); // base64 is ~33% larger

    // Step 4: Generate slug if not provided
    const deploySlug = slug || generateSlug(projectPath);

    // Step 5: Deploy to Navi Cloud
    const response = await fetch(`${NAVI_CLOUD_API}/deploy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${NAVI_CLOUD_SECRET}`,
      },
      body: JSON.stringify({
        slug: deploySlug,
        name: name || deploySlug,
        framework: detectedFramework,
        needsDatabase: needsDatabase || false,
        needsAuth: needsAuth || false,
        files,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: "Unknown error" }));
      return error((err as any).error || "Deploy failed", response.status);
    }

    const result = await response.json() as any;

    return json({
      success: true,
      url: result.url,
      slug: result.slug,
      deployCount: result.deployCount,
      database: result.database,
      hasAuth: result.hasAuth,
      filesDeployed: files.length,
      totalSize: Math.round(totalSize),
      framework: detectedFramework,
    });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Deploy failed", 500);
  }
}

async function handleGetStatus(slug: string): Promise<Response> {
  try {
    const response = await fetch(`${NAVI_CLOUD_API}/deploy/${slug}`, {
      headers: {
        Authorization: `Bearer ${NAVI_CLOUD_SECRET}`,
      },
    });

    if (!response.ok) {
      return error("App not found", 404);
    }

    const data = await response.json();
    return json(data);
  } catch (err) {
    return error("Failed to get status", 500);
  }
}

async function handleListDeploys(): Promise<Response> {
  try {
    const response = await fetch(`${NAVI_CLOUD_API}/apps`, {
      headers: {
        Authorization: `Bearer ${NAVI_CLOUD_SECRET}`,
      },
    });

    if (!response.ok) {
      return error("Failed to list apps", 500);
    }

    const data = await response.json();
    return json(data);
  } catch (err) {
    return error("Failed to list apps", 500);
  }
}

async function handleDelete(slug: string): Promise<Response> {
  try {
    const response = await fetch(`${NAVI_CLOUD_API}/deploy/${slug}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${NAVI_CLOUD_SECRET}`,
      },
    });

    if (!response.ok) {
      return error("Failed to delete", response.status);
    }

    return json({ success: true });
  } catch (err) {
    return error("Failed to delete", 500);
  }
}

async function handleDetectFramework(projectPath: string): Promise<Response> {
  const framework = await detectFramework(projectPath);
  const buildDir = getBuildDir(framework, projectPath);
  const buildCommand = getBuildCommand(framework);

  return json({
    framework,
    buildDir,
    buildCommand,
    needsBuild: framework !== "static",
  });
}

// Helper: Detect framework from project files
async function detectFramework(projectPath: string): Promise<"static" | "vite-react"> {
  try {
    const pkgPath = join(projectPath, "package.json");
    const pkgContent = await readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(pkgContent);

    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    // Check for Vite (covers React, Vue, Svelte with Vite)
    if (deps["vite"]) return "vite-react";

    return "static";
  } catch {
    return "static";
  }
}

// Helper: Get build output directory
function getBuildDir(framework: string, projectPath: string): string {
  switch (framework) {
    case "vite-react":
      return join(projectPath, "dist");
    default:
      return projectPath;
  }
}

// Helper: Get build command
function getBuildCommand(framework: string): string | null {
  switch (framework) {
    case "vite-react":
      return "bun run build";
    default:
      return null;
  }
}

// Helper: Collect all files from a directory
async function collectFiles(
  dirPath: string,
  basePath?: string
): Promise<FileEntry[]> {
  const files: FileEntry[] = [];
  const base = basePath || dirPath;

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);

      // Skip node_modules, hidden files, and common non-deployable files
      if (
        entry.name.startsWith(".") ||
        entry.name === "node_modules" ||
        entry.name === "src" ||
        entry.name.endsWith(".map")
      ) {
        continue;
      }

      if (entry.isDirectory()) {
        const subFiles = await collectFiles(fullPath, base);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        const stats = await stat(fullPath);

        // Skip large files
        if (stats.size > MAX_FILE_SIZE) {
          continue;
        }

        const content = await readFile(fullPath);
        const relativePath = relative(base, fullPath);

        files.push({
          path: relativePath,
          content: content.toString("base64"),
        });
      }
    }
  } catch (err) {
    console.error(`[Deploy] Error reading ${dirPath}:`, err);
  }

  return files;
}

// Helper: Generate slug from project path
function generateSlug(projectPath: string): string {
  const name = projectPath.split("/").pop() || "app";
  let slug = name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  // Ensure minimum length
  if (slug.length < 3) {
    slug = slug + "-app";
  }

  return slug.slice(0, 30);
}
