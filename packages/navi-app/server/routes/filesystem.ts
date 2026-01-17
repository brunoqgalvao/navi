import { json, corsHeaders } from "../utils/response";

export async function handleFilesystemRoutes(url: URL, method: string, req: Request): Promise<Response | null> {
  if (url.pathname === "/api/fs/read") {
    const filePath = url.searchParams.get("path");
    const raw = url.searchParams.get("raw") === "true";
    if (!filePath) {
      return json({ error: "Path required" }, 400);
    }
    try {
      const file = Bun.file(filePath);
      const exists = await file.exists();
      if (!exists) {
        return json({ error: "File not found" }, 404);
      }

      if (raw) {
        const ext = filePath.split(".").pop()?.toLowerCase() || "";
        const mimeTypes: Record<string, string> = {
          pdf: "application/pdf",
          png: "image/png",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          gif: "image/gif",
          webp: "image/webp",
          svg: "image/svg+xml",
          ico: "image/x-icon",
          bmp: "image/bmp",
          mp3: "audio/mpeg",
          wav: "audio/wav",
          ogg: "audio/ogg",
          flac: "audio/flac",
          aac: "audio/aac",
          m4a: "audio/mp4",
          wma: "audio/x-ms-wma",
          mp4: "video/mp4",
          webm: "video/webm",
          mov: "video/quicktime",
          avi: "video/x-msvideo",
          mkv: "video/x-matroska",
          m4v: "video/mp4",
          ogv: "video/ogg",
          // 3D models
          stl: "model/stl",
          glb: "model/gltf-binary",
          gltf: "model/gltf+json",
        };
        const contentType = mimeTypes[ext] || "application/octet-stream";
        return new Response(file, {
          headers: { "Content-Type": contentType, ...corsHeaders },
        });
      }

      const content = await file.text();
      const ext = filePath.split(".").pop()?.toLowerCase() || "";
      return json({ content, path: filePath, extension: ext });
    } catch (e) {
      return json({ error: "Failed to read file" }, 500);
    }
  }

  // Binary file read endpoint (for xlsx, etc.)
  if (url.pathname === "/api/fs/read-binary") {
    const filePath = url.searchParams.get("path");
    if (!filePath) {
      return json({ error: "Path required" }, 400);
    }
    try {
      const file = Bun.file(filePath);
      const exists = await file.exists();
      if (!exists) {
        return json({ error: "File not found" }, 404);
      }
      const arrayBuffer = await file.arrayBuffer();
      return new Response(arrayBuffer, {
        headers: {
          "Content-Type": "application/octet-stream",
          ...corsHeaders,
        },
      });
    } catch (e) {
      return json({ error: "Failed to read binary file" }, 500);
    }
  }

  if (url.pathname === "/api/fs/list") {
    const dirPath = url.searchParams.get("path") || process.cwd();
    try {
      const fs = await import("fs/promises");
      const path = await import("path");
      const items = await fs.readdir(dirPath, { withFileTypes: true });
      const entries = items
        .filter(item => !item.name.startsWith("."))
        .map(item => ({
          name: item.name,
          type: item.isDirectory() ? "directory" as const : "file" as const,
          path: path.join(dirPath, item.name),
        }))
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
      return json({ entries, path: dirPath });
    } catch (e) {
      return json({ error: "Failed to list directory" }, 500);
    }
  }

  if (url.pathname === "/api/fs/mkdir" && method === "POST") {
    const body = await req.json();
    const dirPath = body.path;
    if (!dirPath) {
      return json({ error: "Path required" }, 400);
    }
    try {
      const fs = await import("fs/promises");
      await fs.mkdir(dirPath, { recursive: true });
      return json({ success: true, path: dirPath });
    } catch (e: any) {
      console.error("[fs/mkdir] Failed:", e);
      return json({ error: e.message || "Failed to create directory" }, 500);
    }
  }

  if (url.pathname === "/api/fs/reveal" && method === "POST") {
    const body = await req.json();
    const filePath = body.path;
    if (!filePath) {
      return json({ error: "Path required" }, 400);
    }
    try {
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);
      const platform = process.platform;

      if (platform === "darwin") {
        await execAsync(`open -R "${filePath}"`);
      } else if (platform === "win32") {
        await execAsync(`explorer /select,"${filePath}"`);
      } else {
        await execAsync(`xdg-open "${filePath.split("/").slice(0, -1).join("/")}"`);
      }
      return json({ success: true });
    } catch (e) {
      return json({ error: "Failed to reveal file" }, 500);
    }
  }

  if (url.pathname === "/api/fs/open-editor" && method === "POST") {
    const body = await req.json();
    const { path: filePath, editor } = body;
    if (!filePath) {
      return json({ error: "Path required" }, 400);
    }
    try {
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);

      const editorCommands: Record<string, string> = {
        code: `code "${filePath}"`,
        cursor: `cursor "${filePath}"`,
        zed: `zed "${filePath}"`,
        terminal: process.platform === "darwin"
          ? `open -a Terminal "${filePath}"`
          : process.platform === "win32"
          ? `start cmd /K "cd /d ${filePath}"`
          : `x-terminal-emulator --working-directory="${filePath}"`,
      };

      const command = editorCommands[editor] || editorCommands.code;
      await execAsync(command);
      return json({ success: true });
    } catch (e) {
      return json({ error: "Failed to open editor" }, 500);
    }
  }

  if (url.pathname === "/api/fs/upload" && method === "POST") {
    try {
      const formData = await req.formData();
      const file = formData.get("file") as File;
      const targetDir = formData.get("targetDir") as string;

      if (!file || !targetDir) {
        return json({ error: "File and targetDir required" }, 400);
      }

      const fs = await import("fs/promises");
      const { join } = await import("path");

      // Ensure target directory exists
      await fs.mkdir(targetDir, { recursive: true });

      const filePath = join(targetDir, file.name);
      const buffer = await file.arrayBuffer();
      await fs.writeFile(filePath, Buffer.from(buffer));

      return json({ success: true, path: filePath, name: file.name });
    } catch (e) {
      console.error("Upload error:", e);
      return json({ error: "Failed to upload file" }, 500);
    }
  }

  // Write file content (for inline editing)
  if (url.pathname === "/api/fs/write" && method === "POST") {
    const body = await req.json();
    const { path: filePath, content } = body;

    if (!filePath) {
      return json({ error: "Path required" }, 400);
    }
    if (content === undefined) {
      return json({ error: "Content required" }, 400);
    }

    try {
      const fs = await import("fs/promises");
      await fs.writeFile(filePath, content, "utf-8");
      return json({ success: true, path: filePath });
    } catch (e: any) {
      console.error("[fs/write] Failed:", e);
      return json({ error: e.message || "Failed to write file" }, 500);
    }
  }

  // Apply a project template to a target directory
  if (url.pathname === "/api/fs/apply-template" && method === "POST") {
    const body = await req.json();
    const { templateId, targetPath } = body;

    if (!templateId || !targetPath) {
      return json({ error: "templateId and targetPath required" }, 400);
    }

    try {
      const fs = await import("fs/promises");
      const path = await import("path");

      // Hardcoded templates directory path
      // process.cwd() is packages/navi-app, so we go up 2 levels to repo root
      // Use path.resolve to get absolute path
      const TEMPLATES_BASE = process.env.TEMPLATES_DIR ||
        path.resolve(process.cwd(), "..", "..", ".claude", "templates");

      const templatePath = path.join(TEMPLATES_BASE, templateId);

      // Verify template exists
      try {
        await fs.access(templatePath);
      } catch (accessErr) {
        console.error("[fs/apply-template] Template not found:", templatePath, accessErr);
        return json({ error: `Template "${templateId}" not found at ${templatePath}` }, 404);
      }

      // Create target directory if it doesn't exist
      await fs.mkdir(targetPath, { recursive: true });

      // Copy CLAUDE.md if it exists
      const claudeMdSrc = path.join(templatePath, "CLAUDE.md");
      const claudeMdDest = path.join(targetPath, "CLAUDE.md");
      try {
        await fs.access(claudeMdSrc);
        await fs.copyFile(claudeMdSrc, claudeMdDest);
      } catch {
        // CLAUDE.md doesn't exist in template, that's okay
      }

      // Copy .claude/agents directory if it exists (but NOT skills - those come from library)
      const agentsDirSrc = path.join(templatePath, ".claude", "agents");
      const agentsDirDest = path.join(targetPath, ".claude", "agents");
      try {
        await fs.access(agentsDirSrc);
        await fs.mkdir(path.join(targetPath, ".claude"), { recursive: true });
        await copyDirRecursive(agentsDirSrc, agentsDirDest);
      } catch {
        // agents dir doesn't exist in template, that's okay
      }

      // Read skill slugs from template (we'll return these so frontend can enable them)
      const skillsDirSrc = path.join(templatePath, ".claude", "skills");
      let skillSlugs: string[] = [];
      try {
        await fs.access(skillsDirSrc);
        const skillEntries = await fs.readdir(skillsDirSrc, { withFileTypes: true });
        skillSlugs = skillEntries
          .filter(e => e.isDirectory())
          .map(e => e.name);
      } catch {
        // skills dir doesn't exist in template
      }

      return json({
        success: true,
        templateId,
        targetPath,
        skillSlugs, // Frontend should enable these from the library
        message: `Template "${templateId}" applied successfully`
      });
    } catch (e: any) {
      console.error("[fs/apply-template] Failed:", e);
      return json({ error: e.message || "Failed to apply template" }, 500);
    }
  }

  return null;
}

// Helper to recursively copy a directory
async function copyDirRecursive(src: string, dest: string): Promise<void> {
  const fs = await import("fs/promises");
  const path = await import("path");

  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirRecursive(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}
