import { createHash } from "crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  copyFileSync,
  statSync,
  chmodSync,
} from "fs";
import { homedir } from "os";
import { join, resolve, sep, dirname, basename } from "path";

export const SKILL_LIBRARY_PATH = join(homedir(), ".claude-code-ui", "skill-library");
export const CLAUDE_GLOBAL_SKILLS = join(homedir(), ".claude", "skills");

if (!existsSync(SKILL_LIBRARY_PATH)) {
  mkdirSync(SKILL_LIBRARY_PATH, { recursive: true });
}

export function validateSlug(slug: string): void {
  if (!slug || slug.trim().length === 0) {
    throw new Error("Slug cannot be empty");
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
    throw new Error(`Invalid slug "${slug}": only alphanumeric, hyphens, and underscores allowed`);
  }
  const reserved = [".", "..", "con", "prn", "aux", "nul"];
  if (reserved.includes(slug.toLowerCase())) {
    throw new Error(`Invalid slug "${slug}": reserved name`);
  }
  if (slug.length > 100) {
    throw new Error("Slug too long (max 100 characters)");
  }
}

export function assertPathWithinBase(targetPath: string, basePath: string): void {
  const resolvedTarget = resolve(targetPath);
  const resolvedBase = resolve(basePath);
  if (!resolvedTarget.startsWith(resolvedBase + sep) && resolvedTarget !== resolvedBase) {
    throw new Error(`Path traversal detected: ${targetPath} is outside ${basePath}`);
  }
}

export function safeJoin(basePath: string, ...parts: string[]): string {
  const joined = join(basePath, ...parts);
  assertPathWithinBase(joined, basePath);
  return joined;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

export function calculateSkillHash(skillPath: string): string {
  const hash = createHash("sha256");

  function hashDir(dir: string, prefix: string = "") {
    if (!existsSync(dir)) return;
    const entries = readdirSync(dir).sort();
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const relativePath = prefix ? `${prefix}/${entry}` : entry;
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        hash.update(`DIR:${relativePath}\n`);
        hashDir(fullPath, relativePath);
      } else {
        hash.update(`FILE:${relativePath}\n`);
        hash.update(readFileSync(fullPath));
      }
    }
  }

  hashDir(skillPath);
  return hash.digest("hex");
}

export function copyDirRecursive(src: string, dest: string, baseDest?: string) {
  const effectiveBaseDest = baseDest || dest;
  mkdirSync(dest, { recursive: true });

  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    assertPathWithinBase(destPath, effectiveBaseDest);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath, effectiveBaseDest);
    } else {
      copyFileSync(srcPath, destPath);
      const stat = statSync(srcPath);
      chmodSync(destPath, stat.mode);
    }
  }
}

export interface SkillMdParsed {
  frontmatter: {
    name: string;
    description: string;
    version?: string;
    "allowed-tools"?: string[];
    license?: string;
    "disable-model-invocation"?: boolean;
    [key: string]: unknown;
  };
  body: string;
}

export function parseSkillMd(content: string): SkillMdParsed {
  const lines = content.split("\n");
  let inFrontmatter = false;
  let frontmatterLines: string[] = [];
  let bodyStartIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (i === 0 && line === "---") {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter && line === "---") {
      bodyStartIndex = i + 1;
      break;
    }
    if (inFrontmatter) {
      frontmatterLines.push(lines[i]);
    }
  }

  const frontmatter: SkillMdParsed["frontmatter"] = {
    name: "",
    description: "",
  };

  for (const line of frontmatterLines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;
    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();

    if (key === "allowed-tools") {
      frontmatter["allowed-tools"] = value.split(",").map((t) => t.trim()).filter(Boolean);
    } else if (key === "disable-model-invocation") {
      frontmatter["disable-model-invocation"] = value.toLowerCase() === "true";
    } else {
      frontmatter[key] = value;
    }
  }

  const body = lines.slice(bodyStartIndex).join("\n").trim();

  return { frontmatter, body };
}

export function serializeSkillMd(parsed: SkillMdParsed): string {
  const lines = ["---"];

  for (const [key, value] of Object.entries(parsed.frontmatter)) {
    if (value === undefined || value === null || value === "") continue;
    if (key === "allowed-tools" && Array.isArray(value)) {
      lines.push(`${key}: ${value.join(", ")}`);
    } else if (typeof value === "boolean") {
      lines.push(`${key}: ${value}`);
    } else if (typeof value === "string") {
      lines.push(`${key}: ${value}`);
    }
  }

  lines.push("---", "");
  lines.push(parsed.body);

  return lines.join("\n");
}

export interface Skill {
  id: string;
  slug: string;
  name: string;
  description: string;
  version: string;
  allowed_tools: string[] | null;
  license: string | null;
  category: string | null;
  tags: string[] | null;
  content_hash: string;
  source_type: "local" | "marketplace" | "import";
  source_url: string | null;
  source_version: string | null;
  created_at: number;
  updated_at: number;
}

export interface EnabledSkill {
  id: string;
  skill_id: string;
  scope: "global" | "project";
  project_id: string | null;
  library_version: string;
  local_hash: string;
  has_local_changes: number;
  enabled_at: number;
  updated_at: number;
}

export interface SkillVersion {
  id: string;
  skill_id: string;
  version: string;
  content_hash: string;
  changelog: string | null;
  created_at: number;
}

export interface CreateSkillInput {
  slug?: string;
  name: string;
  description: string;
  body: string;
  allowed_tools?: string[];
  license?: string;
  category?: string;
  tags?: string[];
}

export interface SkillWithStatus extends Skill {
  enabled_globally: boolean;
  enabled_projects: string[];
  body?: string;
}

