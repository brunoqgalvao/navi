import { json, corsHeaders } from "../utils/response";

/**
 * Proxy route to fetch external URLs and strip frame-blocking headers.
 * This allows the preview panel to display sites that normally block iframe embedding.
 */
export async function handleProxyRoutes(url: URL, method: string, req: Request): Promise<Response | null> {
  if (url.pathname === "/api/proxy" && method === "GET") {
    const targetUrl = url.searchParams.get("url");

    if (!targetUrl) {
      return json({ error: "URL parameter required" }, 400);
    }

    try {
      // Add https:// if no protocol is provided
      let normalizedUrl = targetUrl;
      if (!targetUrl.match(/^https?:\/\//i)) {
        normalizedUrl = `https://${targetUrl}`;
      }

      // Validate URL
      const parsedUrl = new URL(normalizedUrl);

      // Only allow http/https
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        return json({ error: "Only HTTP/HTTPS URLs are supported" }, 400);
      }

      // Fetch the external URL
      const response = await fetch(normalizedUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
        redirect: "follow",
      });

      // Get the content type
      const contentType = response.headers.get("content-type") || "text/html";

      // For HTML content, we need to rewrite relative URLs
      if (contentType.includes("text/html")) {
        let html = await response.text();

        // Inject a <base> tag to handle relative URLs
        const baseUrl = new URL(normalizedUrl);
        const baseTag = `<base href="${baseUrl.origin}${baseUrl.pathname.replace(/\/[^/]*$/, '/')}">`;

        // Insert base tag after <head> or at the start of the document
        if (html.includes("<head>")) {
          html = html.replace("<head>", `<head>${baseTag}`);
        } else if (html.includes("<head ")) {
          html = html.replace(/<head[^>]*>/, (match) => `${match}${baseTag}`);
        } else if (html.includes("<html>")) {
          html = html.replace("<html>", `<html><head>${baseTag}</head>`);
        } else {
          html = `<head>${baseTag}</head>${html}`;
        }

        // Return HTML without frame-blocking headers
        return new Response(html, {
          status: response.status,
          headers: {
            "Content-Type": contentType,
            ...corsHeaders,
            // Explicitly allow framing
            "X-Frame-Options": "ALLOWALL",
          },
        });
      }

      // For non-HTML content, just proxy it through
      const body = await response.arrayBuffer();
      return new Response(body, {
        status: response.status,
        headers: {
          "Content-Type": contentType,
          ...corsHeaders,
        },
      });

    } catch (error) {
      console.error("Proxy error:", error);
      return json({
        error: "Failed to fetch URL",
        details: error instanceof Error ? error.message : "Unknown error"
      }, 500);
    }
  }

  return null;
}
