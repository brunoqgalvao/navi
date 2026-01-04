import { useMemo } from "react";
import { MermaidDiagram } from "./MermaidDiagram";

interface MermaidRendererProps {
  content: string;
  renderMarkdown: (content: string) => string;
  jsonBlocksMap?: Map<string, any>;
}

interface ContentBlock {
  type: "markdown" | "mermaid";
  content: string;
}

interface ParsedContent {
  type: "html" | "json";
  content: string;
  jsonId?: string;
  jsonData?: any;
}

function parseContentBlocks(content: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  if (!content) return blocks;
  const parts = content.split(/```mermaid\n([\s\S]*?)\n```/g);

  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      if (parts[i].trim()) {
        blocks.push({ type: "markdown", content: parts[i] });
      }
    } else {
      blocks.push({ type: "mermaid", content: parts[i] });
    }
  }

  return blocks;
}

function parseHtmlForJsonPlaceholders(
  html: string,
  jsonBlocksMap: Map<string, any>
): ParsedContent[] {
  const parts: ParsedContent[] = [];
  const regex = /<div class="json-block-placeholder" data-json-id="([^"]+)"><\/div>/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(html)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "html", content: html.slice(lastIndex, match.index) });
    }
    const jsonId = match[1];
    const jsonData = jsonBlocksMap.get(jsonId);
    if (jsonData !== undefined) {
      parts.push({ type: "json", content: "", jsonId, jsonData });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < html.length) {
    parts.push({ type: "html", content: html.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: "html", content: html }];
}

export function MermaidRenderer({
  content,
  renderMarkdown,
  jsonBlocksMap = new Map(),
}: MermaidRendererProps) {
  const contentBlocks = useMemo(() => parseContentBlocks(content), [content]);

  return (
    <>
      {contentBlocks.map((block, idx) => {
        if (block.type === "markdown") {
          const renderedHtml = renderMarkdown(block.content);
          const parsedParts = parseHtmlForJsonPlaceholders(renderedHtml, jsonBlocksMap);

          return (
            <div key={idx} className="markdown-content">
              {parsedParts.map((part, partIdx) => {
                if (part.type === "html") {
                  return (
                    <div
                      key={partIdx}
                      dangerouslySetInnerHTML={{ __html: part.content }}
                    />
                  );
                }
                if (part.type === "json" && part.jsonData) {
                  return (
                    <div
                      key={partIdx}
                      className="my-4 rounded-lg overflow-hidden border border-gray-200"
                    >
                      <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                        <span className="text-xs text-gray-500 font-mono uppercase tracking-wide font-semibold">
                          JSON
                        </span>
                      </div>
                      <pre className="p-4 text-xs overflow-auto max-h-96 bg-white">
                        <code>{JSON.stringify(part.jsonData, null, 2)}</code>
                      </pre>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          );
        }

        if (block.type === "mermaid") {
          return <MermaidDiagram key={idx} code={block.content} />;
        }

        return null;
      })}
    </>
  );
}
