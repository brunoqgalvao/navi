import { marked, type Tokens } from "marked";
import hljs from "highlight.js";

// Custom renderer
const renderer = new marked.Renderer();

// Links with favicons and external indicators
renderer.link = ({ href, title, text }: Tokens.Link) => {
  const titleAttr = title ? ` title="${title}"` : "";
  let url = href;
  if (url.startsWith("//")) {
    url = "https:" + url;
  }
  const isExternal = url.startsWith("http://") || url.startsWith("https://");
  const isLocalhost = url.includes("localhost") || url.match(/:\d+/);
  if (isExternal) {
    try {
      const domain = new URL(url).hostname;
      const favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
      if (isLocalhost) {
        return `<a href="${url}"${titleAttr} data-url="${url}" class="source-link preview-link external-link"><img src="${favicon}" alt="" class="source-favicon" onerror="this.style.display='none'">${text}<span class="external-arrow">↗</span></a>`;
      }
      return `<a href="${url}"${titleAttr} data-url="${url}" target="_blank" rel="noopener noreferrer" class="source-link external-link"><img src="${favicon}" alt="" class="source-favicon" onerror="this.style.display='none'">${text}<span class="external-arrow">↗</span></a>`;
    } catch {
      if (isLocalhost) {
        return `<a href="${url}"${titleAttr} data-url="${url}" class="preview-link external-link">${text}<span class="external-arrow">↗</span></a>`;
      }
      return `<a href="${url}"${titleAttr} data-url="${url}" target="_blank" rel="noopener noreferrer" class="external-link">${text}<span class="external-arrow">↗</span></a>`;
    }
  }
  return `<a href="${url}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
};

// Store for JSON blocks that need interactive rendering
let jsonBlocksMap = new Map<string, unknown>();
let jsonBlockCounter = 0;

export function getJsonBlocksMap(): Map<string, unknown> {
  return jsonBlocksMap;
}

export function resetJsonBlocks(): void {
  jsonBlocksMap = new Map();
  jsonBlockCounter = 0;
}

// Code blocks with syntax highlighting
renderer.code = ({ text, lang }: Tokens.Code) => {
  const language = lang || "";
  const shellLanguages = ["bash", "sh", "shell", "zsh", "console", "terminal"];

  // Use terminal style for shell/bash output
  if (shellLanguages.includes(language.toLowerCase())) {
    const escapedText = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return `<div class="terminal-block"><div class="terminal-header"><span class="terminal-dot red"></span><span class="terminal-dot yellow"></span><span class="terminal-dot green"></span><span class="terminal-title">${language}</span></div><pre class="terminal-content">${escapedText}</pre></div>`;
  }

  // Use interactive JSON tree for JSON
  if (language.toLowerCase() === "json") {
    try {
      const parsed = JSON.parse(text);
      const id = `json-tree-${jsonBlockCounter++}`;
      jsonBlocksMap.set(id, parsed);
      return `<div class="json-block-placeholder" data-json-id="${id}"></div>`;
    } catch {
      // If JSON is invalid, fall through to regular highlighting
    }
  }

  // Use syntax highlighting for other languages
  let highlighted: string;
  if (language && hljs.getLanguage(language)) {
    highlighted = hljs.highlight(text, { language }).value;
  } else {
    highlighted = hljs.highlightAuto(text).value;
  }

  const langLabel = language
    ? `<span class="code-language">${language}</span>`
    : "";
  return `<div class="code-block-wrapper"><div class="code-header">${langLabel}</div><pre class="hljs"><code>${highlighted}</code></pre></div>`;
};

marked.setOptions({ renderer });

export function renderMarkdown(content: string): string {
  return marked.parse(content, { async: false }) as string;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
