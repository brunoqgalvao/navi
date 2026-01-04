import { useState, useMemo, useEffect, useRef } from "react";
import { CopyButton } from "~/components/ui/CopyButton";

interface InteractiveCodeBlockProps {
  code: string;
  language?: string;
  maxLines?: number;
  onRun?: (code: string, language: string) => void;
}

const RUNNABLE_LANGUAGES = [
  "bash",
  "sh",
  "shell",
  "zsh",
  "fish",
  "javascript",
  "js",
  "node",
  "python",
  "py",
  "typescript",
  "ts",
];

export function InteractiveCodeBlock({
  code,
  language = "",
  maxLines = 15,
  onRun,
}: InteractiveCodeBlockProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [highlightedCode, setHighlightedCode] = useState("");
  const codeRef = useRef<HTMLElement>(null);

  const shouldCollapse = useMemo(() => {
    const lines = code.split("\n");
    return lines.length > maxLines;
  }, [code, maxLines]);

  useEffect(() => {
    setIsCollapsed(shouldCollapse);
  }, [shouldCollapse]);

  useEffect(() => {
    async function highlight() {
      try {
        const hljs = (await import("highlight.js")).default;
        if (language && hljs.getLanguage(language)) {
          setHighlightedCode(hljs.highlight(code, { language }).value);
        } else {
          setHighlightedCode(hljs.highlightAuto(code).value);
        }
      } catch {
        setHighlightedCode(code);
      }
    }
    highlight();
  }, [code, language]);

  const displayCode = useMemo(() => {
    if (!isCollapsed || !shouldCollapse) return highlightedCode;

    const lines = highlightedCode.split("\n");
    const visibleLines = lines.slice(0, maxLines);
    return visibleLines.join("\n");
  }, [isCollapsed, shouldCollapse, highlightedCode, maxLines]);

  const isRunnable = RUNNABLE_LANGUAGES.includes(language.toLowerCase());
  const hiddenLineCount = code.split("\n").length - maxLines;

  const handleRun = () => {
    onRun?.(code, language);
  };

  return (
    <div className="interactive-code-block relative group rounded-lg overflow-hidden border border-gray-700/50 shadow-lg my-4">
      {/* Header bar */}
      <div className="code-header flex items-center justify-between bg-[#1e1e2e] px-4 py-2.5 border-b border-gray-700/50">
        <div className="flex items-center gap-3">
          {language && (
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider font-mono">
              {language}
            </span>
          )}
          {shouldCollapse && (
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors"
              title={isCollapsed ? "Expand code" : "Collapse code"}
            >
              <svg
                className={`w-3 h-3 transition-transform ${isCollapsed ? "" : "rotate-180"}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
              {isCollapsed ? "Expand" : "Collapse"}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isRunnable && onRun && (
            <button
              onClick={handleRun}
              className="px-2 py-1 text-gray-400 hover:text-emerald-400 hover:bg-emerald-400/10 rounded transition-all flex items-center gap-1.5 text-xs"
              title="Run code"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              Run
            </button>
          )}
          <CopyButton text={code} className="text-xs text-gray-400 hover:text-gray-200" />
        </div>
      </div>

      {/* Code content */}
      <div className="code-content relative">
        <pre
          className={`hljs bg-[#11111b] text-gray-200 p-4 overflow-x-auto text-sm leading-relaxed ${
            isCollapsed && shouldCollapse ? "max-h-96" : ""
          }`}
        >
          <code
            ref={codeRef}
            dangerouslySetInnerHTML={{ __html: displayCode || code }}
          />
        </pre>

        {isCollapsed && shouldCollapse && (
          <>
            <div className="fade-overlay absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[#11111b] to-transparent pointer-events-none" />
            <div className="expand-hint absolute bottom-3 right-3 text-xs text-gray-500 bg-[#1e1e2e]/80 px-2 py-1 rounded pointer-events-none backdrop-blur-sm font-mono">
              +{hiddenLineCount} more lines
            </div>
          </>
        )}
      </div>
    </div>
  );
}
