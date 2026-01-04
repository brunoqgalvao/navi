import { useRef, useEffect, useState } from "react";

interface MermaidDiagramProps {
  code: string;
}

export function MermaidDiagram({ code }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      try {
        // Dynamically import mermaid to avoid SSR issues
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "default",
          securityLevel: "loose",
        });

        const id = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const { svg: renderedSvg } = await mermaid.render(id, code);

        if (!cancelled) {
          setSvg(renderedSvg);
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Mermaid render error:", err);
          setError(err instanceof Error ? err.message : "Failed to render diagram");
        }
      }
    }

    renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [code]);

  if (error) {
    return (
      <div className="my-4 p-4 rounded-lg border border-red-200 bg-red-50">
        <div className="flex items-center gap-2 text-red-700 text-sm mb-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="font-medium">Mermaid Diagram Error</span>
        </div>
        <pre className="text-xs text-red-600 whitespace-pre-wrap">{error}</pre>
        <details className="mt-2">
          <summary className="text-xs text-red-500 cursor-pointer">Show code</summary>
          <pre className="mt-2 text-xs text-gray-600 bg-white p-2 rounded border border-red-200 overflow-auto">
            {code}
          </pre>
        </details>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="my-4 p-4 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center">
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <svg
            className="w-4 h-4 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          Rendering diagram...
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="mermaid-diagram my-4 overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
