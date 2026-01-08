import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [svelte()],
  publicDir: "static",
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: false, // Disabled - we use the app to develop itself
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    outDir: "build",
  },
});
