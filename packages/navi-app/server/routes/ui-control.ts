import { json } from "../utils/response";

type BroadcastFn = (payload: unknown) => void;

export async function handleUiControlRoutes(
  url: URL,
  method: string,
  req: Request,
  broadcastToClients: BroadcastFn
): Promise<Response | null> {
  if (url.pathname === "/api/ui/preview" && method === "POST") {
    let body;
    try {
      const text = await req.text();
      body = JSON.parse(text);
    } catch (e) {
      return json({ error: "Invalid JSON body", details: String(e) }, 400);
    }
    const { source, type } = body;
    if (!source) {
      return json({ error: "source is required" }, 400);
    }
    broadcastToClients({
      type: "ui_command",
      command: "open_preview",
      payload: { source, type: type || "auto" },
    });
    return json({ success: true, source });
  }

  if (url.pathname === "/api/ui/navigate" && method === "POST") {
    let body;
    try {
      const text = await req.text();
      body = JSON.parse(text);
    } catch (e) {
      return json({ error: "Invalid JSON body", details: String(e) }, 400);
    }
    const { projectId, sessionId } = body;
    broadcastToClients({
      type: "ui_command",
      command: "navigate",
      payload: { projectId, sessionId },
    });
    return json({ success: true });
  }

  if (url.pathname === "/api/ui/notification" && method === "POST") {
    let body;
    try {
      const text = await req.text();
      body = JSON.parse(text);
    } catch (e) {
      return json({ error: "Invalid JSON body", details: String(e) }, 400);
    }
    const { title, message, type } = body;
    if (!title) {
      return json({ error: "title is required" }, 400);
    }
    broadcastToClients({
      type: "ui_command",
      command: "notification",
      payload: { title, message, type: type || "info" },
    });
    return json({ success: true });
  }

  if (url.pathname === "/api/ui/terminal" && method === "POST") {
    let body;
    try {
      const text = await req.text();
      body = JSON.parse(text);
    } catch (e) {
      return json({ error: "Invalid JSON body", details: String(e) }, 400);
    }
    const { terminalId, projectId, cwd, command } = body;
    broadcastToClients({
      type: "ui_command",
      command: "open_terminal",
      payload: { terminalId, projectId, cwd, command },
    });
    return json({ success: true, terminalId, projectId });
  }

  return null;
}
