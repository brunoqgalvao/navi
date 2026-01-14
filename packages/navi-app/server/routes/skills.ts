import { spawn } from "child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { json } from "../utils/response";
import {
  projects,
  globalSettings,
  skills as skillsDb,
  enabledSkills as enabledSkillsDb,
  skillVersions,
  SKILL_CATEGORIES,
} from "../db";
import {
  SKILL_LIBRARY_PATH,
  CLAUDE_GLOBAL_SKILLS,
  validateSlug,
  slugify,
  safeJoin,
  calculateSkillHash,
  copyDirRecursive,
  parseSkillMd,
  serializeSkillMd,
  getSkillBody,
  getProjectSkillsDir,
  scanSkillDirectory,
  scanGlobalClaudeSkills,
  getSkillFiles,
  getSkillFilePath,
  EXAMPLE_SKILLS,
  type CreateSkillInput,
  type SkillWithStatus,
} from "../skills";

function bumpPatch(version: string): string {
  const parts = version.split(".").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return "1.0.1";
  return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
}

async function parseSkillContent(
  content: string,
  filename: string,
  useAi: boolean
): Promise<{
  slug?: string;
  name: string;
  description: string;
  body: string;
  allowed_tools?: string[];
  license?: string;
  category?: string;
  tags?: string[];
}> {
  const isMarkdown = filename.endsWith(".md");
  const hasYamlFrontmatter = content.trim().startsWith("---");

  if (isMarkdown && hasYamlFrontmatter) {
    const parsed = parseSkillMd(content);
    if (parsed.frontmatter.name && parsed.frontmatter.description) {
      return {
        name: parsed.frontmatter.name,
        description: parsed.frontmatter.description,
        body: parsed.body,
        allowed_tools: parsed.frontmatter["allowed-tools"],
        license: parsed.frontmatter.license as string | undefined,
      };
    }
  }

  if (useAi) {
    return await convertWithAi(content, filename);
  }

  const lines = content.split("\n");
  let name = filename.replace(/\.(md|txt|json)$/i, "").replace(/[-_]/g, " ");
  let description = "";
  let body = content;

  for (const line of lines) {
    if (line.startsWith("# ")) {
      name = line.slice(2).trim();
      break;
    }
  }

  const firstParagraph = lines.find(l => l.trim() && !l.startsWith("#"));
  if (firstParagraph) {
    description = firstParagraph.trim().slice(0, 200);
  }

  if (!description) {
    description = `Imported from ${filename}`;
  }

  return { name, description, body };
}

