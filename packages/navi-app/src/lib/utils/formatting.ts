import type { ContentBlock, TextBlock, ToolUseBlock } from "../claude";

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function relativeTime(timestamp: number | null | undefined): string {
  if (!timestamp) return "Never";
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function formatContent(content: ContentBlock[] | string): string {
  if (typeof content === "string") return content;
  
  return content
    .map((block) => {
      if (block.type === "text") {
        return (block as TextBlock).text;
      }
      if (block.type === "tool_use") {
        const tool = block as ToolUseBlock;
        return `[Using ${tool.name}]`;
      }
      return "";
    })
    .filter(text => text)
    .join(" ");
}

const localUrlPattern = /(https?:\/\/localhost[:\d]*[^\s<"']*|https?:\/\/127\.0\.0\.1[:\d]*[^\s<"']*|https?:\/\/0\.0\.0\.0[:\d]*[^\s<"']*|(?<![\/\w])localhost:\d+[^\s<"']*|(?<![\/\w])127\.0\.0\.1:\d+[^\s<"']*|(?<![\/\w])0\.0\.0\.0:\d+[^\s<"']*)/g;

function splitTrailingUrlPunctuation(url: string): { coreUrl: string; trailing: string } {
  let coreUrl = url;
  let trailing = "";

  const moveLastCharToTrailing = () => {
    const lastChar = coreUrl.slice(-1);
    if (!lastChar) return;
    coreUrl = coreUrl.slice(0, -1);
    trailing = `${lastChar}${trailing}`;
  };

  while (coreUrl && /[.,!?;:]/.test(coreUrl.slice(-1))) {
    moveLastCharToTrailing();
  }

  while (coreUrl) {
    const lastChar = coreUrl.slice(-1);
    const openingChar = lastChar === ")" ? "(" : lastChar === "]" ? "[" : lastChar === "}" ? "{" : "";
    if (!openingChar) break;

    const openingCount = (coreUrl.match(new RegExp(`\\${openingChar}`, "g")) || []).length;
    const closingCount = (coreUrl.match(new RegExp(`\\${lastChar}`, "g")) || []).length;

    if (closingCount <= openingCount) break;
    moveLastCharToTrailing();
  }

  return { coreUrl, trailing };
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function linkifyUrls(html: string, escapeHtmlFn: typeof escapeHtml = escapeHtml): string {
  // Split HTML into tags and text content to avoid matching URLs inside attributes
  const parts = html.split(/(<[^>]+>)/);

  let insideAnchor = false;
  let insideCode = false;
  let insidePre = false;

  return parts.map(part => {
    // If this part is an HTML tag (starts with <), don't process it
    if (part.startsWith('<')) {
      const tagMatch = part.match(/^<\s*(\/)?\s*([a-z0-9]+)/i);
      if (tagMatch) {
        const isClosing = Boolean(tagMatch[1]);
        const tagName = tagMatch[2].toLowerCase();

        if (tagName === "a") insideAnchor = !isClosing;
        if (tagName === "code") insideCode = !isClosing;
        if (tagName === "pre") insidePre = !isClosing;
      }
      return part;
    }

    // Don't linkify URLs that are already inside anchor, code, or pre tags.
    if (insideAnchor || insideCode || insidePre) {
      return part;
    }

    // Only linkify URLs in text content outside of anchor tags
    return part.replace(localUrlPattern, (matchedUrl) => {
      const { coreUrl, trailing } = splitTrailingUrlPunctuation(matchedUrl);
      if (!coreUrl) return matchedUrl;

      const decodedUrl = decodeHtmlEntities(coreUrl);
      const fullUrl = decodedUrl.startsWith("http") ? decodedUrl : `http://${decodedUrl}`;
      return `<a href="#" class="preview-link" data-url="${escapeHtmlFn(fullUrl)}">${coreUrl}</a>${trailing}`;
    });
  }).join('');
}

export function linkifyCodePaths(
  html: string, 
  projectPath: string | undefined,
  projectFileIndex: Map<string, string>,
  escapeHtmlFn: typeof escapeHtml = escapeHtml
): string {
  return html.replace(/<code>([^<]+)<\/code>/g, (match, codeContent) => {
    const decoded = codeContent
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"');
    
    const indexedPath = projectFileIndex.get(decoded);
    if (indexedPath) {
      return `<code class="file-link" data-path="${escapeHtmlFn(indexedPath)}">${codeContent}</code>`;
    }
    
    const isFilePath = /^(\/[\w\-\.\/]+|\.\.?\/[\w\-\.\/]+|[\w\-\/]+\.(ts|js|tsx|jsx|svelte|vue|py|rs|go|md|json|css|scss|html|yml|yaml|toml|sql|sh|txt|env|lock|pdf|csv|xml|log))$/.test(decoded);
    
    if (isFilePath) {
      let fullPath = decoded;
      if (!decoded.startsWith("/") && projectPath) {
        fullPath = `${projectPath}/${decoded.replace(/^\.\//,"")}`;
      }
      return `<code class="file-link" data-path="${escapeHtmlFn(fullPath)}">${codeContent}</code>`;
    }
    return match;
  });
}

export function linkifyFilenames(
  html: string,
  projectFileIndex: Map<string, string>,
  escapeHtmlFn: typeof escapeHtml = escapeHtml
): string {
  const filenamePattern = /([\w\-\.]+\.(csv|txt|json|xml|md|pdf|log|sql|yml|yaml|toml|env|html|css|js|ts|tsx|jsx|py|rs|go|svelte|vue|sh|lock))(?![^<]*<\/code>)(?![^<]*<\/a>)/gi;
  return html.replace(filenamePattern, (match, filename) => {
    const indexedPath = projectFileIndex.get(filename);
    if (indexedPath) {
      return `<span class="file-link cursor-pointer text-blue-600 hover:text-blue-800 hover:underline" data-path="${escapeHtmlFn(indexedPath)}">${match}</span>`;
    }
    return match;
  });
}

export interface ChatReferenceInfo {
  id: string;
  title?: string;
}

export function linkifyChatReferences(
  html: string,
  chatLookup: Map<string, { title: string; projectName?: string }>,
  escapeHtmlFn: typeof escapeHtml = escapeHtml
): string {
  // Pattern: [[chat:SESSION_ID]] or [[chat:SESSION_ID|Custom Title]]
  // Matches inside HTML content (avoids tags)
  const chatRefPattern = /\[\[chat:([a-f0-9-]{36})(?:\|([^\]]+))?\]\]/gi;

  return html.replace(chatRefPattern, (match, sessionId, customTitle) => {
    const chatInfo = chatLookup.get(sessionId);
    const displayTitle = customTitle || chatInfo?.title || 'Chat';
    const projectName = chatInfo?.projectName || '';

    return `<span class="chat-reference" data-session-id="${escapeHtmlFn(sessionId)}" data-title="${escapeHtmlFn(displayTitle)}" data-project="${escapeHtmlFn(projectName)}" title="Click to open chat${projectName ? ` (${projectName})` : ''}"><span class="chat-reference-icon">💬</span><span class="chat-reference-title">${escapeHtmlFn(displayTitle)}</span></span>`;
  });
}

export function linkifyFileLineReferences(
  html: string, 
  projectPath: string | undefined,
  projectFileIndex: Map<string, string>,
  escapeHtmlFn: typeof escapeHtml = escapeHtml
): string {
  const fileLinePattern = /(?:^|(?<=\s|>|^))(`?)([^\s<>`]+\.(ts|js|tsx|jsx|svelte|vue|py|rs|go|md|json|css|scss|html|yml|yaml|toml|sql|sh|txt|env|lock|pdf|csv|xml|log)):(\d+)(?:-(\d+))?\1(?=\s|<|$|[.,;!?])/gm;
  
  return html.replace(fileLinePattern, (match, backtick, filePath, extension, startLine, endLine) => {
    let fullPath = filePath;
    
    const indexedPath = projectFileIndex.get(filePath) || 
                        projectFileIndex.get(filePath.split('/').pop() || '');
    
    if (indexedPath) {
      fullPath = indexedPath;
    } else if (!filePath.startsWith("/") && projectPath) {
      fullPath = `${projectPath}/${filePath.replace(/^\.\//,"")}`;
    }

    const lineInfo = endLine ? `${startLine}-${endLine}` : startLine;
    const displayText = backtick ? `\`${filePath}:${lineInfo}\`` : `${filePath}:${lineInfo}`;
    
    return `<span class="file-line-link" data-path="${escapeHtmlFn(fullPath)}" data-line="${escapeHtmlFn(startLine)}" data-end-line="${escapeHtmlFn(endLine || '')}">${displayText}</span>`;
  });
}

export function renderMarkdownWithLinks(
  content: string,
  marked: { parse: (content: string) => string },
  projectPath: string | undefined,
  projectFileIndex: Map<string, string>
): string {
  const html = marked.parse(content) as string;
  return linkifyFilenames(
    linkifyUrls(
      linkifyFileLineReferences(
        linkifyCodePaths(html, projectPath, projectFileIndex),
        projectPath,
        projectFileIndex
      )
    ),
    projectFileIndex
  );
}
