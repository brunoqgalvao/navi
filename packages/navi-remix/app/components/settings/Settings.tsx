import { Modal } from "~/components/ui/Modal";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/Tabs";
import { ApiKeysTab } from "./ApiKeysTab";
import { FeaturesTab } from "./FeaturesTab";
import { PermissionsTab } from "./PermissionsTab";

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Settings({ isOpen, onClose }: SettingsProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="w-[600px] max-w-[90vw]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-700 p-4">
          <h2 className="text-lg font-semibold text-zinc-100">Settings</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="api-keys">
          <TabsList className="px-4 pt-2">
            <TabsTrigger value="api-keys">API Keys</TabsTrigger>
            <TabsTrigger value="permissions">Permissions</TabsTrigger>
            <TabsTrigger value="features">Features</TabsTrigger>
          </TabsList>

          <div className="max-h-[60vh] overflow-y-auto p-4">
            <TabsContent value="api-keys">
              <ApiKeysTab />
            </TabsContent>

            <TabsContent value="permissions">
              <PermissionsTab />
            </TabsContent>

            <TabsContent value="features">
              <FeaturesTab />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </Modal>
  );
}
