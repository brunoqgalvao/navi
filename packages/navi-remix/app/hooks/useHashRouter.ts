import { useState, useEffect, useCallback } from 'react';
import { parseHash, setHash, replaceHash, onHashChange, type RouteState } from '~/lib/router';

export function useHashRouter() {
  const [route, setRoute] = useState<RouteState>(() => parseHash());

  useEffect(() => {
    // Set initial state
    setRoute(parseHash());

    // Listen for hash changes
    return onHashChange(setRoute);
  }, []);

  const navigate = useCallback((state: Partial<RouteState>) => {
    setHash({ ...route, ...state });
  }, [route]);

  const replace = useCallback((state: Partial<RouteState>) => {
    replaceHash({ ...route, ...state });
    setRoute({ ...route, ...state });
  }, [route]);

  const navigateToProject = useCallback((projectId: string) => {
    setHash({ projectId, sessionId: null });
  }, []);

  const navigateToSession = useCallback((projectId: string, sessionId: string) => {
    setHash({ projectId, sessionId });
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
