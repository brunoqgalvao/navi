/**
 * Parser for embedded markdown file blocks.
 * Extracts ```markdown-file blocks from content and returns parsed metadata.
 *
 * Usage:
 * ```markdown-file
 * path: /path/to/file.md
 * title: Optional title
 * height: 300
 * ```
 *
 * Or with raw markdown content:
 * ```markdown-file
 * title: My Document
 * ---
 * # Markdown content here
 * This is the actual markdown to display...
 * ```
 */

export interface MarkdownFileItem {
  /** File path to load (mutually exclusive with content) */
  path?: string;
  /** Raw markdown content to display (mutually exclusive with path) */
  content?: string;
  /** Title shown in the header */
  title?: string;
  /** Height of the viewer in pixels (default: 300) */
  height?: number;
  /** Whether to start collapsed */
  collapsed?: boolean;
}

export interface ParsedMarkdownFile {
  items: MarkdownFileItem[];
  processedContent: string;
}

const MARKDOWN_FILE_BLOCK_REGEX = /```markdown-file\n([\s\S]*?)```/g;

function parseMarkdownFileBlockContent(blockContent: string): MarkdownFileItem | null {
  const lines = blockContent.trim().split('\n');
  const item: MarkdownFileItem = {};

  let contentStartIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check for content separator
    if (trimmed === '---') {
      contentStartIndex = i + 1;
      break;
    }

    // Parse key: value pairs
    const pathMatch = trimmed.match(/^path:\s*(.+)$/i);
    if (pathMatch) {
      item.path = pathMatch[1].trim().replace(/^["']|["']$/g, '');
      continue;
    }

    const titleMatch = trimmed.match(/^title:\s*(.+)$/i);
    if (titleMatch) {
      item.title = titleMatch[1].trim().replace(/^["']|["']$/g, '');
      continue;
    }

    const heightMatch = trimmed.match(/^height:\s*(\d+)$/i);
    if (heightMatch) {
      item.height = parseInt(heightMatch[1], 10);
      continue;
    }

    const collapsedMatch = trimmed.match(/^collapsed:\s*(true|false)$/i);
    if (collapsedMatch) {
      item.collapsed = collapsedMatch[1].toLowerCase() === 'true';
      continue;
    }
  }

  // If we found a content separator, everything after is markdown content
  if (contentStartIndex > -1) {
    item.content = lines.slice(contentStartIndex).join('\n');
  }

  // Must have either path or content
  if (!item.path && !item.content) {
    return null;
  }

  return item;
}

export function parseMarkdownFileContent(content: string): ParsedMarkdownFile {
  const items: MarkdownFileItem[] = [];

  const processedContent = content.replace(MARKDOWN_FILE_BLOCK_REGEX, (match, blockContent) => {
    const item = parseMarkdownFileBlockContent(blockContent);
    if (item) {
      items.push(item);
      // Return a placeholder that will be replaced with the component
      return `<div class="markdown-file-placeholder" data-index="${items.length - 1}"></div>`;
    }
    // If parsing failed, keep the original block
    return match;
  }).trim();

  return { items, processedContent };
}
