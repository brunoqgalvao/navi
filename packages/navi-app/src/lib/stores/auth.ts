/**
 * Auth Store
 *
 * Manages user authentication state for Navi.
 * Used to gate features like Email, Cloud Execution, etc.
 */

import { writable, derived, get } from "svelte/store";
import { getServerUrl } from "$lib/api";

export interface NaviUser {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  naviEmail: string;  // e.g., bruno@agentmail.to or bruno@usenavi.app
  createdAt: number;
}

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: NaviUser | null;
  error: string | null;
}

const initialState: AuthState = {
  isAuthenticated: false,
  isLoading: true,
  user: null,
  error: null,
};

function createAuthStore() {
  const { subscribe, set, update } = writable<AuthState>(initialState);

  return {
    subscribe,

    // Initialize auth state on app load
    async init() {
      update(s => ({ ...s, isLoading: true, error: null }));

      try {
        const res = await fetch(`${getServerUrl()}/api/auth/me`);

        if (res.ok) {
          const user = await res.json();
          set({
            isAuthenticated: true,
            isLoading: false,
            user,
            error: null,
          });
        } else if (res.status === 401) {
          // Not authenticated - that's fine
          set({
            isAuthenticated: false,
            isLoading: false,
            user: null,
            error: null,
          });
        } else {
          throw new Error("Failed to check auth status");
        }
      } catch (e) {
        set({
          isAuthenticated: false,
          isLoading: false,
          user: null,
          error: e instanceof Error ? e.message : "Auth check failed",
        });
      }
    },

    // Sign up with email
    async signUp(email: string, password: string, name?: string) {
      update(s => ({ ...s, isLoading: true, error: null }));

      try {
        const res = await fetch(`${getServerUrl()}/api/auth/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Sign up failed");
        }

        const user = await res.json();
        set({
          isAuthenticated: true,
          isLoading: false,
          user,
          error: null,
        });

        return user;
      } catch (e) {
        update(s => ({
          ...s,
          isLoading: false,
          error: e instanceof Error ? e.message : "Sign up failed",
        }));
        throw e;
      }
    },

    // Sign in with email
    async signIn(email: string, password: string) {
      update(s => ({ ...s, isLoading: true, error: null }));

      try {
        const res = await fetch(`${getServerUrl()}/api/auth/signin`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Sign in failed");
        }

        const user = await res.json();
        set({
          isAuthenticated: true,
          isLoading: false,
          user,
          error: null,
        });

        return user;
      } catch (e) {
        update(s => ({
          ...s,
          isLoading: false,
          error: e instanceof Error ? e.message : "Sign in failed",
        }));
        throw e;
      }
    },

    // Sign out
    async signOut() {
      try {
        await fetch(`${getServerUrl()}/api/auth/signout`, {
          method: "POST",
        });
      } catch (e) {
        console.error("Sign out error:", e);
      }

      set({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        error: null,
      });
    },

    // Clear error
    clearError() {
      update(s => ({ ...s, error: null }));
    },
  };
}

export const auth = createAuthStore();

// Derived stores for convenience
export const isAuthenticated = derived(auth, $auth => $auth.isAuthenticated);
export const currentUser = derived(auth, $auth => $auth.user);
export const authLoading = derived(auth, $auth => $auth.isLoading);
export const naviEmail = derived(auth, $auth => $auth.user?.naviEmail || null);
