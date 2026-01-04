import { useState } from "react";

const SAFE_TOOLS = [
  { id: "Read", description: "Read files from the filesystem" },
  { id: "Glob", description: "Search for files by pattern" },
  { id: "Grep", description: "Search file contents" },
  { id: "LS", description: "List directory contents" },
  { id: "WebFetch", description: "Fetch web pages" },
  { id: "WebSearch", description: "Search the web" },
];

const DANGEROUS_TOOLS = [
  { id: "Write", description: "Write files to the filesystem" },
  { id: "Edit", description: "Edit existing files" },
  { id: "Bash", description: "Execute shell commands" },
  { id: "Task", description: "Spawn sub-agents" },
];

export function PermissionsTab() {
  const [autoApproveSafe, setAutoApproveSafe] = useState(true);
  const [approvedTools, setApprovedTools] = useState<Set<string>>(
    new Set(SAFE_TOOLS.map((t) => t.id))
  );

  const toggleTool = (toolId: string) => {
    const newSet = new Set(approvedTools);
    if (newSet.has(toolId)) {
      newSet.delete(toolId);
    } else {
      newSet.add(toolId);
    }
    setApprovedTools(newSet);
  };

  return (
    <div className="space-y-6">
      {/* Auto-approve toggle */}
      <label className="flex cursor-pointer items-center justify-between rounded-lg border border-zinc-700 bg-zinc-800/50 p-4">
        <div>
          <div className="font-medium text-zinc-200">Auto-approve Safe Tools</div>
          <div className="text-sm text-zinc-400">
            Automatically approve read-only operations
          </div>
        </div>
        <input
          type="checkbox"
          checked={autoApproveSafe}
          onChange={(e) => setAutoApproveSafe(e.target.checked)}
          className="h-5 w-5 rounded border-zinc-600 bg-zinc-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-zinc-900"
        />
      </label>

      {/* Safe Tools */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-zinc-200">Safe Tools</h3>
        <p className="mb-3 text-sm text-zinc-400">
          These tools are read-only and don&apos;t modify your system.
        </p>
        <div className="space-y-2">
          {SAFE_TOOLS.map((tool) => (
            <label
              key={tool.id}
              className="flex cursor-pointer items-center gap-3 rounded border border-zinc-700 bg-zinc-800/30 p-3"
            >
              <input
                type="checkbox"
                checked={approvedTools.has(tool.id)}
                onChange={() => toggleTool(tool.id)}
                className="h-4 w-4 rounded border-zinc-600 bg-zinc-700 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-900"
              />
              <div>
                <div className="font-mono text-sm text-zinc-200">{tool.id}</div>
                <div className="text-xs text-zinc-500">{tool.description}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Dangerous Tools */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-zinc-200">
          Tools Requiring Approval
        </h3>
        <p className="mb-3 text-sm text-zinc-400">
          These tools can modify files or execute commands. They require
          explicit approval.
        </p>
        <div className="space-y-2">
          {DANGEROUS_TOOLS.map((tool) => (
            <label
              key={tool.id}
              className="flex cursor-pointer items-center gap-3 rounded border border-zinc-700 bg-zinc-800/30 p-3"
            >
              <input
                type="checkbox"
                checked={approvedTools.has(tool.id)}
                onChange={() => toggleTool(tool.id)}
                className="h-4 w-4 rounded border-zinc-600 bg-zinc-700 text-amber-500 focus:ring-amber-500 focus:ring-offset-zinc-900"
              />
              <div>
                <div className="font-mono text-sm text-zinc-200">{tool.id}</div>
                <div className="text-xs text-zinc-500">{tool.description}</div>
              </div>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
