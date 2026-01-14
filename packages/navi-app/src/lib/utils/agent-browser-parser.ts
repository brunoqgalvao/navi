/**
 * Parser utilities for agent-browser CLI output
 *
 * Parses accessibility tree snapshots, detects commands, and extracts metadata
 * from agent-browser tool output for the native Navi widget.
 */

export interface AccessibilityElement {
  ref: string;          // @e1, @e2, etc.
  role: string;         // button, textbox, link, heading, etc.
  name: string;         // Label/text content
  states: string[];     // [focused], [disabled], [nth=1], etc.
  level?: number;       // For headings: [level=1]
  indent: number;       // Nesting level based on indentation
}

export interface ParsedSnapshot {
  elements: AccessibilityElement[];
  raw: string;
}

export interface BrowserCommand {
  type: 'open' | 'snapshot' | 'click' | 'fill' | 'type' | 'press' | 'screenshot' |
        'hover' | 'select' | 'check' | 'uncheck' | 'focus' | 'wait' | 'evaluate' |
        'back' | 'forward' | 'reload' | 'close' | 'pdf' | 'cookies' | 'other';
  args: string[];
  session?: string;     // --session name
  raw: string;
}

export interface ParsedBrowserOutput {
  command: BrowserCommand;
  screenshot?: string;          // File path if screenshot was saved
  snapshot?: ParsedSnapshot;    // If snapshot command
  url?: string;                 // Current URL after navigation
  success: boolean;
  error?: string;
}

/**
 * Check if a Bash command is an agent-browser command
 */
export function isAgentBrowserCommand(command: string): boolean {
  const trimmed = command.trim();
  return trimmed.startsWith('agent-browser ') || trimmed === 'agent-browser';
}

/**
 * Parse an agent-browser CLI command into structured data
 */
export function parseCommand(command: string): BrowserCommand {
  const trimmed = command.trim();
  const parts = trimmed.split(/\s+/);

  // Skip 'agent-browser' prefix
  const args = parts.slice(1);

  // Extract --session flag if present
  let session: string | undefined;
  const sessionIdx = args.indexOf('--session');
  if (sessionIdx !== -1 && args[sessionIdx + 1]) {
    session = args[sessionIdx + 1];
  }

  // Get the command type - look for known command names, skipping flag values
  const cmdTypes: BrowserCommand['type'][] = [
    'open', 'snapshot', 'click', 'fill', 'type', 'press', 'screenshot',
    'hover', 'select', 'check', 'uncheck', 'focus', 'wait', 'evaluate',
    'back', 'forward', 'reload', 'close', 'pdf', 'cookies'
  ];

  let type: BrowserCommand['type'] = 'other';
  let skipNext = false;

  for (const arg of args) {
    // Skip values that follow flags like --session, --viewport, etc.
    if (skipNext) {
      skipNext = false;
      continue;
    }
    // Mark next arg to skip if this is a flag that takes a value
    if (arg.startsWith('--') && !arg.includes('=')) {
      skipNext = true;
      continue;
    }
    if (arg.startsWith('-')) {
      continue;
    }
    // Check if this arg is a known command type
    if (cmdTypes.includes(arg as BrowserCommand['type'])) {
      type = arg as BrowserCommand['type'];
      break;
    }
  }

  return {
    type,
    args,
    session,
    raw: command
  };
}

/**
 * Parse accessibility tree snapshot output
 *
 * Example input:
 * - document:
 *   - heading "Welcome" [ref=e1] [level=1]
 *   - textbox "Email" [ref=e2] [focused]
 *   - button "Submit" [ref=e3]
 */
export function parseSnapshot(output: string): ParsedSnapshot {
  const elements: AccessibilityElement[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    // Match lines with refs: @e1, [ref=e1], etc.
    const refMatch = line.match(/\[ref=([^\]]+)\]|(@e\d+)/);
    if (!refMatch) continue;

    const ref = refMatch[1] || refMatch[2];

    // Calculate indent level (2 spaces = 1 level)
    const leadingSpaces = line.match(/^[\s-]*/)?.[0].length || 0;
    const indent = Math.floor(leadingSpaces / 2);

    // Extract role (word before the quoted name or ref)
    const roleMatch = line.match(/(?:^|\s)([\w-]+)(?:\s+"[^"]*"|\s+\[ref=)/);
    const role = roleMatch?.[1] || 'element';

    // Extract name (quoted string)
    const nameMatch = line.match(/"([^"]*)"/);
    const name = nameMatch?.[1] || '';

    // Extract states like [focused], [disabled], [nth=1]
    const states: string[] = [];
    const stateMatches = line.matchAll(/\[([^\]]+)\]/g);
    for (const match of stateMatches) {
      const state = match[1];
      // Skip ref= as it's not a state
      if (!state.startsWith('ref=')) {
        states.push(state);
      }
    }

    // Extract heading level
    const levelMatch = line.match(/\[level=(\d+)\]/);
    const level = levelMatch ? parseInt(levelMatch[1]) : undefined;

    elements.push({
      ref: ref.startsWith('@') ? ref : `@${ref}`,
      role,
      name,
      states,
      level,
      indent
    });
  }

  return {
    elements,
    raw: output
  };
}

