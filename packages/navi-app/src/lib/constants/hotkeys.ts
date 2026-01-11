export interface Hotkey {
  key: string;
  action: string;
  category?: "general" | "experimental";
}

export const HOTKEYS: Hotkey[] = [
  { key: "Cmd/Ctrl + K", action: "Open search" },
  { key: "Cmd/Ctrl + J", action: "Quick sessions" },
  { key: "Cmd/Ctrl + D", action: "Sessions dashboard" },
  { key: "Cmd/Ctrl + P", action: "Toggle preview panel" },
  { key: "Cmd/Ctrl + B", action: "Toggle file browser" },
  { key: "M", action: "Toggle mic recording" },
  { key: "Cmd/Ctrl + /", action: "Focus input" },
  { key: "Cmd/Ctrl + ,", action: "Open settings" },
  { key: "Escape", action: "Close panels" },
  { key: "?", action: "Show hotkeys help" },
  // Experimental agents
  { key: "Cmd/Ctrl + Shift + A", action: "Open agents panel", category: "experimental" },
  { key: "Cmd/Ctrl + Shift + H", action: "Toggle self-healing", category: "experimental" },
  { key: "Cmd/Ctrl + Shift + F", action: "Spawn Fix Errors agent", category: "experimental" },
];
