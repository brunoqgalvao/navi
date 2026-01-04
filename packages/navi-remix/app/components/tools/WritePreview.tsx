import { useEffect, useMemo, useState } from "react";
import type { BundledLanguage, BundledTheme } from "shiki";
import { FileIcon } from "~/components/ui/FileIcon";

const MAX_PREVIEW_CHARS = 2000;
const SHIKI_THEME: BundledTheme = "github-dark-high-contrast";

const LANGUAGE_MAP: Record<string, BundledLanguage> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  py: "python",
  pyw: "python",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  md: "markdown",
  markdown: "markdown",
  yml: "yaml",
  yaml: "yaml",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  less: "less",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  rb: "ruby",
  php: "php",
  cs: "csharp",
  c: "c",
  h: "c",
  cc: "cpp",
  cpp: "cpp",
  cxx: "cpp",
  hh: "cpp",
  hpp: "cpp",
  sql: "sql",
  r: "r",
  vue: "vue",
};

function detectLanguage(filePath: string): BundledLanguage | null {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  return LANGUAGE_MAP[ext] || null;
}

interface WritePreviewProps {
  filePath: string;
  content: string;
}

export function WritePreview({ filePath, content }: WritePreviewProps) {
  const filename = useMemo(() => filePath.split("/").pop() || filePath, [filePath]);
  const lineCount = useMemo(() => content.split("\n").length, [content]);
  const previewContent = useMemo(
    () => content.slice(0, MAX_PREVIEW_CHARS),
    [content]
  );
  const remainingChars = content.length - previewContent.length;
  const language = useMemo(() => detectLanguage(filePath), [filePath]);
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function highlight() {
      if (!language) {
        setHighlightedHtml(null);
        return;
      }

      try {
        const { codeToHtml } = await import("shiki");
        const html = await codeToHtml(previewContent, {
          lang: language,
          theme: SHIKI_THEME,
        });
        if (!isCancelled) {
          setHighlightedHtml(html);
        }
      } catch (error) {
        console.error("Failed to highlight code preview", error);
        if (!isCancelled) {
          setHighlightedHtml(null);
        }
      }
    }

    highlight();

    return () => {
      isCancelled = true;
    };
  }, [language, previewContent]);

  return (
    <div className="p-3">
      {/* File info */}
      <div className="mb-2 flex items-center gap-2">
        <FileIcon filename={filename} />
        <span className="font-mono text-sm text-gray-900">{filePath}</span>
        <span className="text-xs text-gray-600">
          ({lineCount} lines)
        </span>
      </div>

      {/* Content preview */}
      <div className="relative rounded-xl border border-gray-200 bg-gray-50 p-0.5">
        <div className="max-h-96 overflow-auto rounded-lg bg-[#0b1021]">
          {highlightedHtml ? (
            <div
              className="shiki-wrapper"
              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            />
          ) : (
            <pre className="whitespace-pre-wrap break-words p-3 font-mono text-[12.5px] leading-[1.25] text-gray-100">
              {previewContent}
            </pre>
          )}
        </div>
        {remainingChars > 0 && (
          <div className="mt-2 text-xs text-gray-600">
            … {remainingChars.toLocaleString()} more characters not shown
          </div>
        )}
      </div>
    </div>
  );
}
