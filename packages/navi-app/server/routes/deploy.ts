/**
 * Deploy Routes - Navi Cloud Integration
 *
 * Handles deployment of apps from the local machine to Navi Cloud.
 * Acts as a proxy to the Navi Cloud API with local file reading capabilities.
 */

import { json, error } from "../utils/response";
import { readdir, readFile, stat } from "fs/promises";
import { join, relative } from "path";

// Navi Cloud API endpoint (will be configured)
const NAVI_CLOUD_API = process.env.NAVI_CLOUD_API || "https://api.usenavi.app";
const NAVI_CLOUD_SECRET = process.env.NAVI_CLOUD_SECRET || "";

interface DeployRequest {
  projectPath: string;
  slug?: string;
  name?: string;
  framework?: "static" | "sveltekit" | "nextjs" | "vite" | "astro";
  needsDatabase?: boolean;
  buildCommand?: string;
  outputDir?: string;
}

interface FileEntry {
  path: string;
  content: string; // base64
}

export async function handleDeployRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  // Deploy an app
  if (url.pathname === "/api/deploy" && method === "POST") {
    const body = (await req.json()) as DeployRequest;
    return await handleDeploy(body);
  }

  // Get deploy status
  if (url.pathname.startsWith("/api/deploy/") && method === "GET") {
    const slug = url.pathname.split("/")[3];
    if (slug) {
      return await handleGetStatus(slug);
    }
  }

  // List deployed apps
  if (url.pathname === "/api/deploys" && method === "GET") {
    return await handleListDeploys();
  }

  // Delete a deployment
  if (url.pathname.startsWith("/api/deploy/") && method === "DELETE") {
    const slug = url.pathname.split("/")[3];
    if (slug) {
      return await handleDelete(slug);
    }
  }

  // Detect framework
  if (url.pathname === "/api/deploy/detect" && method === "POST") {
    const body = (await req.json()) as { projectPath: string };
    return await handleDetectFramework(body.projectPath);
  }

  return null;
}

async function handleDeploy(body: DeployRequest): Promise<Response> {
  const { projectPath, slug, name, framework, needsDatabase, buildCommand, outputDir } = body;

  if (!projectPath) {
    return error("projectPath is required", 400);
  }

  try {
    // Step 1: Detect framework if not specified
    const detectedFramework = framework || (await detectFramework(projectPath));
    console.log(`Detected framework: ${detectedFramework}`);

    // Step 2: Determine output directory
    const buildDir = outputDir || getBuildDir(detectedFramework, projectPath);

    // Step 3: Collect files from build directory
    const files = await collectFiles(buildDir);

    if (files.length === 0) {
      return error(
        `No files found in ${buildDir}. Did you run the build command?`,
        400
      );
    }

    console.log(`Collected ${files.length} files from ${buildDir}`);

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
        files,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: "Unknown error" }));
      return error(err.error || "Deploy failed", response.status);
    }

    const result = await response.json();

    return json({
      success: true,
      url: result.url,
      pagesUrl: result.pagesUrl,
      deploymentId: result.deploymentId,
      database: result.database,
      filesDeployed: files.length,
      framework: detectedFramework,
    });
  } catch (err) {
    console.error("Deploy error:", err);
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
async function detectFramework(
  projectPath: string
): Promise<"static" | "sveltekit" | "nextjs" | "vite" | "astro"> {
  try {
    const pkgPath = join(projectPath, "package.json");
    const pkgContent = await readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(pkgContent);

    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    if (deps["@sveltejs/kit"]) return "sveltekit";
    if (deps["next"]) return "nextjs";
    if (deps["astro"]) return "astro";
    if (deps["vite"]) return "vite";

    return "static";
  } catch {
    return "static";
  }
}

// Helper: Get build output directory
function getBuildDir(
  framework: string,
  projectPath: string
): string {
  switch (framework) {
    case "sveltekit":
      return join(projectPath, "build");
    case "nextjs":
      return join(projectPath, "out");
    case "astro":
      return join(projectPath, "dist");
    case "vite":
      return join(projectPath, "dist");
    default:
      return projectPath;
  }
}

// Helper: Get build command
function getBuildCommand(framework: string): string | null {
  switch (framework) {
    case "sveltekit":
      return "bun run build";
    case "nextjs":
      return "bun run build";
    case "astro":
      return "bun run build";
    case "vite":
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

      // Skip node_modules and hidden files
      if (entry.name.startsWith(".") || entry.name === "node_modules") {
        continue;
      }

      if (entry.isDirectory()) {
        const subFiles = await collectFiles(fullPath, base);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        // Skip files > 25MB
        const stats = await stat(fullPath);
        if (stats.size > 25 * 1024 * 1024) {
          console.warn(`Skipping large file: ${fullPath}`);
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
    console.error(`Error reading directory ${dirPath}:`, err);
  }

  return files;
}

// Helper: Generate slug from project path
function generateSlug(projectPath: string): string {
  const name = projectPath.split("/").pop() || "app";
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
}
