import { useSyncExternalStore, useCallback, useRef, useEffect } from 'react';
import { parseHash, setHash, replaceHash, type RouteState } from '~/lib/router';

// External store for hash state
let currentState = parseHash();
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot() {
  return currentState;
}

function getServerSnapshot(): RouteState {
  return { projectId: null, sessionId: null };
}

// Listen for hash changes globally (only once)
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    const newState = parseHash();
    if (
      newState.projectId !== currentState.projectId ||
      newState.sessionId !== currentState.sessionId
    ) {
      currentState = newState;
      listeners.forEach((l) => l());
    }
  });
  // Initialize
  currentState = parseHash();
}

interface UseHashRouterOptions {
  onProjectChange?: (projectId: string | null, prevProjectId: string | null) => void;
  onSessionChange?: (sessionId: string | null, prevSessionId: string | null) => void;
}

export function useHashRouter(options: UseHashRouterOptions = {}) {
  const route = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Track previous values for change detection
  const prevProjectId = useRef<string | null | undefined>(undefined);
  const prevSessionId = useRef<string | null | undefined>(undefined);

  // Track if initial mount callbacks have been scheduled
  const initialCallbacksScheduled = useRef(false);

  // Store callbacks in refs to avoid effect dependencies
  const onProjectChangeRef = useRef(options.onProjectChange);
  const onSessionChangeRef = useRef(options.onSessionChange);
  onProjectChangeRef.current = options.onProjectChange;
  onSessionChangeRef.current = options.onSessionChange;

  // Handle initial mount - defer to avoid useSyncExternalStore race condition
  useEffect(() => {
    if (initialCallbacksScheduled.current) return;
    initialCallbacksScheduled.current = true;

    // Defer initial callbacks to next frame to let useSyncExternalStore stabilize
    // This prevents "Maximum update depth exceeded" when navigating directly to a URL
    requestAnimationFrame(() => {
      const currentRoute = getSnapshot();
      if (currentRoute.projectId && prevProjectId.current === undefined) {
        prevProjectId.current = currentRoute.projectId;
        onProjectChangeRef.current?.(currentRoute.projectId, null);
      }
      if (currentRoute.sessionId && prevSessionId.current === undefined) {
        prevSessionId.current = currentRoute.sessionId;
        onSessionChangeRef.current?.(currentRoute.sessionId, null);
      }
    });
  }, []);

  // Handle project changes after initial mount
  useEffect(() => {
    // Skip if we haven't initialized yet
    if (prevProjectId.current === undefined) {
      return;
    }

    if (prevProjectId.current !== route.projectId) {
      const prev = prevProjectId.current;
      prevProjectId.current = route.projectId;
      onProjectChangeRef.current?.(route.projectId, prev);
    }
  }, [route.projectId]);

  // Handle session changes after initial mount
  useEffect(() => {
    // Skip if we haven't initialized yet
    if (prevSessionId.current === undefined) {
      return;
    }

    if (prevSessionId.current !== route.sessionId) {
      const prev = prevSessionId.current;
      prevSessionId.current = route.sessionId;
      onSessionChangeRef.current?.(route.sessionId, prev);
    }
  }, [route.sessionId]);

  const navigate = useCallback((state: Partial<RouteState>) => {
    setHash({ ...currentState, ...state });
  }, []);

  const replace = useCallback((state: Partial<RouteState>) => {
    const newState = { ...currentState, ...state };
    replaceHash(newState);
    currentState = newState;
    listeners.forEach((l) => l());
  }, []);

  const navigateToProject = useCallback((projectId: string) => {
    setHash({ projectId, sessionId: null });
  }, []);

  const navigateToSession = useCallback((projectId: string, sessionId: string) => {
    setHash({ projectId, sessionId: sessionId || null });
  }, []);

  const clearRoute = useCallback(() => {
    setHash({ projectId: null, sessionId: null });
  }, []);

  return {
    route,
    projectId: route.projectId,
    sessionId: route.sessionId,
    navigate,
    replace,
    navigateToProject,
    navigateToSession,
    clearRoute,
  };
}
