import { useEffect } from "react";
import { useSettingsStore } from "~/stores/settingsStore";
import { Dropdown, DropdownItem } from "~/components/ui/Dropdown";
import { api } from "~/lib/api";

export function ModelSelector() {
  const availableModels = useSettingsStore((state) => state.availableModels);
  const selectedModel = useSettingsStore((state) => state.selectedModel);
  const setAvailableModels = useSettingsStore((state) => state.setAvailableModels);
  const setSelectedModel = useSettingsStore((state) => state.setSelectedModel);

  useEffect(() => {
    async function loadModels() {
      if (availableModels.length === 0) {
        try {
          const models = await api.models.list();
          setAvailableModels(
            models.map((m) => ({
              id: m.value,
              name: m.displayName || m.value,
            }))
          );
        } catch (error) {
          console.error("Failed to load models:", error);
          // Set default models as fallback
          setAvailableModels([
            { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
            { id: "claude-opus-4-20250514", name: "Claude Opus 4" },
            { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet" },
          ]);
        }
      }
    }
    loadModels();
  }, [availableModels.length, setAvailableModels]);

  const currentModel = availableModels.find((m) => m.id === selectedModel);
  const displayName = currentModel?.name || selectedModel.split("-").slice(0, 3).join(" ");

  return (
    <Dropdown
      trigger={
        <button className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:border-gray-300 transition-colors">
          <span className="flex items-center gap-2">
            <svg
              className="h-4 w-4 text-purple-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            <span className="truncate">{displayName}</span>
          </span>
          <svg
            className="h-4 w-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      }
    >
      {availableModels.map((model) => (
        <DropdownItem
          key={model.id}
          onClick={() => setSelectedModel(model.id)}
          className={selectedModel === model.id ? "bg-gray-100" : ""}
        >
          <span className="flex items-center gap-2">
            {selectedModel === model.id && (
              <svg
                className="h-4 w-4 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            )}
            <span className={selectedModel !== model.id ? "pl-6" : ""}>
              {model.name}
            </span>
          </span>
        </DropdownItem>
      ))}
    </Dropdown>
  );
}
