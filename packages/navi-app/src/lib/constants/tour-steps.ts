import type { TourStep } from "../stores";

export const TOUR_STEPS: Record<string, TourStep[]> = {
  main: [
    {
      id: "workspaces",
      target: "[data-tour='workspaces']",
      title: "Your Workspaces",
      content: "Create and manage project workspaces here. Each workspace is linked to a folder on your machine.",
      position: "right"
    },
    {
      id: "new-workspace",
      target: "[data-tour='new-workspace']",
      title: "Create a Workspace",
      content: "Click here to add a new project folder. You can point to an existing project or create a new one.",
      position: "bottom"
    },
    {
      id: "settings",
      target: "[data-tour='settings']",
      title: "Settings & Search",
      content: "Access settings here. Use ⌘K to quickly search chats and navigate anywhere in the app.",
      position: "top"
    }
  ],
  project: [
    {
      id: "pin-project",
      target: "[data-tour='project-menu']",
      title: "Pin Your Favorites",
      content: "Use this menu to pin projects to the top, rename them, or manage permissions.",
      position: "right"
    },
    {
      id: "chat-input",
      target: "[data-tour='chat-input']",
      title: "Start a Conversation",
      content: "Type your message here to chat with Claude. Ask questions, request code changes, or run terminal commands.",
      position: "top"
    }
  ],
  chat: [
    {
      id: "message-menu",
      target: "[data-tour='message-menu']",
      title: "Message Actions",
      content: "Edit your messages, rollback the conversation, or fork from any point to explore different approaches.",
      position: "left"
    }
  ]
};
