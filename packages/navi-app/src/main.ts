import "./app.css";
import App from "./App.svelte";
import { mount } from "svelte";
import { initTelemetry } from "./lib/telemetry";

// Initialize telemetry (respects user opt-out)
initTelemetry();

const app = mount(App, {
  target: document.getElementById("app")!,
});

export default app;
