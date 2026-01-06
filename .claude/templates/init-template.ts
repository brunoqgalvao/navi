#!/usr/bin/env bun
/**
 * Project Template Initializer
 *
 * Creates a new project from a template, copying over:
 * - CLAUDE.md
 * - .claude/agents/
 * - .claude/skills/
 *
 * Usage:
 *   bun run init-template.ts <template-name> [target-directory]
 *
 * Examples:
 *   bun run init-template.ts vibe-coding ./my-new-app
 *   bun run init-template.ts nano-banana ./image-project
 *   bun run init-template.ts --list
 */

import { existsSync, mkdirSync, cpSync, readdirSync } from 'fs';
import { join, resolve, dirname } from 'path';

const TEMPLATES_DIR = dirname(new URL(import.meta.url).pathname);

function listTemplates(): string[] {
  const entries = readdirSync(TEMPLATES_DIR, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory() && !e.name.startsWith('.'))
    .map(e => e.name);
}

function showHelp() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║              🚀 Project Template Initializer                 ║
╚══════════════════════════════════════════════════════════════╝

Usage:
  init-template <template-name> [target-directory]
  init-template --list

Templates Available:
${listTemplates().map(t => `  • ${t}`).join('\n')}

Examples:
  # Create a new vibe-coding project
  init-template vibe-coding ./my-new-app

  # Create an image generation project in current directory
  init-template nano-banana .

  # List available templates
  init-template --list
`);
}

function initTemplate(templateName: string, targetDir: string) {
  const templatePath = join(TEMPLATES_DIR, templateName);
  const targetPath = resolve(targetDir);

  // Validate template exists
  if (!existsSync(templatePath)) {
    console.error(`❌ Template "${templateName}" not found.`);
    console.log(`\nAvailable templates: ${listTemplates().join(', ')}`);
    process.exit(1);
  }

  // Create target directory if needed
  if (!existsSync(targetPath)) {
    mkdirSync(targetPath, { recursive: true });
    console.log(`📁 Created directory: ${targetPath}`);
  }

  // Copy CLAUDE.md
  const claudeMdSrc = join(templatePath, 'CLAUDE.md');
  const claudeMdDest = join(targetPath, 'CLAUDE.md');
  if (existsSync(claudeMdSrc)) {
    cpSync(claudeMdSrc, claudeMdDest);
    console.log(`📝 Created CLAUDE.md`);
  }

  // Copy .claude directory
  const claudeDirSrc = join(templatePath, '.claude');
  const claudeDirDest = join(targetPath, '.claude');
  if (existsSync(claudeDirSrc)) {
    cpSync(claudeDirSrc, claudeDirDest, { recursive: true });
    console.log(`🔧 Created .claude/ directory with agents and skills`);
  }

  // Summary
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    ✅ Template Applied!                      ║
╚══════════════════════════════════════════════════════════════╝

Template: ${templateName}
Location: ${targetPath}

Created:
  • CLAUDE.md - Project instructions
  • .claude/agents/ - Specialized AI agents
  • .claude/skills/ - Skill references

Next steps:
  cd ${targetDir}
  # Start working with Claude Code!
`);
}

// Main
const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  showHelp();
  process.exit(0);
}

if (args[0] === '--list' || args[0] === '-l') {
  console.log('Available templates:');
  listTemplates().forEach(t => console.log(`  • ${t}`));
  process.exit(0);
}

const templateName = args[0];
const targetDir = args[1] || '.';

initTemplate(templateName, targetDir);
