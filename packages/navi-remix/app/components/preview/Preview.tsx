import { useState, useEffect, useCallback } from "react";
import { renderMarkdown } from "~/lib/markdown";
import { API_BASE } from "~/lib/api";
import hljs from "highlight.js";

type PreviewType = "url" | "file" | "markdown" | "code" | "image" | "pdf" | "audio" | "video" | "csv" | "json" | "none";

interface PreviewProps {
  source: string;
  type?: PreviewType;
  onClose?: () => void;
  onUrlChange?: (url: string) => void;
  basePath?: string;
}

const imageExtensions = ["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp"];
const audioExtensions = ["mp3", "wav", "ogg", "flac", "aac", "m4a", "wma"];
const videoExtensions = ["mp4", "webm", "mov", "avi", "mkv", "m4v", "ogv"];
const csvExtensions = ["csv", "tsv"];
const codeExtensions = ["js", "ts", "jsx", "tsx", "svelte", "vue", "py", "rs", "go", "java", "c", "cpp", "h", "css", "scss", "sass", "less", "html", "xml", "yaml", "yml", "toml", "sh", "bash", "zsh", "sql", "graphql", "prisma"];
const jsonExtensions = ["json"];
const markdownExtensions = ["md", "mdx", "markdown"];
const pdfExtensions = ["pdf"];

function detectType(src: string): PreviewType {
  if (!src) return "none";

  if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("localhost") || src.match(/^:\d+/)) {
    return "url";
  }

  const ext = src.split(".").pop()?.toLowerCase() || "";

  if (imageExtensions.includes(ext)) return "image";
  if (audioExtensions.includes(ext)) return "audio";
  if (videoExtensions.includes(ext)) return "video";
  if (csvExtensions.includes(ext)) return "csv";
  if (pdfExtensions.includes(ext)) return "pdf";
  if (markdownExtensions.includes(ext)) return "markdown";
  if (jsonExtensions.includes(ext)) return "json";
  if (codeExtensions.includes(ext)) return "code";

  return "file";
}

function getLanguage(ext: string): string {
  const map: Record<string, string> = {
    js: "javascript", ts: "typescript", jsx: "javascript", tsx: "typescript",
    py: "python", rs: "rust", go: "go", java: "java", c: "c", cpp: "cpp",
    svelte: "html", vue: "html", html: "html", xml: "xml",
    css: "css", scss: "scss", sass: "sass", less: "less",
    json: "json", yaml: "yaml", yml: "yaml", toml: "toml",
    sh: "bash", bash: "bash", zsh: "bash", sql: "sql",
    md: "markdown", mdx: "markdown", graphql: "graphql", prisma: "prisma"
  };
  return map[ext] || "plaintext";
}

function formatUrl(url: string): string {
  if (url.startsWith(":")) return `http://localhost${url}`;
  if (url.startsWith("localhost")) return `http://${url}`;
  return url;
}

