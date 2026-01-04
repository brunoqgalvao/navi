import { useConnectionStore } from "~/stores/settingsStore";

interface HeaderProps {
  projectName?: string;
  sessionTitle?: string;
  onToggleRightPanel?: () => void;
  rightPanelOpen?: boolean;
  onOpenSettings?: () => void;
}

export function Header({
  projectName,
  sessionTitle,
  onToggleRightPanel,
  rightPanelOpen,
  onOpenSettings,
}: HeaderProps) {
  const isConnected = useConnectionStore((state) => state.isConnected);

  return (
    <header className="flex h-12 items-center justify-between border-b border-gray-200 bg-white px-4">
      <div className="flex items-center gap-3">
        {/* Connection status */}
        <div
          className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${
            isConnected
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isConnected ? "bg-green-500" : "bg-red-500"
            }`}
          />
          {isConnected ? "Connected" : "Disconnected"}
        </div>

        {/* Project/Session info */}
        {projectName && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">{projectName}</span>
            {sessionTitle && (
              <>
                <span className="text-gray-300">/</span>
                <span className="text-gray-900 font-medium">{sessionTitle}</span>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Settings button */}
        <button
          onClick={onOpenSettings}
          className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          title="Settings"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </button>

        {/* Toggle right panel */}
        <button
          onClick={onToggleRightPanel}
          className={`rounded-lg p-2 transition-colors ${
            rightPanelOpen
              ? "bg-gray-100 text-gray-700"
              : "text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          }`}
          title={rightPanelOpen ? "Hide panel" : "Show panel"}
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
            />
          </svg>
        </button>
      </div>
    </header>
  );
}
