import { useSettingsStore } from "~/stores/settingsStore";

export function FeaturesTab() {
  const advancedMode = useSettingsStore((state) => state.advancedMode);
  const debugMode = useSettingsStore((state) => state.debugMode);
  const showArchivedItems = useSettingsStore((state) => state.showArchivedItems);
  const toggleAdvancedMode = useSettingsStore((state) => state.toggleAdvancedMode);
  const toggleDebugMode = useSettingsStore((state) => state.toggleDebugMode);
  const setShowArchivedItems = useSettingsStore((state) => state.setShowArchivedItems);
  const resetOnboarding = useSettingsStore((state) => state.resetOnboarding);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-zinc-200">Feature Flags</h3>

        {/* Advanced Mode */}
        <label className="flex cursor-pointer items-center justify-between rounded-lg border border-zinc-700 bg-zinc-800/50 p-4">
          <div>
            <div className="font-medium text-zinc-200">Advanced Mode</div>
            <div className="text-sm text-zinc-400">
              Show additional options and debugging tools
            </div>
          </div>
          <input
            type="checkbox"
            checked={advancedMode}
            onChange={toggleAdvancedMode}
            className="h-5 w-5 rounded border-zinc-600 bg-zinc-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-zinc-900"
          />
        </label>

        {/* Debug Mode */}
        <label className="flex cursor-pointer items-center justify-between rounded-lg border border-zinc-700 bg-zinc-800/50 p-4">
          <div>
            <div className="font-medium text-zinc-200">Debug Mode</div>
            <div className="text-sm text-zinc-400">
              Show debug information and raw SDK events
            </div>
          </div>
          <input
            type="checkbox"
            checked={debugMode}
            onChange={toggleDebugMode}
            className="h-5 w-5 rounded border-zinc-600 bg-zinc-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-zinc-900"
          />
        </label>

        {/* Show Archived */}
        <label className="flex cursor-pointer items-center justify-between rounded-lg border border-zinc-700 bg-zinc-800/50 p-4">
          <div>
            <div className="font-medium text-zinc-200">Show Archived Items</div>
            <div className="text-sm text-zinc-400">
              Display archived projects and sessions in the sidebar
            </div>
          </div>
          <input
            type="checkbox"
            checked={showArchivedItems}
            onChange={(e) => setShowArchivedItems(e.target.checked)}
            className="h-5 w-5 rounded border-zinc-600 bg-zinc-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-zinc-900"
          />
        </label>
      </div>

      {/* Reset Section */}
      <div className="border-t border-zinc-700 pt-6">
        <h3 className="mb-4 text-sm font-medium text-zinc-200">Reset</h3>
        <button
          onClick={resetOnboarding}
          className="rounded-md border border-zinc-600 bg-zinc-800 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700"
        >
          Reset Onboarding
        </button>
        <p className="mt-2 text-sm text-zinc-500">
          Show the onboarding flow again on next load
        </p>
      </div>
    </div>
  );
}