async function convertWithAi(content: string, filename: string): Promise<{
  slug?: string;
  name: string;
  description: string;
  body: string;
  allowed_tools?: string[];
  license?: string;
  category?: string;
  tags?: string[];
}> {
  const systemPrompt = `You are a skill converter. Convert the provided content into a Claude Code skill format.

Return a JSON object with these fields:
- name: string (human-readable skill name)
- description: string (1-2 sentence description)
- body: string (the skill instructions in markdown - this is the main content)
- allowed_tools: string[] | null (suggested tools like "Read", "Write", "Edit", "Bash", "Grep", "Glob", etc.)
- category: string | null (e.g., "coding", "testing", "debugging", "documentation")
- tags: string[] | null (relevant tags)

The body should be well-formatted markdown instructions that Claude can follow.
If the content is already skill-like instructions, preserve them.
If it's code or config, create instructions for how/when to use it.

Return ONLY valid JSON, no markdown code blocks.`;

  const userPrompt = `Convert this content from "${filename}" into a skill:

${content.slice(0, 8000)}`;

  try {
    const apiKey = globalSettings.get("anthropicApiKey") as string | null;
    if (!apiKey) {
      throw new Error("No API key configured. Please set an API key in settings.");
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error: ${response.status}`);
    }

    const result = await response.json();
    const text = result.content?.[0]?.text || "";

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("AI did not return valid JSON");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.name || !parsed.description || !parsed.body) {
      throw new Error("AI response missing required fields");
    }

    return {
      name: parsed.name,
      description: parsed.description,
      body: parsed.body,
      allowed_tools: Array.isArray(parsed.allowed_tools) ? parsed.allowed_tools : undefined,
      category: parsed.category || undefined,
      tags: Array.isArray(parsed.tags) ? parsed.tags : undefined,
    };
  } catch (e: any) {
    console.error("AI conversion failed:", e);
    throw new Error(`AI conversion failed: ${e.message}`);
  }
}

export async function handleSkillRoutes(url: URL, method: string, req: Request): Promise<Response | null> {
  if (url.pathname === "/api/skills") {
    if (method === "GET") {
      const allSkills = skillsDb.list();
      const allEnabled = enabledSkillsDb.list();

      const skillsWithStatus: SkillWithStatus[] = allSkills.map((skill) => {
        const globalEnabled = allEnabled.find(
          (e) => e.skill_id === skill.id && e.scope === "global"
        );
        const projectEnabled = allEnabled.filter(
          (e) => e.skill_id === skill.id && e.scope === "project"
        );

        const needsSync = globalEnabled
          ? globalEnabled.library_version !== skill.version || globalEnabled.local_hash !== skill.content_hash
          : false;

        return {
          ...skill,
          allowed_tools: skill.allowed_tools ? JSON.parse(skill.allowed_tools) : null,
          tags: skill.tags ? JSON.parse(skill.tags) : null,
          enabled_globally: !!globalEnabled,
          enabled_projects: projectEnabled.map((e) => e.project_id!),
          needs_sync: needsSync,
        };
      });

      return json(skillsWithStatus);
    }

    if (method === "POST") {
      try {
        const body: CreateSkillInput = await req.json();
        const slug = body.slug || slugify(body.name);
        validateSlug(slug);

        if (skillsDb.getBySlug(slug)) {
          return json({ error: `Skill "${slug}" already exists` }, 400);
        }

        const skillDir = safeJoin(SKILL_LIBRARY_PATH, slug);
        mkdirSync(skillDir, { recursive: true });

        const skillMd = serializeSkillMd({
          frontmatter: {
            name: body.name,
            description: body.description,
            version: "1.0.0",
            "allowed-tools": body.allowed_tools,
            license: body.license,
          },
          body: body.body,
        });

        writeFileSync(join(skillDir, "SKILL.md"), skillMd);

        const contentHash = calculateSkillHash(skillDir);
        const now = Date.now();
        const id = crypto.randomUUID();

        const skill = {
          id,
          slug,
          name: body.name,
          description: body.description,
          version: "1.0.0",
          allowed_tools: body.allowed_tools ? JSON.stringify(body.allowed_tools) : null,
          license: body.license || null,
          category: body.category || null,
          tags: body.tags ? JSON.stringify(body.tags) : null,
          content_hash: contentHash,
          source_type: "local",
          source_url: null,
          source_version: null,
          created_at: now,
          updated_at: now,
        };

        skillsDb.create(skill);

        skillVersions.create({
          id: crypto.randomUUID(),
          skill_id: id,
          version: "1.0.0",
          content_hash: contentHash,
          changelog: "Initial version",
          created_at: now,
        });

        return json({
          ...skill,
          allowed_tools: body.allowed_tools || null,
          tags: body.tags || null,
          enabled_globally: false,
          enabled_projects: [],
        }, 201);
      } catch (e: any) {
        return json({ error: e.message || "Failed to create skill" }, 400);
      }
    }
  }

  const skillFilesMatch = url.pathname.match(/^\/api\/skills\/([^/]+)\/files$/);
  if (skillFilesMatch && method === "GET") {
    const id = skillFilesMatch[1];
    const skill = skillsDb.get(id);
    if (!skill) return json({ error: "Skill not found" }, 404);

    try {
      const result = getSkillFiles(skill.slug);
      return json(result);
    } catch (e: any) {
      return json({ error: e.message || "Failed to get files" }, 500);
    }
  }

  const skillOpenMatch = url.pathname.match(/^\/api\/skills\/([^/]+)\/open$/);
  if (skillOpenMatch && method === "POST") {
    const id = skillOpenMatch[1];
    const skill = skillsDb.get(id);
    if (!skill) return json({ error: "Skill not found" }, 404);

    try {
      const skillPath = getSkillFilePath(skill.slug);
      const body = await req.json().catch(() => ({}));
      const editor = body.editor || "code";

      let cmd: string;
      let args: string[];

      if (editor === "code" || editor === "vscode") {
        cmd = "code";
        args = [skillPath];
      } else if (editor === "cursor") {
        cmd = "cursor";
        args = [skillPath];
      } else if (editor === "zed") {
        cmd = "zed";
        args = [skillPath];
      } else if (editor === "finder" || editor === "reveal") {
        if (process.platform === "darwin") {
          cmd = "open";
          args = ["-R", skillPath];
        } else if (process.platform === "win32") {
          cmd = "explorer";
          args = ["/select,", skillPath];
        } else {
          cmd = "xdg-open";
          args = [skillPath];
        }
      } else {
        return json({ error: `Unknown editor: ${editor}` }, 400);
      }

      spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
      return json({ success: true, path: skillPath, editor });
    } catch (e: any) {
      return json({ error: e.message || "Failed to open" }, 500);
    }
  }

  const skillMatch = url.pathname.match(/^\/api\/skills\/([^/]+)$/);
  if (skillMatch && !["enabled", "scan", "examples", "import", "import-url", "sync-global", "global"].includes(skillMatch[1])) {
    const id = skillMatch[1];
    const skill = skillsDb.get(id);

    if (method === "GET") {
      if (!skill) return json({ error: "Skill not found" }, 404);

      const body = getSkillBody(id, skill.slug);
      const allEnabled = enabledSkillsDb.list().filter((e) => e.skill_id === id);
      const globalEnabled = allEnabled.find((e) => e.scope === "global");
      const projectEnabled = allEnabled.filter((e) => e.scope === "project");

      return json({
        ...skill,
        allowed_tools: skill.allowed_tools ? JSON.parse(skill.allowed_tools) : null,
        tags: skill.tags ? JSON.parse(skill.tags) : null,
        body,
        enabled_globally: !!globalEnabled,
        enabled_projects: projectEnabled.map((e) => e.project_id!),
      });
    }

    if (method === "PUT") {
      if (!skill) return json({ error: "Skill not found" }, 404);

      try {
        const body: Partial<CreateSkillInput> & { version?: string } = await req.json();

        const skillDir = safeJoin(SKILL_LIBRARY_PATH, skill.slug);
        const currentContent = readFileSync(join(skillDir, "SKILL.md"), "utf-8");
        const parsed = parseSkillMd(currentContent);

        if (body.name) parsed.frontmatter.name = body.name;
        if (body.description) parsed.frontmatter.description = body.description;
        if (body.allowed_tools) parsed.frontmatter["allowed-tools"] = body.allowed_tools;
        if (body.license !== undefined) parsed.frontmatter.license = body.license;
        if (body.body !== undefined) parsed.body = body.body;

        const newVersion = body.version || bumpPatch(skill.version);
        parsed.frontmatter.version = newVersion;

        writeFileSync(join(skillDir, "SKILL.md"), serializeSkillMd(parsed));

        const newHash = calculateSkillHash(skillDir);
        const now = Date.now();

        skillsDb.update(id, {
          name: parsed.frontmatter.name,
          description: parsed.frontmatter.description,
          version: newVersion,
          allowed_tools: body.allowed_tools ? JSON.stringify(body.allowed_tools) : skill.allowed_tools,
          license: body.license !== undefined ? body.license : skill.license,
          category: body.category || skill.category,
          tags: body.tags ? JSON.stringify(body.tags) : skill.tags,
          content_hash: newHash,
          updated_at: now,
        });

        skillVersions.create({
          id: crypto.randomUUID(),
          skill_id: id,
          version: newVersion,
          content_hash: newHash,
          changelog: null,
          created_at: now,
        });

        const updated = skillsDb.get(id)!;
        return json({
          ...updated,
          allowed_tools: updated.allowed_tools ? JSON.parse(updated.allowed_tools) : null,
          tags: updated.tags ? JSON.parse(updated.tags) : null,
        });
      } catch (e: any) {
        return json({ error: e.message || "Failed to update skill" }, 400);
      }
    }

    if (method === "DELETE") {
      if (!skill) return json({ error: "Skill not found" }, 404);

      try {
        const enabled = enabledSkillsDb.list().filter((e) => e.skill_id === id);
        for (const e of enabled) {
          if (e.scope === "global") {
            const globalPath = safeJoin(CLAUDE_GLOBAL_SKILLS, skill.slug);
            if (existsSync(globalPath)) rmSync(globalPath, { recursive: true });
          } else if (e.project_id) {
            const proj = projects.get(e.project_id);
            if (proj) {
              const projPath = safeJoin(getProjectSkillsDir(proj.path), skill.slug);
              if (existsSync(projPath)) rmSync(projPath, { recursive: true });
            }
          }
          enabledSkillsDb.deleteById(e.id);
        }

        const skillDir = safeJoin(SKILL_LIBRARY_PATH, skill.slug);
        if (existsSync(skillDir)) rmSync(skillDir, { recursive: true });

        skillsDb.delete(id);
        return json({ success: true });
      } catch (e: any) {
        return json({ error: e.message || "Failed to delete skill" }, 500);
      }
    }
  }

  const skillExportMatch = url.pathname.match(/^\/api\/skills\/([^/]+)\/export$/);
  if (skillExportMatch && method === "GET") {
    const id = skillExportMatch[1];
    const skill = skillsDb.get(id);

    if (!skill) return json({ error: "Skill not found" }, 404);

    try {
      const skillDir = safeJoin(SKILL_LIBRARY_PATH, skill.slug);
      if (!existsSync(skillDir)) {
        return json({ error: "Skill directory not found" }, 404);
      }

      const archiver = await import("archiver");
      const { PassThrough } = await import("stream");

      const archive = archiver.default("zip", { zlib: { level: 9 } });
      const passthrough = new PassThrough();

      archive.pipe(passthrough);
      archive.directory(skillDir, skill.slug);
      archive.finalize();

      const chunks: Buffer[] = [];
      for await (const chunk of passthrough) {
        chunks.push(chunk);
      }
      const zipBuffer = Buffer.concat(chunks);

      return new Response(zipBuffer, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${skill.slug}.zip"`,
        },
      });
    } catch (e: any) {
      return json({ error: e.message || "Export failed" }, 500);
    }
  }

  const skillSyncMatch = url.pathname.match(/^\/api\/skills\/([^/]+)\/sync$/);
  if (skillSyncMatch && method === "POST") {
    const id = skillSyncMatch[1];
    const skill = skillsDb.get(id);

    if (!skill) return json({ error: "Skill not found" }, 404);

    try {
      const body = await req.json();
      const { scope, projectId } = body;

      const sourceDir = safeJoin(SKILL_LIBRARY_PATH, skill.slug);
      let targetDir: string;
      let enabled;

      if (scope === "global") {
        targetDir = safeJoin(CLAUDE_GLOBAL_SKILLS, skill.slug);
        enabled = enabledSkillsDb.get(id, "global");
      } else if (scope === "project" && projectId) {
        const project = projects.get(projectId);
        if (!project) return json({ error: "Project not found" }, 404);
        targetDir = safeJoin(getProjectSkillsDir(project.path), skill.slug);
        enabled = enabledSkillsDb.get(id, "project", projectId);
      } else {
        return json({ error: "Invalid scope" }, 400);
      }

      if (!enabled) {
        return json({ error: "Skill not enabled for this scope" }, 400);
      }

      if (existsSync(targetDir)) {
        rmSync(targetDir, { recursive: true });
      }
      copyDirRecursive(sourceDir, targetDir);

      const newHash = calculateSkillHash(targetDir);
      enabledSkillsDb.update(enabled.id, {
        library_version: skill.version,
        local_hash: newHash,
        has_local_changes: 0,
        updated_at: Date.now(),
      });

      return json({ success: true, hash: newHash });
    } catch (e: any) {
      return json({ error: e.message || "Sync failed" }, 500);
    }
  }

  const skillEnableMatch = url.pathname.match(/^\/api\/skills\/([^/]+)\/enable$/);
  if (skillEnableMatch) {
    const id = skillEnableMatch[1];
    const skill = skillsDb.get(id);

    if (!skill) return json({ error: "Skill not found" }, 404);

    if (method === "POST") {
      try {
        const existing = enabledSkillsDb.get(id, "global");
        if (existing) {
          return json({ error: "Skill already enabled globally" }, 400);
        }

        if (!existsSync(CLAUDE_GLOBAL_SKILLS)) {
          mkdirSync(CLAUDE_GLOBAL_SKILLS, { recursive: true });
        }

        const sourceDir = safeJoin(SKILL_LIBRARY_PATH, skill.slug);
        const targetDir = safeJoin(CLAUDE_GLOBAL_SKILLS, skill.slug);
        copyDirRecursive(sourceDir, targetDir);

        const localHash = calculateSkillHash(targetDir);
        const now = Date.now();
        const enabledId = crypto.randomUUID();

        enabledSkillsDb.create({
          id: enabledId,
          skill_id: id,
          scope: "global",
          project_id: null,
          library_version: skill.version,
          local_hash: localHash,
          has_local_changes: 0,
          enabled_at: now,
          updated_at: now,
        });

        return json({ success: true, path: targetDir });
      } catch (e: any) {
        return json({ error: e.message || "Failed to enable skill" }, 500);
      }
    }

    if (method === "DELETE") {
      try {
        const existing = enabledSkillsDb.get(id, "global");
        if (!existing) {
          return json({ error: "Skill not enabled globally" }, 400);
        }

        const targetDir = safeJoin(CLAUDE_GLOBAL_SKILLS, skill.slug);
        if (existsSync(targetDir)) rmSync(targetDir, { recursive: true });

        enabledSkillsDb.delete(id, "global");
        return json({ success: true });
      } catch (e: any) {
        return json({ error: e.message || "Failed to disable skill" }, 500);
      }
    }
  }

  const projectSkillEnableMatch = url.pathname.match(
    /^\/api\/projects\/([^/]+)\/skills\/([^/]+)\/enable$/
  );
  if (projectSkillEnableMatch) {
    const projectId = projectSkillEnableMatch[1];
    const skillId = projectSkillEnableMatch[2];
    const project = projects.get(projectId);
    const skill = skillsDb.get(skillId);

    if (!project) return json({ error: "Project not found" }, 404);
    if (!skill) return json({ error: "Skill not found" }, 404);

    if (method === "POST") {
      try {
        const existing = enabledSkillsDb.get(skillId, "project", projectId);
        if (existing) {
          return json({ error: "Skill already enabled for this project" }, 400);
        }

        const projectSkillsDir = getProjectSkillsDir(project.path);
        if (!existsSync(projectSkillsDir)) {
          mkdirSync(projectSkillsDir, { recursive: true });
        }

        const sourceDir = safeJoin(SKILL_LIBRARY_PATH, skill.slug);
        const targetDir = safeJoin(projectSkillsDir, skill.slug);
        copyDirRecursive(sourceDir, targetDir);

        const localHash = calculateSkillHash(targetDir);
        const now = Date.now();
        const enabledId = crypto.randomUUID();

        enabledSkillsDb.create({
          id: enabledId,
          skill_id: skillId,
          scope: "project",
          project_id: projectId,
          library_version: skill.version,
          local_hash: localHash,
          has_local_changes: 0,
          enabled_at: now,
          updated_at: now,
        });

        return json({ success: true, path: targetDir });
      } catch (e: any) {
        return json({ error: e.message || "Failed to enable skill" }, 500);
      }
    }

    if (method === "DELETE") {
      try {
        const existing = enabledSkillsDb.get(skillId, "project", projectId);
        if (!existing) {
          return json({ error: "Skill not enabled for this project" }, 400);
        }

        const targetDir = safeJoin(getProjectSkillsDir(project.path), skill.slug);
        if (existsSync(targetDir)) rmSync(targetDir, { recursive: true });

        enabledSkillsDb.delete(skillId, "project", projectId);
        return json({ success: true });
      } catch (e: any) {
        return json({ error: e.message || "Failed to disable skill" }, 500);
      }
    }
  }

  const projectSkillsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/skills$/);
  if (projectSkillsMatch && method === "GET") {
    const projectId = projectSkillsMatch[1];
    const project = projects.get(projectId);
    if (!project) return json({ error: "Project not found" }, 404);

    const globalEnabled = enabledSkillsDb.listGlobal();
    const projectEnabled = enabledSkillsDb.listByProject(projectId);

    const seenSkillIds = new Set<string>();
    const result: any[] = [];

    for (const e of [...globalEnabled, ...projectEnabled]) {
      if (seenSkillIds.has(e.skill_id)) continue;
      seenSkillIds.add(e.skill_id);

      const skill = skillsDb.get(e.skill_id);
      if (skill) {
        result.push({
          ...skill,
          allowed_tools: skill.allowed_tools ? JSON.parse(skill.allowed_tools) : null,
          tags: skill.tags ? JSON.parse(skill.tags) : null,
          enabled_skill: e,
        });
      }
    }

    return json(result);
  }

  if (url.pathname === "/api/skills/enabled" && method === "GET") {
    const enabled = enabledSkillsDb.listGlobal();
    const result = enabled.map((e) => {
      const skill = skillsDb.get(e.skill_id);
      return skill ? {
        ...skill,
        allowed_tools: skill.allowed_tools ? JSON.parse(skill.allowed_tools) : null,
        tags: skill.tags ? JSON.parse(skill.tags) : null,
        enabled_skill: e,
      } : null;
    }).filter(Boolean);

    return json(result);
  }

  if (url.pathname === "/api/skills/scan" && method === "POST") {
    try {
      const body = await req.json().catch(() => ({}));
      const projectPath = body.projectPath as string | undefined;

      const results = {
        library: { added: [] as string[], updated: [] as string[], removed: [] as string[] },
        global: { synced: [] as string[], skipped: [] as string[] },
        project: { synced: [] as string[], skipped: [] as string[] },
      };

      // 1. First, auto-import from global skills (~/.claude/skills/)
      const globalSkills = scanGlobalClaudeSkills();
      for (const { slug, path, parsed } of globalSkills) {
        const existingInLibrary = existsSync(safeJoin(SKILL_LIBRARY_PATH, slug));
        if (existingInLibrary) {
          results.global.skipped.push(slug);
          continue;
        }
        try {
          const targetDir = safeJoin(SKILL_LIBRARY_PATH, slug);
          copyDirRecursive(path, targetDir);
          results.global.synced.push(slug);
        } catch (e: any) {
          console.error(`Failed to sync global skill ${slug}:`, e.message);
        }
      }

      // 2. Auto-import from project skills (.claude/skills/) if projectPath provided
      if (projectPath) {
        const projectSkillsDir = getProjectSkillsDir(projectPath);
        const projectSkills = scanSkillDirectory(projectSkillsDir);
        for (const { slug, path } of projectSkills) {
          const existingInLibrary = existsSync(safeJoin(SKILL_LIBRARY_PATH, slug));
          if (existingInLibrary) {
            results.project.skipped.push(slug);
            continue;
          }
          try {
            const targetDir = safeJoin(SKILL_LIBRARY_PATH, slug);
            copyDirRecursive(path, targetDir);
            results.project.synced.push(slug);
          } catch (e: any) {
            console.error(`Failed to sync project skill ${slug}:`, e.message);
          }
        }
      }

      // 3. Now scan the library and sync to DB
      const librarySkills = scanSkillDirectory(SKILL_LIBRARY_PATH);
      const dbSkills = skillsDb.list();

      for (const fs of librarySkills) {
        const existing = dbSkills.find((s) => s.slug === fs.slug);
        if (!existing) {
          const skillMdPath = join(fs.path, "SKILL.md");
          const content = readFileSync(skillMdPath, "utf-8");
          const parsed = parseSkillMd(content);
          const now = Date.now();
          const id = crypto.randomUUID();

          skillsDb.create({
            id,
            slug: fs.slug,
            name: parsed.frontmatter.name || fs.slug,
            description: parsed.frontmatter.description || "",
            version: (parsed.frontmatter.version as string) || "1.0.0",
            allowed_tools: parsed.frontmatter["allowed-tools"]
              ? JSON.stringify(parsed.frontmatter["allowed-tools"])
              : null,
            license: (parsed.frontmatter.license as string) || null,
            category: null,
            tags: null,
            content_hash: fs.hash,
            source_type: "local",
            source_url: null,
            source_version: null,
            created_at: now,
            updated_at: now,
          });
          results.library.added.push(fs.slug);
        } else if (fs.hash !== existing.content_hash) {
          const skillMdPath = join(fs.path, "SKILL.md");
          const content = readFileSync(skillMdPath, "utf-8");
          const parsed = parseSkillMd(content);

          skillsDb.update(existing.id, {
            name: parsed.frontmatter.name || existing.name,
            description: parsed.frontmatter.description || existing.description,
            allowed_tools: parsed.frontmatter["allowed-tools"]
              ? JSON.stringify(parsed.frontmatter["allowed-tools"])
              : existing.allowed_tools,
            license: (parsed.frontmatter.license as string) || existing.license,
            content_hash: fs.hash,
            updated_at: Date.now(),
          });
          results.library.updated.push(fs.slug);
        }
      }

      for (const db of dbSkills) {
        if (!librarySkills.find((fs) => fs.slug === db.slug)) {
          skillsDb.delete(db.id);
          results.library.removed.push(db.slug);
        }
      }

      return json({ success: true, results });
    } catch (e: any) {
      return json({ error: e.message || "Scan failed" }, 500);
    }
  }

  if (url.pathname === "/api/skills/examples" && method === "POST") {
    try {
      const created: string[] = [];
      for (const example of EXAMPLE_SKILLS) {
        if (skillsDb.getBySlug(example.slug)) continue;

        const skillDir = safeJoin(SKILL_LIBRARY_PATH, example.slug);
        mkdirSync(skillDir, { recursive: true });

        const skillMd = serializeSkillMd({
          frontmatter: {
            name: example.name,
            description: example.description,
            version: "1.0.0",
            "allowed-tools": example.allowed_tools,
          },
          body: example.body,
        });

        writeFileSync(join(skillDir, "SKILL.md"), skillMd);

        const contentHash = calculateSkillHash(skillDir);
        const now = Date.now();
        const id = crypto.randomUUID();

        skillsDb.create({
          id,
          slug: example.slug,
          name: example.name,
          description: example.description,
          version: "1.0.0",
          allowed_tools: JSON.stringify(example.allowed_tools),
          license: null,
          category: example.category,
          tags: JSON.stringify(example.tags),
          content_hash: contentHash,
          source_type: "local",
          source_url: null,
          source_version: null,
          created_at: now,
          updated_at: now,
        });

        created.push(example.slug);
      }

      return json({ success: true, created });
    } catch (e: any) {
      return json({ error: e.message || "Failed to create examples" }, 500);
    }
  }

  if (url.pathname === "/api/skills/import" && method === "POST") {
    try {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      const useAi = formData.get("useAi") === "true";

      if (!file) {
        return json({ error: "No file provided" }, 400);
      }

      const isZip = file.name.endsWith(".zip");

      if (isZip) {
        const AdmZip = (await import("adm-zip")).default;
        const buffer = Buffer.from(await file.arrayBuffer());
        const zip = new AdmZip(buffer);
        const entries = zip.getEntries();

        let skillMdEntry = entries.find(e => e.entryName.endsWith("SKILL.md"));
        if (!skillMdEntry) {
          return json({ error: "No SKILL.md found in zip" }, 400);
        }

        const zipRoot = skillMdEntry.entryName.replace(/\/?SKILL\.md$/, "");
        let slug = zipRoot.split("/").filter(Boolean).pop() || file.name.replace(".zip", "");
        validateSlug(slug);

        if (skillsDb.getBySlug(slug)) {
          return json({ error: `Skill "${slug}" already exists` }, 400);
        }

        const skillDir = safeJoin(SKILL_LIBRARY_PATH, slug);

        for (const entry of entries) {
          if (entry.isDirectory) continue;

          let relativePath = entry.entryName;
          if (zipRoot && relativePath.startsWith(zipRoot)) {
            relativePath = relativePath.slice(zipRoot.length).replace(/^\//, "");
          }
          if (!relativePath) continue;

          const targetPath = safeJoin(skillDir, relativePath);
          const targetDir = dirname(targetPath);
          mkdirSync(targetDir, { recursive: true });
          writeFileSync(targetPath, entry.getData());
        }

        const skillMdPath = join(skillDir, "SKILL.md");
        if (!existsSync(skillMdPath)) {
          rmSync(skillDir, { recursive: true });
          return json({ error: "SKILL.md not found after extraction" }, 400);
        }

        const content = readFileSync(skillMdPath, "utf-8");
        const parsed = parseSkillMd(content);

        const contentHash = calculateSkillHash(skillDir);
        const now = Date.now();
        const id = crypto.randomUUID();

        const skill = {
          id,
          slug,
          name: parsed.frontmatter.name || slug,
          description: parsed.frontmatter.description || "",
          version: (parsed.frontmatter.version as string) || "1.0.0",
          allowed_tools: parsed.frontmatter["allowed-tools"]
            ? JSON.stringify(parsed.frontmatter["allowed-tools"])
            : null,
          license: (parsed.frontmatter.license as string) || null,
          category: null,
          tags: null,
          content_hash: contentHash,
          source_type: "import",
          source_url: null,
          source_version: null,
          created_at: now,
          updated_at: now,
        };

        skillsDb.create(skill);

        return json({
          ...skill,
          allowed_tools: parsed.frontmatter["allowed-tools"] || null,
          tags: null,
          enabled_globally: false,
          enabled_projects: [],
        }, 201);
      }

      const content = await file.text();
      let skillData = await parseSkillContent(content, file.name, useAi);

      const slug = skillData.slug || slugify(skillData.name);
      validateSlug(slug);

      if (skillsDb.getBySlug(slug)) {
        return json({ error: `Skill "${slug}" already exists` }, 400);
      }

      const skillDir = safeJoin(SKILL_LIBRARY_PATH, slug);
      mkdirSync(skillDir, { recursive: true });

      const skillMd = serializeSkillMd({
        frontmatter: {
          name: skillData.name,
          description: skillData.description,
          version: "1.0.0",
          "allowed-tools": skillData.allowed_tools,
          license: skillData.license,
        },
        body: skillData.body,
      });

      writeFileSync(join(skillDir, "SKILL.md"), skillMd);

      const contentHash = calculateSkillHash(skillDir);
      const now = Date.now();
      const id = crypto.randomUUID();

      const skill = {
        id,
        slug,
        name: skillData.name,
        description: skillData.description,
        version: "1.0.0",
        allowed_tools: skillData.allowed_tools ? JSON.stringify(skillData.allowed_tools) : null,
        license: skillData.license || null,
        category: skillData.category || null,
        tags: skillData.tags ? JSON.stringify(skillData.tags) : null,
        content_hash: contentHash,
        source_type: "import",
        source_url: null,
        source_version: null,
        created_at: now,
        updated_at: now,
      };

      skillsDb.create(skill);

      return json({
        ...skill,
        allowed_tools: skillData.allowed_tools || null,
        tags: skillData.tags || null,
        enabled_globally: false,
        enabled_projects: [],
      }, 201);
    } catch (e: any) {
      return json({ error: e.message || "Import failed" }, 400);
    }
  }

  if (url.pathname === "/api/skills/import-url" && method === "POST") {
    try {
      const body = await req.json();
      const { url: importUrl, useAi } = body;

      if (!importUrl) {
        return json({ error: "No URL provided" }, 400);
      }

      const urlObj = new URL(importUrl);
      const allowedHosts = ["github.com", "raw.githubusercontent.com", "gist.githubusercontent.com", "gitlab.com"];
      if (!allowedHosts.some(h => urlObj.hostname.endsWith(h))) {
        return json({ error: "URL must be from GitHub, GitLab, or Gist" }, 400);
      }

      let fetchUrl = importUrl;
      if (urlObj.hostname === "github.com" && importUrl.includes("/blob/")) {
        fetchUrl = importUrl.replace("github.com", "raw.githubusercontent.com").replace("/blob/", "/");
      }

      const response = await fetch(fetchUrl);
      if (!response.ok) {
        return json({ error: `Failed to fetch: ${response.status}` }, 400);
      }

      const content = await response.text();
      const filename = urlObj.pathname.split("/").pop() || "skill.md";
      let skillData = await parseSkillContent(content, filename, useAi);

      const slug = skillData.slug || slugify(skillData.name);
      validateSlug(slug);

      if (skillsDb.getBySlug(slug)) {
        return json({ error: `Skill "${slug}" already exists` }, 400);
      }

      const skillDir = safeJoin(SKILL_LIBRARY_PATH, slug);
      mkdirSync(skillDir, { recursive: true });

      const skillMd = serializeSkillMd({
        frontmatter: {
          name: skillData.name,
          description: skillData.description,
          version: "1.0.0",
          "allowed-tools": skillData.allowed_tools,
          license: skillData.license,
        },
        body: skillData.body,
      });

      writeFileSync(join(skillDir, "SKILL.md"), skillMd);

      const contentHash = calculateSkillHash(skillDir);
      const now = Date.now();
      const id = crypto.randomUUID();

      const skill = {
        id,
        slug,
        name: skillData.name,
        description: skillData.description,
        version: "1.0.0",
        allowed_tools: skillData.allowed_tools ? JSON.stringify(skillData.allowed_tools) : null,
        license: skillData.license || null,
        category: skillData.category || null,
        tags: skillData.tags ? JSON.stringify(skillData.tags) : null,
        content_hash: contentHash,
        source_type: "import",
        source_url: importUrl,
        source_version: null,
        created_at: now,
        updated_at: now,
      };

      skillsDb.create(skill);

      return json({
        ...skill,
        allowed_tools: skillData.allowed_tools || null,
        tags: skillData.tags || null,
        enabled_globally: false,
        enabled_projects: [],
      }, 201);
    } catch (e: any) {
      return json({ error: e.message || "Import failed" }, 400);
    }
  }

  if (url.pathname === "/api/skills/sync-global" && method === "POST") {
    try {
      const globalSkills = scanGlobalClaudeSkills();
      const synced: string[] = [];
      const skipped: string[] = [];
      const errors: string[] = [];

      for (const { slug, path, parsed } of globalSkills) {
        try {
          const existing = skillsDb.getBySlug(slug);
          if (existing) {
            skipped.push(slug);
            continue;
          }

          const skillDir = safeJoin(SKILL_LIBRARY_PATH, slug);
          copyDirRecursive(path, skillDir);

          const contentHash = calculateSkillHash(skillDir);
          const now = Date.now();
          const skillId = crypto.randomUUID();

          const skill = {
            id: skillId,
            slug,
            name: parsed.frontmatter.name || slug,
            description: parsed.frontmatter.description || "",
            version: parsed.frontmatter.version || "1.0.0",
            allowed_tools: parsed.frontmatter["allowed-tools"] ? JSON.stringify(parsed.frontmatter["allowed-tools"]) : null,
            license: parsed.frontmatter.license || null,
            category: null,
            tags: null,
            content_hash: contentHash,
            source_type: "import" as const,
            source_url: path,
            source_version: null,
            created_at: now,
            updated_at: now,
          };

          skillsDb.create(skill);
          synced.push(slug);
        } catch (e: any) {
          errors.push(`${slug}: ${e.message}`);
        }
      }

      return json({
        synced,
        skipped,
        errors,
        total_global: globalSkills.length,
      });
    } catch (e: any) {
      return json({ error: e.message || "Sync failed" }, 500);
    }
  }

  if (url.pathname === "/api/skills/global" && method === "GET") {
    try {
      const globalSkills = scanGlobalClaudeSkills();
      return json(globalSkills.map(s => ({
        slug: s.slug,
        name: s.parsed.frontmatter.name || s.slug,
        description: s.parsed.frontmatter.description || "",
        path: s.path,
      })));
    } catch (e: any) {
      return json({ error: e.message }, 500);
    }
  }

  // POST /api/skills/generate - Generate a skill from conversation context
  // Used by the Skill Scout proactive hook
  if (url.pathname === "/api/skills/generate" && method === "POST") {
    try {
      const body = await req.json();
      const { projectPath, skillName, description, pattern, conversationSummary } = body;

      if (!skillName || !description) {
        return json({ error: "skillName and description are required" }, 400);
      }

      const slug = slugify(skillName);
      validateSlug(slug);

      if (skillsDb.getBySlug(slug)) {
        return json({ error: `Skill "${slug}" already exists` }, 400);
      }

      // Use Claude to generate a proper skill from the context
      const apiKey = globalSettings.get("anthropicApiKey") as string | null;
      if (!apiKey) {
        return json({ error: "No API key configured" }, 400);
      }

      const systemPrompt = `You are a skill generator for Claude Code. Generate a complete SKILL.md file based on the provided context.

The skill should:
1. Have clear, actionable instructions
2. Include examples where helpful
3. Specify which tools are typically needed
4. Be focused and specific

Return ONLY the markdown content for the SKILL.md file body (without the frontmatter - that will be added separately).
Do not wrap in code blocks. Just return the raw markdown instructions.`;

      const userPrompt = `Generate a skill based on this context:

Skill Name: ${skillName}
Description: ${description}
Pattern Identified: ${pattern}

Conversation that led to this:
${conversationSummary}

Generate comprehensive instructions for this skill that can be reused in future conversations.`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4000,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `API error: ${response.status}`);
      }

      const result = await response.json();
      const generatedBody = result.content?.[0]?.text || "";

      if (!generatedBody) {
        throw new Error("Failed to generate skill content");
      }

      // Determine where to save the skill
      let skillDir: string;
      if (projectPath) {
        // Save to project skills directory
        const projectSkillsDir = getProjectSkillsDir(projectPath);
        if (!existsSync(projectSkillsDir)) {
          mkdirSync(projectSkillsDir, { recursive: true });
        }
        skillDir = safeJoin(projectSkillsDir, slug);
      } else {
        // Save to global skill library
        skillDir = safeJoin(SKILL_LIBRARY_PATH, slug);
      }

      mkdirSync(skillDir, { recursive: true });

      // Create the SKILL.md file
      const skillMd = serializeSkillMd({
        frontmatter: {
          name: skillName,
          description,
          version: "1.0.0",
          "allowed-tools": ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
        },
        body: generatedBody,
      });

      writeFileSync(join(skillDir, "SKILL.md"), skillMd);

      // Only add to DB if saved to library (not project-specific)
      if (!projectPath) {
        const contentHash = calculateSkillHash(skillDir);
        const now = Date.now();
        const id = crypto.randomUUID();

        skillsDb.create({
          id,
          slug,
          name: skillName,
          description,
          version: "1.0.0",
          allowed_tools: JSON.stringify(["Read", "Write", "Edit", "Bash", "Glob", "Grep"]),
          license: null,
          category: "generated",
          tags: JSON.stringify(["auto-generated", "skill-scout"]),
          content_hash: contentHash,
          source_type: "generated",
          source_url: null,
          source_version: null,
          created_at: now,
          updated_at: now,
        });
      }

      return json({
        success: true,
        slug,
        path: skillDir,
        isProjectSkill: !!projectPath,
      }, 201);
    } catch (e: any) {
      console.error("Skill generation failed:", e);
      return json({ error: e.message || "Failed to generate skill" }, 500);
    }
  }

  // GET /api/skills/categories - List predefined skill categories
  if (url.pathname === "/api/skills/categories" && method === "GET") {
    return json(SKILL_CATEGORIES);
  }

  // GET /api/skills/default-enabled - List skills marked as default for new projects
  if (url.pathname === "/api/skills/default-enabled" && method === "GET") {
    const defaultSkills = skillsDb.listDefaultEnabled();
    return json(defaultSkills.map(skill => ({
      ...skill,
      allowed_tools: skill.allowed_tools ? JSON.parse(skill.allowed_tools) : null,
      tags: skill.tags ? JSON.parse(skill.tags) : null,
    })));
  }

  // POST /api/skills/:id/default-enabled - Toggle default enabled status
  const defaultEnabledMatch = url.pathname.match(/^\/api\/skills\/([^/]+)\/default-enabled$/);
  if (defaultEnabledMatch && (method === "POST" || method === "DELETE")) {
    const id = defaultEnabledMatch[1];
    const skill = skillsDb.get(id);
    if (!skill) return json({ error: "Skill not found" }, 404);

    const enabled = method === "POST";
    skillsDb.setDefaultEnabled(id, enabled);

    return json({ success: true, default_enabled: enabled });
  }

  return null;
}
