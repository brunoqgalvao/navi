import { create } from "zustand";
import type { TodoItem } from "~/lib/types";

interface TodoState {
  // Map of sessionId -> todos
  sessionTodos: Map<string, TodoItem[]>;

  // Actions
  setTodos: (sessionId: string, todos: TodoItem[]) => void;
  clearTodos: (sessionId: string) => void;
  getTodos: (sessionId: string) => TodoItem[];
}

export const useTodoStore = create<TodoState>((set, get) => ({
  sessionTodos: new Map(),

  setTodos: (sessionId, todos) =>
    set((state) => {
      const newMap = new Map(state.sessionTodos);
      newMap.set(sessionId, todos);
      return { sessionTodos: newMap };
    }),

  clearTodos: (sessionId) =>
    set((state) => {
      const newMap = new Map(state.sessionTodos);
      newMap.delete(sessionId);
      return { sessionTodos: newMap };
    }),

  getTodos: (sessionId) => get().sessionTodos.get(sessionId) || [],
}));
