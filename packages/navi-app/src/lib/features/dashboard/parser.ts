/**
 * Dashboard Markdown Parser
 *
 * Parses .claude/dashboard.md into structured blocks.
 * Special code blocks become interactive widgets.
 */

import type { Dashboard, DashboardBlock, DashboardAction, WidgetType, WidgetConfig } from './types';
import YAML from 'yaml';

// Regex to match code blocks: ```type\ncontent\n```
const CODE_BLOCK_REGEX = /```(\w+(?::\w+[-\w]*)?)\n([\s\S]*?)```/g;

/**
 * Parse dashboard markdown into structured blocks
 */
export function parseDashboard(markdown: string): Dashboard {
  try {
    const blocks: DashboardBlock[] = [];
    let lastIndex = 0;

    // Find all code blocks
    const matches = [...markdown.matchAll(CODE_BLOCK_REGEX)];

    for (const match of matches) {
      const [fullMatch, blockType, content] = match;
      const matchIndex = match.index!;

      // Add markdown before this code block
      if (matchIndex > lastIndex) {
        const markdownContent = markdown.slice(lastIndex, matchIndex).trim();
        if (markdownContent) {
          blocks.push({ type: 'markdown', content: markdownContent });
        }
      }

      // Parse the code block
      const block = parseCodeBlock(blockType, content.trim());
      if (block) {
        blocks.push(block);
      } else {
        // Unknown block type - keep as markdown (code block)
        blocks.push({ type: 'markdown', content: fullMatch });
      }

      lastIndex = matchIndex + fullMatch.length;
    }

    // Add remaining markdown
    if (lastIndex < markdown.length) {
      const remaining = markdown.slice(lastIndex).trim();
      if (remaining) {
        blocks.push({ type: 'markdown', content: remaining });
      }
    }

    return { raw: markdown, blocks };
  } catch (error) {
    return {
      raw: markdown,
      blocks: [{ type: 'markdown', content: markdown }],
      error: error instanceof Error ? error.message : 'Failed to parse dashboard'
    };
  }
}

/**
 * Parse a single code block into a dashboard block
 */
function parseCodeBlock(blockType: string, content: string): DashboardBlock | null {
  // Handle actions block
  if (blockType === 'actions') {
    return parseActionsBlock(content);
  }

  // Handle widget blocks (widget:type)
  if (blockType.startsWith('widget:')) {
    const widgetType = blockType.slice(7) as WidgetType;
    return parseWidgetBlock(widgetType, content);
  }

  // Unknown block type
  return null;
}

/**
 * Parse actions block YAML
 */
function parseActionsBlock(content: string): DashboardBlock {
  try {
    const parsed = YAML.parse(content);
    const actions: DashboardAction[] = Array.isArray(parsed)
      ? parsed.map(item => ({
          name: item.name || 'Action',
          command: item.command || '',
          confirm: item.confirm ?? false
        }))
      : [];

    return { type: 'actions', actions };
  } catch {
    return { type: 'actions', actions: [] };
  }
}

/**
 * Parse widget block YAML config
 */
function parseWidgetBlock(widgetType: WidgetType, content: string): DashboardBlock | null {
  const validWidgets: WidgetType[] = ['git-log', 'preview', 'file', 'status', 'suggestions'];

  if (!validWidgets.includes(widgetType)) {
    return null;
  }

  try {
    const config = content ? YAML.parse(content) : {};
    return { type: 'widget', widget: widgetType, config: config as WidgetConfig };
  } catch {
    return { type: 'widget', widget: widgetType, config: {} as WidgetConfig };
  }
}

/**
 * Validate dashboard structure
 */
export function validateDashboard(dashboard: Dashboard): string[] {
  const errors: string[] = [];

  for (const block of dashboard.blocks) {
    if (block.type === 'actions') {
      for (const action of block.actions) {
        if (!action.command) {
          errors.push(`Action "${action.name}" has no command`);
        }
      }
    }

    if (block.type === 'widget') {
      if (block.widget === 'preview') {
        const config = block.config as { url?: string };
        if (!config.url) {
          errors.push('Preview widget requires a url');
        }
      }
      if (block.widget === 'file') {
        const config = block.config as { path?: string };
        if (!config.path) {
          errors.push('File widget requires a path');
        }
      }
      if (block.widget === 'status') {
        const config = block.config as { services?: unknown[] };
        if (!config.services || !Array.isArray(config.services)) {
          errors.push('Status widget requires a services array');
        }
      }
    }
  }

  return errors;
}