/**
 * Extract screenshot file path from command output
 */
export function extractScreenshotPath(output: string): string | null {
  // Match patterns like: Screenshot saved to /tmp/screenshot.png
  // Or: ✓ Screenshot saved to /path/to/file.png
  const match = output.match(/Screenshot saved to\s+([^\s\n]+)/i);
  if (match) {
    return match[1];
  }

  // Also check for explicit file path in command args
  const pathMatch = output.match(/\/[\w\-./]+\.(png|jpg|jpeg|webp)/i);
  return pathMatch?.[0] || null;
}

/**
 * Extract URL from open command or navigation
 */
export function extractUrl(command: string, output: string): string | null {
  // Check command for URL
  const cmdUrlMatch = command.match(/(https?:\/\/[^\s]+)/);
  if (cmdUrlMatch) {
    return cmdUrlMatch[1];
  }

  // Check output for URL (after navigation)
  const outUrlMatch = output.match(/(https?:\/\/[^\s]+)/);
  return outUrlMatch?.[1] || null;
}

/**
 * Parse full agent-browser command and output into structured data
 */
export function parseBrowserOutput(command: string, output: string, isError: boolean): ParsedBrowserOutput {
  const parsedCommand = parseCommand(command);

  const result: ParsedBrowserOutput = {
    command: parsedCommand,
    success: !isError
  };

  if (isError) {
    result.error = output;
    return result;
  }

  // Extract screenshot path
  if (parsedCommand.type === 'screenshot' || output.includes('Screenshot saved')) {
    const path = extractScreenshotPath(output);
    if (path) result.screenshot = path;
  }

  // Parse snapshot output
  if (parsedCommand.type === 'snapshot' && (output.includes('[ref=') || output.includes('@e'))) {
    result.snapshot = parseSnapshot(output);
  }

  // Extract URL for navigation commands
  if (parsedCommand.type === 'open') {
    const url = extractUrl(command, output);
    if (url) result.url = url;
  }

  return result;
}

/**
 * Get a human-readable description of a browser command
 */
export function getCommandDescription(cmd: BrowserCommand): string {
  switch (cmd.type) {
    case 'open':
      const url = cmd.args.find(a => a.startsWith('http'));
      return `Opening ${url || 'URL'}`;
    case 'snapshot':
      return 'Getting accessibility snapshot';
    case 'click':
      const clickTarget = cmd.args.find(a => a.startsWith('@') || a.startsWith('"'));
      return `Clicking ${clickTarget || 'element'}`;
    case 'fill':
      const fillRef = cmd.args.find(a => a.startsWith('@'));
      return `Filling ${fillRef || 'input'}`;
    case 'type':
      return 'Typing text';
    case 'press':
      const key = cmd.args.find(a => !a.startsWith('-'));
      return `Pressing ${key || 'key'}`;
    case 'screenshot':
      return 'Taking screenshot';
    case 'hover':
      return 'Hovering element';
    case 'wait':
      return 'Waiting for element';
    case 'close':
      return 'Closing browser';
    default:
      return `Running ${cmd.type}`;
  }
}

/**
 * Get icon for command type
 */
export function getCommandIcon(type: BrowserCommand['type']): string {
  switch (type) {
    case 'open': return '🌐';
    case 'snapshot': return '📋';
    case 'click': return '👆';
    case 'fill': return '✏️';
    case 'type': return '⌨️';
    case 'press': return '⏎';
    case 'screenshot': return '📸';
    case 'hover': return '🖱️';
    case 'wait': return '⏳';
    case 'close': return '❌';
    case 'back': return '◀️';
    case 'forward': return '▶️';
    case 'reload': return '🔄';
    default: return '🔧';
  }
}
