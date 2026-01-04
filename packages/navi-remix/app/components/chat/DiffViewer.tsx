import { useMemo } from "react";

interface DiffViewerProps {
  oldText: string;
  newText: string;
  fileName?: string;
  outputFormat?: "line-by-line" | "side-by-side";
  showHeader?: boolean;
  maxHeight?: string;
}

export function DiffViewer({
  oldText = "",
  newText = "",
  fileName = "file",
  outputFormat = "line-by-line",
  showHeader = false,
  maxHeight = "300px",
}: DiffViewerProps) {
  const { diffHtml, stats } = useMemo(() => {
    if (oldText === newText) {
      return { diffHtml: null, stats: { added: 0, removed: 0 } };
    }

    // Simple diff implementation without external dependencies
    const oldLines = oldText ? oldText.split("\n") : [];
    const newLines = newText ? newText.split("\n") : [];

    let html = '<div class="d2h-wrapper"><div class="d2h-file-wrapper">';
    html += '<table class="d2h-diff-table"><tbody class="d2h-diff-tbody">';

    let added = 0;
    let removed = 0;

    // Simple line-by-line diff
    const maxLen = Math.max(oldLines.length, newLines.length);

    for (let i = 0; i < maxLen; i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];

      if (oldLine === newLine) {
        // Context line
        html += `<tr class="d2h-cntx">
          <td class="d2h-code-linenumber">${i + 1}</td>
          <td class="d2h-code-line"><div class="d2h-code-line-ctn">${escapeHtml(oldLine || "")}</div></td>
        </tr>`;
      } else if (oldLine !== undefined && newLine !== undefined) {
        // Modified line
        html += `<tr class="d2h-del">
          <td class="d2h-code-linenumber">${i + 1}</td>
          <td class="d2h-code-line"><div class="d2h-code-line-ctn">${escapeHtml(oldLine)}</div></td>
        </tr>`;
        html += `<tr class="d2h-ins">
          <td class="d2h-code-linenumber">${i + 1}</td>
          <td class="d2h-code-line"><div class="d2h-code-line-ctn">${escapeHtml(newLine)}</div></td>
        </tr>`;
        removed++;
        added++;
      } else if (oldLine !== undefined) {
        // Removed line
        html += `<tr class="d2h-del">
          <td class="d2h-code-linenumber">${i + 1}</td>
          <td class="d2h-code-line"><div class="d2h-code-line-ctn">${escapeHtml(oldLine)}</div></td>
        </tr>`;
        removed++;
      } else if (newLine !== undefined) {
        // Added line
        html += `<tr class="d2h-ins">
          <td class="d2h-code-linenumber">${i + 1}</td>
          <td class="d2h-code-line"><div class="d2h-code-line-ctn">${escapeHtml(newLine)}</div></td>
        </tr>`;
        added++;
      }
    }

    html += "</tbody></table></div></div>";

    return {
      diffHtml: html,
      stats: { added, removed },
    };
  }, [oldText, newText, fileName, outputFormat]);

  if (!diffHtml) {
    return <div className="text-xs text-gray-400 italic">No changes</div>;
  }

  return (
    <div
      className="diff-viewer font-mono text-xs leading-relaxed rounded-lg overflow-hidden border border-gray-200 bg-gray-50"
      style={{ "--max-height": maxHeight } as React.CSSProperties}
    >
      {showHeader && (
        <div className="diff-header flex gap-2 px-3 py-1.5 bg-gray-100 border-b border-gray-200">
          <span className="text-[11px] font-semibold text-green-600">
            +{stats.added}
          </span>
          <span className="text-[11px] font-semibold text-red-600">
            -{stats.removed}
          </span>
        </div>
      )}
      <div
        className="diff-content overflow-auto bg-white"
        style={{ maxHeight }}
        dangerouslySetInnerHTML={{ __html: diffHtml }}
      />

      <style>{`
        .diff-viewer .d2h-diff-table {
          font-size: 12px;
          font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
          width: 100%;
          border-collapse: collapse;
          border-spacing: 0;
        }

        .diff-viewer tr {
          display: table-row;
        }

        .diff-viewer td {
          display: table-cell;
          vertical-align: top;
          border: none;
          padding: 0;
        }

        .diff-viewer .d2h-code-line {
          padding: 1px 12px 1px 8px;
          line-height: 1.5;
        }

        .diff-viewer .d2h-code-line-ctn {
          white-space: pre;
          word-break: keep-all;
          overflow-x: auto;
        }

        .diff-viewer .d2h-code-linenumber {
          width: 44px;
          min-width: 44px;
          max-width: 44px;
          color: #9ca3af;
          background-color: #f9fafb;
          border-right: 1px solid #e5e7eb;
          text-align: right;
          padding: 1px 8px 1px 4px;
          user-select: none;
          font-size: 11px;
        }

        .diff-viewer .d2h-ins {
          background-color: #ecfdf5 !important;
        }

        .diff-viewer .d2h-ins .d2h-code-line-ctn {
          background-color: #d1fae5 !important;
        }

        .diff-viewer .d2h-ins .d2h-code-linenumber {
          background-color: #d1fae5 !important;
          color: #065f46;
          border-right-color: #a7f3d0;
        }

        .diff-viewer .d2h-del {
          background-color: #fef2f2 !important;
        }

        .diff-viewer .d2h-del .d2h-code-line-ctn {
          background-color: #fee2e2 !important;
        }

        .diff-viewer .d2h-del .d2h-code-linenumber {
          background-color: #fee2e2 !important;
          color: #991b1b;
          border-right-color: #fecaca;
        }

        .diff-viewer .d2h-cntx {
          background-color: white !important;
        }

        .diff-viewer .d2h-cntx .d2h-code-line-ctn {
          background-color: white !important;
        }

        .diff-viewer .d2h-cntx .d2h-code-linenumber {
          background-color: #f9fafb !important;
        }
      `}</style>
    </div>
  );
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
