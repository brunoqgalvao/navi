import "./app.css";
import App from "./App.svelte";
import { mount } from "svelte";
import { initTelemetry } from "./lib/telemetry";

// Initialize telemetry (respects user opt-out)
initTelemetry();

// Inject Navi branch indicator when running in preview mode
if (import.meta.env.VITE_NAVI_PREVIEW === "true" && import.meta.env.VITE_NAVI_BRANCH) {
  const script = document.createElement("script");
  script.src = "http://localhost:3001/api/preview/branch-indicator.js";
  script.async = true;
  document.head.appendChild(script);
}

const app = mount(App, {
  target: document.getElementById("app")!,
});

export default app;
