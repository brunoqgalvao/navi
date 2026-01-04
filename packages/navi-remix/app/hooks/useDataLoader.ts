import { useCallback } from 'react';
import { api } from '~/lib/api';
import { useProjectStore } from '~/stores/projectStore';
import { useSessionStore, useCurrentSessionStore } from '~/stores/sessionStore';
import { useMessageStore } from '~/stores/messageStore';

// Track what we've loaded to avoid duplicate fetches
const loadedProjects = { current: false };
const loadedSessions = new Set<string>();
const loadedMessages = new Set<string>();

export function useDataLoader() {
  const setProjects = useProjectStore((s) => s.setProjects);
  const setSessions = useSessionStore((s) => s.setSessions);
  const setMessages = useMessageStore((s) => s.setMessages);

  // Select specific actions, not the whole store (prevents re-renders)
  const setProjectId = useCurrentSessionStore((s) => s.setProjectId);
  const setSessionId = useCurrentSessionStore((s) => s.setSessionId);

  // Load projects once
  const loadProjects = useCallback(async () => {
    if (loadedProjects.current) return;
    loadedProjects.current = true;
    try {
      const projects = await api.projects.list();
      setProjects(projects);
    } catch (error) {
      console.error('Failed to load projects:', error);
      loadedProjects.current = false;
    }
  }, [setProjects]);

  // Load sessions for a project
  const loadSessions = useCallback(async (projectId: string) => {
    if (!projectId || loadedSessions.has(projectId)) return;
    loadedSessions.add(projectId);
    try {
      const sessions = await api.sessions.list(projectId);
      setSessions(projectId, sessions);
    } catch (error) {
      console.error('Failed to load sessions:', error);
      loadedSessions.delete(projectId);
    }
  }, [setSessions]);

  // Load messages for a session
  const loadMessages = useCallback(async (sessionId: string) => {
    if (!sessionId || loadedMessages.has(sessionId)) return;
    loadedMessages.add(sessionId);
    try {
      const messagesData = await api.messages.list(sessionId);
      const chatMessages = messagesData.map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
        timestamp: new Date(m.timestamp),
        parentToolUseId: m.parent_tool_use_id,
        isSynthetic: !!m.is_synthetic,
      }));
      setMessages(sessionId, chatMessages);
    } catch (error) {
      console.error('Failed to load messages:', error);
      loadedMessages.delete(sessionId);
    }
  }, [setMessages]);

  // Handle project change - load sessions and update current
  const onProjectChange = useCallback((projectId: string | null) => {
    setProjectId(projectId);
    if (projectId) {
      loadSessions(projectId);
    }
  }, [setProjectId, loadSessions]);

  // Handle session change - load messages and update current
  const onSessionChange = useCallback((sessionId: string | null) => {
    setSessionId(sessionId);
    if (sessionId) {
      loadMessages(sessionId);
    }
  }, [setSessionId, loadMessages]);

  // Invalidate cache for a session (after sending a message)
  const invalidateSession = useCallback((sessionId: string) => {
    loadedMessages.delete(sessionId);
  }, []);

  return {
    loadProjects,
    loadSessions,
    loadMessages,
    onProjectChange,
    onSessionChange,
    invalidateSession,
  };
}
