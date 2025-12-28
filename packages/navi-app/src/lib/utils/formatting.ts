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

export function linkifyUrls(html: string, escapeHtmlFn: typeof escapeHtml = escapeHtml): string {
  // Split HTML into tags and text content to avoid matching URLs inside attributes
  const parts = html.split(/(<[^>]+>)/);

  const urlPattern = /(https?:\/\/localhost[:\d]*[^\s<"']*|https?:\/\/127\.0\.0\.1[:\d]*[^\s<"']*|(?<![\/\w])localhost:\d+[^\s<"']*|(?<![\/\w])127\.0\.0\.1:\d+[^\s<"']*)/g;

  let insideAnchor = false;

  return parts.map(part => {
    // Track if we're inside an <a> tag
    if (part.match(/^<a[\s>]/i)) {
      insideAnchor = true;
    } else if (part.match(/^<\/a>/i)) {
      insideAnchor = false;
    }

    // If this part is an HTML tag (starts with <), don't process it
    if (part.startsWith('<')) {
      return part;
    }

    // Don't linkify URLs that are already inside anchor tags (as link text)
    if (insideAnchor) {
      return part;
    }

    // Only linkify URLs in text content outside of anchor tags
    return part.replace(urlPattern, (url) => {
      const fullUrl = url.startsWith("http") ? url : `http://${url}`;
      return `<a href="#" class="preview-link" data-url="${escapeHtmlFn(fullUrl)}">${url}</a>`;
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
  return linkifyUrls(
    linkifyFilenames(
      linkifyFileLineReferences(
        linkifyCodePaths(html, projectPath, projectFileIndex),
        projectPath,
        projectFileIndex
      ),
      projectFileIndex
    )
  );
}