export function Preview({
  source,
  type: propType,
  onClose,
  onUrlChange,
  basePath = "",
}: PreviewProps) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [currentUrl, setCurrentUrl] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [iframeLoading, setIframeLoading] = useState(false);

  const detectedType = propType || detectType(source);

  const loadFile = useCallback(async (path: string) => {
    setLoading(true);
    setError("");
    try {
      const [filePath] = path.split('#');
      const res = await fetch(`${API_BASE}/fs/read?path=${encodeURIComponent(filePath)}`);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setContent(data.content);
      }
    } catch (e) {
      setError("Failed to load file");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!source) return;

    const type = detectType(source);
    if (type === "url") {
      const formatted = formatUrl(source);
      setCurrentUrl(formatted);
      setUrlInput(formatted);
      if (history.length === 0 || history[historyIndex] !== formatted) {
        setHistory([...history.slice(0, historyIndex + 1), formatted]);
        setHistoryIndex(historyIndex + 1);
      }
    } else if (["file", "code", "markdown", "json", "csv"].includes(type)) {
      loadFile(source);
    }
  }, [source, loadFile]);

  const navigateTo = (url: string) => {
    const formatted = formatUrl(url);
    setCurrentUrl(formatted);
    setHistory([...history.slice(0, historyIndex + 1), formatted]);
    setHistoryIndex(historyIndex + 1);
    onUrlChange?.(formatted);
  };

  const goBack = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setCurrentUrl(history[historyIndex - 1]);
    }
  };

  const goForward = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setCurrentUrl(history[historyIndex + 1]);
    }
  };

  const refresh = () => {
    setIframeLoading(true);
  };

  const ext = source.split(".").pop()?.toLowerCase() || "";

  if (!source && detectedType === "none") {
    return (
      <div className="flex flex-col h-full items-center justify-center text-gray-400 p-4">
        <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
        <p className="text-sm">No preview selected</p>
        <p className="text-xs mt-1">Select a file or enter a URL to preview</p>
      </div>
    );
  }

  // URL Preview (iframe)
  if (detectedType === "url") {
    return (
      <div className="flex flex-col h-full">
        {/* URL bar */}
        <div className="flex items-center gap-2 p-2 border-b border-gray-200">
          <button
            onClick={goBack}
            disabled={historyIndex <= 0}
            className="p-1.5 text-gray-500 hover:bg-gray-100 rounded disabled:opacity-30"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={goForward}
            disabled={historyIndex >= history.length - 1}
            className="p-1.5 text-gray-500 hover:bg-gray-100 rounded disabled:opacity-30"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button onClick={refresh} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && navigateTo(urlInput)}
            className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-gray-900"
            placeholder="Enter URL..."
          />
        </div>
        {/* iframe */}
        <div className="flex-1 relative">
          {iframeLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80">
              <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
            </div>
          )}
          <iframe
            src={currentUrl}
            className="w-full h-full border-0"
            onLoad={() => setIframeLoading(false)}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
        <p className="mt-2 text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-red-500 p-4">
        <svg className="w-8 h-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  // Image preview
  if (detectedType === "image") {
    return (
      <div className="flex h-full items-center justify-center p-4 bg-gray-50">
        <img
          src={`${API_BASE}/fs/read?path=${encodeURIComponent(source)}&raw=true`}
          alt={source.split("/").pop()}
          className="max-w-full max-h-full object-contain rounded-lg shadow-sm"
        />
      </div>
    );
  }

  // Audio preview
  if (detectedType === "audio") {
    return (
      <div className="flex flex-col h-full items-center justify-center p-4">
        <audio controls className="w-full max-w-md">
          <source src={`${API_BASE}/fs/read?path=${encodeURIComponent(source)}&raw=true`} />
        </audio>
        <p className="mt-2 text-sm text-gray-500">{source.split("/").pop()}</p>
      </div>
    );
  }

  // Video preview
  if (detectedType === "video") {
    return (
      <div className="flex h-full items-center justify-center p-4 bg-black">
        <video controls className="max-w-full max-h-full">
          <source src={`${API_BASE}/fs/read?path=${encodeURIComponent(source)}&raw=true`} />
        </video>
      </div>
    );
  }

  // PDF preview
  if (detectedType === "pdf") {
    return (
      <iframe
        src={`${API_BASE}/fs/read?path=${encodeURIComponent(source)}&raw=true`}
        className="w-full h-full border-0"
      />
    );
  }

  // Markdown preview
  if (detectedType === "markdown") {
    return (
      <div className="h-full overflow-auto p-4">
        <div
          className="prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
        />
      </div>
    );
  }

  // JSON preview
  if (detectedType === "json") {
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = null;
    }

    return (
      <div className="h-full overflow-auto p-4 bg-gray-50">
        <pre className="text-sm font-mono text-gray-800 whitespace-pre-wrap">
          {JSON.stringify(parsed || content, null, 2)}
        </pre>
      </div>
    );
  }

  // Code preview
  if (detectedType === "code" || detectedType === "file") {
    const lang = getLanguage(ext);
    let highlighted = content;
    try {
      if (hljs.getLanguage(lang)) {
        highlighted = hljs.highlight(content, { language: lang }).value;
      }
    } catch {
      // Use plain content
    }

    return (
      <div className="h-full overflow-auto">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-200 bg-gray-50">
          <span className="text-xs font-medium text-gray-600">{source.split("/").pop()}</span>
          <span className="text-xs text-gray-400">{lang}</span>
        </div>
        <pre className="p-4 text-sm font-mono overflow-auto bg-gray-900 text-gray-100">
          <code dangerouslySetInnerHTML={{ __html: highlighted }} />
        </pre>
      </div>
    );
  }

  // CSV preview
  if (detectedType === "csv") {
    const rows = content.split("\n").map((line) => line.split(","));
    return (
      <div className="h-full overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              {rows[0]?.map((cell, i) => (
                <th key={i} className="px-3 py-2 text-left font-medium text-gray-700 border-b border-gray-200">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(1).map((row, i) => (
              <tr key={i} className="hover:bg-gray-50">
                {row.map((cell, j) => (
                  <td key={j} className="px-3 py-2 border-b border-gray-100">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return null;
}
