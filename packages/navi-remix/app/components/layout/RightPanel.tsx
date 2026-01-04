import { useState, type ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/Tabs";

interface RightPanelProps {
  gitPanel?: ReactNode;
  previewPanel?: ReactNode;
  filesPanel?: ReactNode;
  defaultTab?: string;
}

export function RightPanel({
  gitPanel,
  previewPanel,
  filesPanel,
  defaultTab = "git",
}: RightPanelProps) {
  const [activeTab, setActiveTab] = useState(defaultTab);

  return (
    <div className="flex h-full flex-col">
      <Tabs value={activeTab} onValueChange={setActiveTab} defaultValue={defaultTab}>
        <TabsList className="px-2">
          <TabsTrigger value="git">
            <span className="flex items-center gap-1.5">
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              Git
            </span>
          </TabsTrigger>
          <TabsTrigger value="files">
            <span className="flex items-center gap-1.5">
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                />
              </svg>
              Files
            </span>
          </TabsTrigger>
          <TabsTrigger value="preview">
            <span className="flex items-center gap-1.5">
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
              Preview
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="git" className="flex-1 overflow-auto">
          {gitPanel || (
            <div className="flex h-full items-center justify-center text-gray-400">
              Git panel
            </div>
          )}
        </TabsContent>

        <TabsContent value="files" className="flex-1 overflow-auto">
          {filesPanel || (
            <div className="flex h-full items-center justify-center text-gray-400">
              File browser
            </div>
          )}
        </TabsContent>

        <TabsContent value="preview" className="flex-1 overflow-auto">
          {previewPanel || (
            <div className="flex h-full items-center justify-center text-gray-400">
              Preview panel
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
