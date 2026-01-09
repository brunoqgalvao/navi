import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import path from "path";

const host = process.env.TAURI_DEV_HOST;

// Check if running in Navi preview container
const isPreviewMode = process.env.NAVI_PREVIEW === "true";
const naviBranch = process.env.NAVI_BRANCH || process.env.VITE_NAVI_BRANCH || "";

export default defineConfig({
  plugins: [svelte()],
  // Expose NAVI_PREVIEW and NAVI_BRANCH to frontend
  define: {
    "import.meta.env.VITE_NAVI_PREVIEW": JSON.stringify(isPreviewMode ? "true" : "false"),
    "import.meta.env.VITE_NAVI_BRANCH": JSON.stringify(naviBranch),
  },
  resolve: {
    alias: {
      $lib: path.resolve("./src/lib"),
    },
  },
  publicDir: "static",
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    // HMR configuration - always use explicit config to ensure WebSocket connects to correct port
    // This is critical when viewing through a proxy (like native preview on port 3001)
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1420,
        }
      : {
          protocol: "ws",
          host: "localhost",
          port: 1420,
        },
    watch: {
      // Use a custom function to ONLY watch the src directory
      // This prevents any external file changes from triggering HMR
      // The glob patterns weren't working reliably with chokidar
      ignored: (filePath) => {
        // Always allow src directory (frontend code)
        if (filePath.includes("/src/")) return false;
        // Allow the vite config itself
        if (filePath.endsWith("vite.config.js")) return false;
        // Allow index.html
        if (filePath.endsWith("index.html")) return false;
        // Allow static directory
        if (filePath.includes("/static/")) return false;
        // Allow svelte config
        if (filePath.endsWith("svelte.config.js")) return false;
        // Ignore everything else (server/, node_modules/, worktrees, etc.)
        return true;
      },
      usePolling: false,
    },
    // In preview mode, proxy API and WebSocket requests to the backend server
    // This allows the frontend to use relative URLs that work in any environment
    // Note: Server runs on 3001 by default, we keep it consistent
    proxy: isPreviewMode ? {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:3001",
        ws: true,
      },
      "/health": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    } : undefined,
  },
  build: {
    outDir: "build",
  },
});
