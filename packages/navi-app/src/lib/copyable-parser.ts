export interface CopyableItem {
  id: string;
  text: string;
  label?: string;
}

export interface ParsedCopyable {
  items: CopyableItem[];
  processedContent: string;
}

const COPYABLE_BLOCK_REGEX = /```copyable\n([\s\S]*?)```/g;

let copyableIdCounter = 0;

function parseCopyableBlockContent(content: string): CopyableItem | null {
  const lines = content.trim().split('\n');

  let label: string | undefined;
  let textLines: string[] = [];
  let inText = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Check for label
    const labelMatch = trimmed.match(/^label:\s*(.+)$/i);
    if (labelMatch && !inText) {
      label = labelMatch[1].trim().replace(/^["']|["']$/g, '');
      continue;
    }

    // Check for text: marker (multiline support)
    const textMatch = trimmed.match(/^text:\s*(.*)$/i);
    if (textMatch) {
      inText = true;
      const afterMarker = textMatch[1].trim();
      if (afterMarker) {
        textLines.push(afterMarker);
      }
      continue;
    }

    // If we've seen text: marker, collect all lines
    if (inText) {
      textLines.push(line);
    } else if (trimmed && !trimmed.includes(':')) {
      // Bare text without text: marker - treat as simple content
      textLines.push(line);
    }
  }

  const text = textLines.join('\n').trim();

  if (!text) {
    return null;
  }

  return {
    id: `copyable-${++copyableIdCounter}`,
    text,
    label,
  };
}

export function parseCopyableContent(content: string): ParsedCopyable {
  const items: CopyableItem[] = [];

  const processedContent = content.replace(COPYABLE_BLOCK_REGEX, (_, blockContent) => {
    const item = parseCopyableBlockContent(blockContent);
    if (item) {
      items.push(item);
      // Return a placeholder that we'll replace with the component
      return `<!--COPYABLE:${item.id}-->`;
    }
    return '';
  });

  return { items, processedContent };
}

export function resetCopyableCounter(): void {
  copyableIdCounter = 0;
}
