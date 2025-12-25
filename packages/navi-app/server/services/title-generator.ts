import { sessions, globalSettings } from "../db";

export async function generateChatTitle(userPrompt: string, assistantContent: any[], sessionId: string) {
  const autoTitleEnabled = process.env.AUTO_TITLE !== "false";
  if (!autoTitleEnabled) {
    const fallbackTitle = userPrompt.slice(0, 50) + (userPrompt.length > 50 ? "..." : "");
    sessions.updateTitle(fallbackTitle, Date.now(), sessionId);
    return;
  }

  try {
    const assistantText = assistantContent
      .filter((block: any) => block.type === "text")
      .map((block: any) => block.text)
      .join(" ")
      .slice(0, 300);

    const systemPrompt = "Generate a very short title (3-6 words max) for this conversation. Return ONLY the title text, nothing else. No quotes.";
    const userContent = `User: ${userPrompt.slice(0, 150)}\nAssistant: ${assistantText.slice(0, 150)}`;

    let title = "";

    if (process.env.OPENAI_API_KEY) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
          max_tokens: 20,
          temperature: 0.7,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        title = data.choices?.[0]?.message?.content?.trim() || "";
      }
    } else {
      const storedApiKey = globalSettings.get("anthropicApiKey");
      if (storedApiKey) {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": storedApiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-3-haiku-20240307",
            max_tokens: 20,
            system: systemPrompt,
            messages: [{ role: "user", content: userContent }],
          }),
        });

        if (res.ok) {
          const data = await res.json();
          title = data.content?.[0]?.text?.trim() || "";
        }
      }
    }

    title = title.replace(/^["']|["']$/g, "").slice(0, 60);

    if (title && title.length > 2) {
      sessions.updateTitle(title, Date.now(), sessionId);
    } else {
      const fallbackTitle = userPrompt.slice(0, 50) + (userPrompt.length > 50 ? "..." : "");
      sessions.updateTitle(fallbackTitle, Date.now(), sessionId);
    }
  } catch (e) {
    console.error("Failed to generate chat title:", e);
    const fallbackTitle = userPrompt.slice(0, 50) + (userPrompt.length > 50 ? "..." : "");
    sessions.updateTitle(fallbackTitle, Date.now(), sessionId);
  }
}
