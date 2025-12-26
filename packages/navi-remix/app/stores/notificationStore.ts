import { create } from "zustand";
import type { Notification } from "~/lib/types";

interface NotificationState {
  notifications: Notification[];

  // Actions
  addNotification: (
    notification: Omit<Notification, "id" | "timestamp" | "read">
  ) => string;
  removeNotification: (id: string) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearAll: () => void;

  // Computed
  unreadCount: () => number;
  pendingPermissions: () => Notification[];
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],

  addNotification: (notification) => {
    const id = crypto.randomUUID();
    set((state) => ({
      notifications: [
        {
          ...notification,
          id,
          timestamp: new Date(),
          read: false,
        },
        ...state.notifications,
      ],
    }));
    return id;
  },

  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  markRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
    })),

  markAllRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
    })),

  clearAll: () => set({ notifications: [] }),

  unreadCount: () => get().notifications.filter((n) => !n.read).length,

  pendingPermissions: () =>
    get().notifications.filter(
      (n) => n.type === "permission" && !n.read
    ),
}));
