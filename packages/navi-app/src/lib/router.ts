// Hash-based router for Tauri/SPA compatibility
// URLs look like: #/project/abc123/chat/xyz789

export interface RouteState {
  projectId: string | null;
  sessionId: string | null;
}

export function parseHash(): RouteState {
  if (typeof window === "undefined") {
    return { projectId: null, sessionId: null };
  }

  const hash = window.location.hash.slice(1); // remove #
  if (!hash) return { projectId: null, sessionId: null };

  const parts = hash.split('/').filter(Boolean);

  let projectId: string | null = null;
  let sessionId: string | null = null;

  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === 'project' && parts[i + 1]) {
      projectId = parts[i + 1];
    }
    if (parts[i] === 'chat' && parts[i + 1]) {
      sessionId = parts[i + 1];
    }
  }

  return { projectId, sessionId };
}

export function buildHash(state: RouteState): string {
  if (!state.projectId) return '';

  let hash = `/project/${state.projectId}`;
  if (state.sessionId) {
    hash += `/chat/${state.sessionId}`;
  }
  return hash;
}

export function setHash(state: RouteState): void {
  if (typeof window === "undefined") return;

  const hash = buildHash(state);

  // Only update if different to avoid unnecessary history entries
  if (window.location.hash.slice(1) !== hash) {
    window.location.hash = hash;
  }
}

export function replaceHash(state: RouteState): void {
  if (typeof window === "undefined") return;

  const hash = buildHash(state);
  const url = window.location.pathname + window.location.search + (hash ? '#' + hash : '');

  // Replace instead of push to avoid polluting history
  window.history.replaceState(null, '', url);
}

export function onHashChange(callback: (state: RouteState) => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handler = () => callback(parseHash());
  window.addEventListener('hashchange', handler);

  return () => window.removeEventListener('hashchange', handler);
}
