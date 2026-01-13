import { json } from "../utils/response";

export async function handleAudioRoutes(url: URL, method: string, req: Request): Promise<Response | null> {
  if (url.pathname === "/api/transcribe" && method === "POST") {
    try {
      const formData = await req.formData();
      const audioFile = formData.get("audio") as File;

      if (!audioFile) {
        return json({ error: "No audio file provided" }, 400);
      }

      const audioBuffer = await audioFile.arrayBuffer();
      const audioBytes = new Uint8Array(audioBuffer);

      const whisperApiKey = process.env.OPENAI_API_KEY;
      if (!whisperApiKey) {
        return json({ error: "OPENAI_API_KEY not configured" }, 500);
      }

      const whisperFormData = new FormData();
      whisperFormData.append("file", new Blob([audioBytes], { type: "audio/webm" }), "audio.webm");
      whisperFormData.append("model", "whisper-1");
      whisperFormData.append("response_format", "json");

      const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${whisperApiKey}`,
        },
        body: whisperFormData,
      });

      if (!whisperRes.ok) {
        const errorData = await whisperRes.json().catch(() => ({}));
        console.error("Whisper API error:", errorData);
        return json({ error: errorData.error?.message || "Transcription failed" }, whisperRes.status);
      }

      const result = await whisperRes.json();
      return json({ text: result.text });
    } catch (e) {
      console.error("Transcription error:", e);
      return json({ error: e instanceof Error ? e.message : "Transcription failed" }, 500);
    }
  }

  if (url.pathname === "/api/audio/save" && method === "POST") {
    try {
      const formData = await req.formData();
      const audioFile = formData.get("audio") as File;

      if (!audioFile) {
        return json({ error: "No audio file provided" }, 400);
      }

      const { homedir } = await import("os");
      const { join } = await import("path");
      const fs = await import("fs/promises");

      const audioDir = join(homedir(), ".claude-code-ui", "audio-backups");
      await fs.mkdir(audioDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `recording-${timestamp}.webm`;
      const filepath = join(audioDir, filename);

      const audioBuffer = await audioFile.arrayBuffer();
      await fs.writeFile(filepath, new Uint8Array(audioBuffer));

      return json({ path: filepath });
    } catch (e) {
      console.error("Audio save error:", e);
      return json({ error: e instanceof Error ? e.message : "Failed to save audio" }, 500);
    }
  }

  return null;
}
