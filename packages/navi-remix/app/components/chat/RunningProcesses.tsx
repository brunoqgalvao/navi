import { useState } from "react";
import type { ChildProcess } from "~/hooks/useMessageHandler";

interface RunningProcessesProps {
  processes: ChildProcess[];
  onKillProcess: (pid: number) => void;
}

function formatRuntime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hours}h ${remainMins}m`;
}

function getProcessWarning(command: string, runtime: number): string | null {
  const lcCommand = command.toLowerCase();

  // GUI-related warnings
  if (lcCommand.includes("plt.show") || lcCommand.includes("matplotlib")) {
    if (runtime > 5) return "May be waiting for GUI window - consider using plt.savefig() instead";
  }
  if (lcCommand.includes("cv2.imshow") || lcCommand.includes("opencv")) {
    if (runtime > 5) return "May be waiting for OpenCV window";
  }
  if (lcCommand.includes("tkinter") || lcCommand.includes("tk.mainloop")) {
    return "GUI application - may block indefinitely";
  }

  // Long-running process warning
  if (runtime > 30) {
    return "Process running for a while - may be hung";
  }

  return null;
}

export function RunningProcesses({ processes, onKillProcess }: RunningProcessesProps) {
  const [expanded, setExpanded] = useState(false);

  if (processes.length === 0) return null;

  return (
    <div className="mx-4 mb-4 bg-yellow-50 border border-yellow-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-yellow-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
          <span className="text-sm font-medium text-yellow-800">
            {processes.length} running process{processes.length > 1 ? "es" : ""}
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-yellow-600 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-yellow-200 divide-y divide-yellow-100">
          {processes.map((proc) => {
            const warning = getProcessWarning(proc.command, proc.runtime);
            return (
              <div key={proc.pid} className="px-3 py-2 bg-white">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-gray-500">PID {proc.pid}</span>
                      <span className="text-xs text-gray-400">•</span>
                      <span className="text-xs text-gray-500">{formatRuntime(proc.runtime)}</span>
                    </div>
                    <p className="text-sm font-mono text-gray-700 truncate mt-0.5" title={proc.command}>
                      {proc.command}
                    </p>
                    {warning && (
                      <p className="text-xs text-yellow-700 mt-1 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        {warning}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => onKillProcess(proc.pid)}
                    className="px-2 py-1 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                    title="Kill process"
                  >
                    Kill
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