export function scanSkillDirectory(dir: string): { slug: string; path: string; hash: string }[] {
  if (!existsSync(dir)) return [];

  const results: { slug: string; path: string; hash: string }[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillPath = join(dir, entry.name);
    const skillMdPath = join(skillPath, "SKILL.md");

    if (existsSync(skillMdPath)) {
      results.push({
        slug: entry.name,
        path: skillPath,
        hash: calculateSkillHash(skillPath),
      });
    }
  }

  return results;
}

export function getSkillBody(skillId: string, slug: string): string | null {
  const skillPath = safeJoin(SKILL_LIBRARY_PATH, slug);
  const skillMdPath = join(skillPath, "SKILL.md");

  if (!existsSync(skillMdPath)) return null;

  const content = readFileSync(skillMdPath, "utf-8");
  const parsed = parseSkillMd(content);
  return parsed.body;
}

export function getProjectSkillsDir(projectPath: string): string {
  return join(projectPath, ".claude", "skills");
}

export interface SkillFileInfo {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
}

export function getSkillFiles(slug: string): { path: string; files: SkillFileInfo[] } {
  validateSlug(slug);
  const skillPath = safeJoin(SKILL_LIBRARY_PATH, slug);
  
  if (!existsSync(skillPath)) {
    return { path: skillPath, files: [] };
  }

  const files: SkillFileInfo[] = [];
  
  function scanDir(dir: string, prefix: string = "") {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    })) {
      const fullPath = join(dir, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      
      if (entry.isDirectory()) {
        files.push({ name: entry.name, path: relativePath, type: "directory" });
        scanDir(fullPath, relativePath);
      } else {
        const stat = statSync(fullPath);
        files.push({ name: entry.name, path: relativePath, type: "file", size: stat.size });
      }
    }
  }
  
  scanDir(skillPath);
  return { path: skillPath, files };
}

export function getSkillFilePath(slug: string): string {
  validateSlug(slug);
  return safeJoin(SKILL_LIBRARY_PATH, slug);
}

export function scanGlobalClaudeSkills(): { slug: string; path: string; parsed: SkillMdParsed }[] {
  if (!existsSync(CLAUDE_GLOBAL_SKILLS)) return [];

  const results: { slug: string; path: string; parsed: SkillMdParsed }[] = [];

  for (const entry of readdirSync(CLAUDE_GLOBAL_SKILLS, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillPath = join(CLAUDE_GLOBAL_SKILLS, entry.name);
    const skillMdPath = join(skillPath, "SKILL.md");

    if (existsSync(skillMdPath)) {
      try {
        const content = readFileSync(skillMdPath, "utf-8");
        const parsed = parseSkillMd(content);
        results.push({
          slug: entry.name,
          path: skillPath,
          parsed,
        });
      } catch (e) {
        console.error(`Failed to parse skill at ${skillPath}:`, e);
      }
    }
  }

  return results;
}

export const EXAMPLE_SKILLS = [
  {
    slug: "concise-coder",
    name: "Concise Coder",
    description: "Write clean, minimal code without unnecessary comments",
    body: `# Concise Coder

When writing or modifying code:

1. **No comments** unless absolutely necessary for complex logic
2. **Prefer editing** existing files over creating new ones
3. **Keep functions small** - single responsibility principle
4. **Use descriptive names** instead of comments
5. **Remove dead code** - don't comment it out

## Code Style

- Use existing patterns in the codebase
- Follow the project's conventions
- Minimize boilerplate
- Prefer composition over inheritance

## When Asked to Explain

Be concise. One sentence is often enough. Don't over-explain.`,
    allowed_tools: ["Read", "Write", "Edit", "Glob", "Grep"],
    category: "coding",
    tags: ["code-style", "minimal", "clean-code"],
  },
  {
    slug: "debug-detective",
    name: "Debug Detective",
    description: "Systematic approach to debugging complex issues",
    body: `# Debug Detective

When debugging issues, follow this systematic approach:

## Investigation Process

1. **Reproduce** - Confirm the exact steps to trigger the issue
2. **Isolate** - Narrow down which component/file is causing the problem
3. **Hypothesize** - Form theories about the root cause
4. **Verify** - Test each hypothesis methodically
5. **Fix** - Apply the minimal change that resolves the issue
6. **Validate** - Ensure the fix works and doesn't break other things

## Tools to Use

- Use \`Grep\` to search for related code patterns
- Use \`Read\` to examine suspicious files
- Use \`Bash\` to run tests or check logs
- Use \`Glob\` to find related files

## Output Format

When reporting findings:
- State the root cause clearly
- Show the relevant code/logs
- Explain why the fix works`,
    allowed_tools: ["Read", "Grep", "Glob", "Bash"],
    category: "debugging",
    tags: ["debug", "investigation", "systematic"],
  },
  {
    slug: "test-writer",
    name: "Test Writer",
    description: "Generate comprehensive tests for code",
    body: `# Test Writer

When writing tests:

## Test Structure

1. **Arrange** - Set up test data and preconditions
2. **Act** - Execute the code under test
3. **Assert** - Verify the expected outcome

## Coverage Guidelines

- Test happy paths first
- Add edge cases: null, empty, boundary values
- Test error conditions
- Test async behavior if applicable

## Naming Convention

Use descriptive test names:
- \`should_return_empty_array_when_input_is_null\`
- \`throws_error_when_user_not_found\`

## Before Writing Tests

1. Check existing test patterns in the codebase
2. Use the same testing framework already in use
3. Follow naming conventions from other tests`,
    allowed_tools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash"],
    category: "testing",
    tags: ["tests", "tdd", "quality"],
  },
];
