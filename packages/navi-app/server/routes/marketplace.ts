import { spawn } from "child_process";
import { json } from "../utils/response";

export interface MarketplaceSkill {
  id: string;
  name: string;
  description: string;
  owner: string;
  repo: string;
  installs: number;
  stars?: number;
  version?: string;
  category?: string;
  author?: string;
}

interface SearchResult {
  skills: MarketplaceSkill[];
  total: number;
  query: string;
}

/**
 * Execute the skills CLI command and parse output
 */
async function runSkillsCli(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("npx", ["skills", ...args], {
      shell: true,
      timeout: 30000,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || `Command failed with code ${code}`));
      }
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}

/**
 * Parse skills search output into structured data
 * Example line: "[32mui-ux-pro-max[39m [2mv2026-01-03[22m"
 */
function parseSearchOutput(output: string): MarketplaceSkill[] {
  const skills: MarketplaceSkill[] = [];
  const lines = output.split("\n");

  let currentSkill: Partial<MarketplaceSkill> | null = null;

  for (const line of lines) {
    // Strip ANSI codes
    const cleanLine = line.replace(/\x1b\[[0-9;]*m/g, "").trim();

    if (!cleanLine) continue;

    // Skip status lines
    if (cleanLine.startsWith("- ") || cleanLine.startsWith("✔")) continue;

    // Skill name line: "skill-name v1.0.0" or just "skill-name"
    const nameMatch = cleanLine.match(/^([a-zA-Z0-9_-]+)\s*(v[\d.-]+)?$/);
    if (nameMatch) {
      if (currentSkill && currentSkill.id) {
        skills.push(currentSkill as MarketplaceSkill);
      }
      currentSkill = {
        id: nameMatch[1],
        name: nameMatch[1],
        version: nameMatch[2]?.replace("v", "") || undefined,
        description: "",
        owner: "",
        repo: "",
        installs: 0,
      };
      continue;
    }

    // Description line (starts with quote or just text after name)
    if (currentSkill && cleanLine.startsWith('"')) {
      currentSkill.description = cleanLine.replace(/^"|"$/g, "").slice(0, 200);
      continue;
    }

    // If line doesn't start with special chars and we have a skill, it might be description
    if (currentSkill && currentSkill.description === "" && !cleanLine.startsWith("by ") && !cleanLine.includes("•")) {
      currentSkill.description = cleanLine.slice(0, 200);
      continue;
    }

    // Author/repo line: "by owner • category" or "by owner/repo • category"
    const byMatch = cleanLine.match(/^by\s+([^\s•]+)(?:\s*•\s*(.+))?/);
    if (byMatch && currentSkill) {
      const ownerRepo = byMatch[1];
      if (ownerRepo.includes("/")) {
        const [owner, repo] = ownerRepo.split("/");
        currentSkill.owner = owner;
        currentSkill.repo = repo;
      } else {
        currentSkill.author = ownerRepo;
        currentSkill.owner = ownerRepo;
      }
      if (byMatch[2]) {
        currentSkill.category = byMatch[2].trim();
      }
      continue;
    }

    // Stats line: "★ 123 • 456 installs"
    const statsMatch = cleanLine.match(/★\s*(\d+)\s*•\s*(\d+)\s*installs?/);
    if (statsMatch && currentSkill) {
      currentSkill.stars = parseInt(statsMatch[1], 10);
      currentSkill.installs = parseInt(statsMatch[2], 10);
      continue;
    }
  }

  // Don't forget the last skill
  if (currentSkill && currentSkill.id) {
    skills.push(currentSkill as MarketplaceSkill);
  }

  return skills;
}

/**
 * Parse skill info output
 */
function parseInfoOutput(output: string): Partial<MarketplaceSkill> | null {
  const cleanOutput = output.replace(/\x1b\[[0-9;]*m/g, "");
  const lines = cleanOutput.split("\n").map((l) => l.trim()).filter(Boolean);

  const skill: Partial<MarketplaceSkill> = {};

  for (const line of lines) {
    // Skip loading messages
    if (line.startsWith("-") || line.includes("Fetching")) continue;

    // Full identifier: owner/repo/skill-name
    const fullMatch = line.match(/^([^/]+)\/([^/]+)\/(.+)$/);
    if (fullMatch) {
      skill.owner = fullMatch[1];
      skill.repo = fullMatch[2];
      skill.name = fullMatch[3];
      skill.id = fullMatch[3];
      continue;
    }
  }

  return skill.id ? skill : null;
}

export async function handleMarketplaceRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  // GET /api/marketplace/search?q=react
  if (url.pathname === "/api/marketplace/search" && method === "GET") {
    const query = url.searchParams.get("q") || "";
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);

    if (!query.trim()) {
      return json({ skills: [], total: 0, query: "" } as SearchResult);
    }

    try {
      const output = await runSkillsCli(["search", query]);
      const skills = parseSearchOutput(output).slice(0, limit);

      return json({
        skills,
        total: skills.length,
        query,
      } as SearchResult);
    } catch (e: any) {
      console.error("Marketplace search failed:", e);
      return json({ error: e.message || "Search failed" }, 500);
    }
  }

  // GET /api/marketplace/trending
  if (url.pathname === "/api/marketplace/trending" && method === "GET") {
    try {
      // Search for common terms to get popular skills
      const output = await runSkillsCli(["search", "skill"]);
      const skills = parseSearchOutput(output)
        .sort((a, b) => (b.installs || 0) - (a.installs || 0))
        .slice(0, 20);

      return json({ skills, total: skills.length });
    } catch (e: any) {
      console.error("Marketplace trending failed:", e);
      return json({ error: e.message || "Failed to fetch trending" }, 500);
    }
  }

  // GET /api/marketplace/info/:owner/:repo/:skill
  const infoMatch = url.pathname.match(/^\/api\/marketplace\/info\/([^/]+)\/([^/]+)\/(.+)$/);
  if (infoMatch && method === "GET") {
    const [, owner, repo, skillName] = infoMatch;
    const fullPath = `${owner}/${repo}/${skillName}`;

    try {
      const output = await runSkillsCli(["info", fullPath]);
      const skill = parseInfoOutput(output);

      if (!skill) {
        return json({ error: "Skill not found" }, 404);
      }

      return json(skill);
    } catch (e: any) {
      console.error("Marketplace info failed:", e);
      return json({ error: e.message || "Failed to get skill info" }, 500);
    }
  }

  // POST /api/marketplace/install
  if (url.pathname === "/api/marketplace/install" && method === "POST") {
    try {
      const body = await req.json();
      const { source, global: installGlobal = true } = body;

      if (!source) {
        return json({ error: "source is required (owner/repo or owner/repo/skill)" }, 400);
      }

      const args = ["add", source];
      if (installGlobal) {
        args.push("--global");
      }

      const output = await runSkillsCli(args);

      // After install, trigger a scan to import into Navi's library
      // This will be handled by the calling code

      return json({
        success: true,
        source,
        global: installGlobal,
        output: output.replace(/\x1b\[[0-9;]*m/g, ""), // Strip ANSI
      });
    } catch (e: any) {
      console.error("Marketplace install failed:", e);
      return json({ error: e.message || "Install failed" }, 500);
    }
  }

  // POST /api/marketplace/uninstall
  if (url.pathname === "/api/marketplace/uninstall" && method === "POST") {
    try {
      const body = await req.json();
      const { name, global: uninstallGlobal = true } = body;

      if (!name) {
        return json({ error: "name is required" }, 400);
      }

      const args = ["uninstall", name];
      if (uninstallGlobal) {
        args.push("--global");
      }

      const output = await runSkillsCli(args);

      return json({
        success: true,
        name,
        output: output.replace(/\x1b\[[0-9;]*m/g, ""),
      });
    } catch (e: any) {
      console.error("Marketplace uninstall failed:", e);
      return json({ error: e.message || "Uninstall failed" }, 500);
    }
  }

  // GET /api/marketplace/installed
  if (url.pathname === "/api/marketplace/installed" && method === "GET") {
    try {
      const output = await runSkillsCli(["list"]);
      // Parse list output (similar to search)
      const skills = parseSearchOutput(output);

      return json({ skills, total: skills.length });
    } catch (e: any) {
      console.error("Marketplace list failed:", e);
      return json({ error: e.message || "Failed to list installed" }, 500);
    }
  }

  return null;
}
