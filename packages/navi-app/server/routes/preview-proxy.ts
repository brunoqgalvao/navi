/**
 * Preview Proxy Routes
 *
 * Proxies requests to preview containers and injects the branch indicator
 * into HTML responses automatically. This makes the indicator work with
 * ANY project without requiring code changes.
 *
 * Supports all three preview methods:
 * - Container Preview (Docker)
 * - Native Preview (local process)
 * - Port Manager Preview (LLM-powered multi-instance)
 */

import { json, error } from "../utils/response";
import { previewService } from "../services/preview";
import { nativePreviewService } from "../services/native-preview";
import { portManagerPreviewService } from "../services/port-manager-preview";

/**
 * Generate the branch indicator injection script
 */
/**
 * Known OAuth/auth provider domains that block iframe embedding
 * These need to be opened in a new window instead
 */
const OAUTH_DOMAINS = [
  'accounts.google.com',
  'appleid.apple.com',
  'github.com/login',
  'github.com/sessions',
  'login.microsoftonline.com',
  'login.live.com',
  'facebook.com/login',
  'facebook.com/v',
  'api.twitter.com',
  'twitter.com/i/oauth',
  'x.com/i/oauth',
  'discord.com/oauth',
  'discord.com/login',
  'slack.com/oauth',
  'linkedin.com/oauth',
  'auth0.com',
  'okta.com',
  'clerk.dev',
  'clerk.com',
  'supabase.co/auth',
  'supabase.com/auth',
  'firebase.google.com',
  'securetoken.googleapis.com',
];

/**
 * Generate script to intercept OAuth redirects and open them in a new window
 */
function getOAuthInterceptScript(): string {
  return `
<!-- Navi OAuth Interceptor -->
<script>
(function() {
  if (window.__NAVI_OAUTH_INTERCEPT_LOADED) return;
  window.__NAVI_OAUTH_INTERCEPT_LOADED = true;

  const OAUTH_PATTERNS = ${JSON.stringify(OAUTH_DOMAINS)};

  function isOAuthUrl(url) {
    if (!url) return false;
    try {
      const parsed = new URL(url, window.location.origin);
      const fullUrl = parsed.hostname + parsed.pathname;
      return OAUTH_PATTERNS.some(pattern => fullUrl.includes(pattern));
    } catch { return false; }
  }

  function openOAuthPopup(url) {
    console.log('[Navi] Opening OAuth in popup:', url);
    const width = 500;
    const height = 700;
    const left = (screen.width - width) / 2;
    const top = (screen.height - height) / 2;
    return window.__naviOriginalOpen.call(
      window,
      url,
      'navi_oauth_popup',
      'width=' + width + ',height=' + height + ',left=' + left + ',top=' + top + ',popup=yes,scrollbars=yes'
    );
  }

  // Store original functions FIRST before anything else can modify them
  window.__naviOriginalOpen = window.open;
  const originalAssign = window.location.assign.bind(window.location);
  const originalReplace = window.location.replace.bind(window.location);

  // Intercept link clicks (capture phase)
  document.addEventListener('click', function(e) {
    const link = e.target.closest('a[href]');
    if (link && isOAuthUrl(link.href)) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      openOAuthPopup(link.href);
      return false;
    }
  }, true);

  // Intercept form submissions
  document.addEventListener('submit', function(e) {
    const form = e.target;
    if (form && form.action && isOAuthUrl(form.action)) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      openOAuthPopup(form.action);
      return false;
    }
  }, true);

  // Intercept window.location.assign
  window.location.assign = function(url) {
    if (isOAuthUrl(url)) {
      openOAuthPopup(url);
      return;
    }
    return originalAssign(url);
  };

  // Intercept window.location.replace
  window.location.replace = function(url) {
    if (isOAuthUrl(url)) {
      openOAuthPopup(url);
      return;
    }
    return originalReplace(url);
  };

  // Intercept window.open
  window.open = function(url, target, features) {
    if (url && isOAuthUrl(url)) {
      return openOAuthPopup(url);
    }
    return window.__naviOriginalOpen.call(window, url, target, features);
  };

  // CRITICAL: Intercept window.location.href setter
  // This is how most frameworks (Supabase, NextAuth, etc.) redirect to OAuth
  try {
    const locationProxy = new Proxy(window.location, {
      set: function(target, prop, value) {
        if (prop === 'href' && isOAuthUrl(value)) {
          openOAuthPopup(value);
          return true;
        }
        target[prop] = value;
        return true;
      },
      get: function(target, prop) {
        const value = target[prop];
        if (typeof value === 'function') {
          if (prop === 'assign') return window.location.assign;
          if (prop === 'replace') return window.location.replace;
          return value.bind(target);
        }
        return value;
      }
    });

    // Try to replace window.location (won't work in all browsers, but worth trying)
    try {
      Object.defineProperty(window, 'location', {
        get: function() { return locationProxy; },
        configurable: true
      });
    } catch(e) {
      // Can't replace location, use navigation API fallback
    }
  } catch(e) {
    console.log('[Navi] Could not proxy location:', e);
  }

  // Fallback: Use Navigation API if available (modern browsers)
  if (window.navigation) {
    window.navigation.addEventListener('navigate', function(e) {
      if (e.destination && e.destination.url && isOAuthUrl(e.destination.url)) {
        e.preventDefault();
        openOAuthPopup(e.destination.url);
      }
    });
  }

  // Last resort fallback: beforeunload check
  window.addEventListener('beforeunload', function(e) {
    // Check if we're navigating to OAuth (can't fully prevent, but can warn)
    const pendingUrl = document.activeElement?.href;
    if (pendingUrl && isOAuthUrl(pendingUrl)) {
      openOAuthPopup(pendingUrl);
      e.preventDefault();
      return '';
    }
  });

  // Notify parent that OAuth intercept is active
  if (window.parent !== window) {
    window.parent.postMessage({ type: 'navi:oauthInterceptActive' }, '*');
  }

  console.log('[Navi] OAuth intercept active - OAuth logins will open in popup');
})();
</script>
`;
}

/**
 * Generate the element inspector injection script
 * This enables Navi's element inspector feature automatically in all previews
 */
function getInspectorScript(): string {
  return `
<!-- Navi Element Inspector -->
<script src="/navi-inspector.js"></script>
`;
}

function getBranchIndicatorScript(branch: string, projectName: string): string {
  // Navi compass SVG icon (black)
  const naviIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>`;

  return `
<!-- Navi Branch Indicator -->
<script>
(function() {
  if (window.__NAVI_BRANCH_INDICATOR_LOADED) return;
  window.__NAVI_BRANCH_INDICATOR_LOADED = true;
  window.NAVI_BRANCH = ${JSON.stringify(branch)};
  window.NAVI_PROJECT = ${JSON.stringify(projectName)};

  const indicatorHTML = \`
    <div id="navi-branch-indicator" style="position:fixed;bottom:12px;right:12px;z-index:999999;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;user-select:none">
      <div id="navi-branch-badge" style="display:flex;align-items:center;gap:6px;background:#fff;color:#000;padding:6px 10px;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,0.12),0 1px 2px rgba(0,0,0,0.08);cursor:move;font-size:11px;font-weight:500;border:1px solid rgba(0,0,0,0.08);transition:all 0.15s ease">
        <span style="display:flex;align-items:center;color:#000;opacity:0.7">${naviIcon}</span>
        <div style="display:flex;flex-direction:column;gap:1px" id="navi-branch-text">
          <div style="font-weight:600;letter-spacing:-0.01em;color:#000">\${window.NAVI_BRANCH}</div>
        </div>
        <button id="navi-close-btn" title="Hide" style="width:16px;height:16px;display:flex;align-items:center;justify-content:center;background:transparent;border:none;color:#000;opacity:0.4;cursor:pointer;font-size:14px;margin-left:2px;padding:0">×</button>
      </div>
    </div>
  \`;

  function inject() {
    if (!document.body) return setTimeout(inject, 10);

    // Check if hidden
    if (localStorage.getItem('navi-branch-indicator-hidden') === 'true') return;

    const container = document.createElement('div');
    container.innerHTML = indicatorHTML;
    document.body.appendChild(container.firstElementChild);

    const indicator = document.getElementById('navi-branch-indicator');
    const badge = document.getElementById('navi-branch-badge');
    const closeBtn = document.getElementById('navi-close-btn');

    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };

    // Restore saved position
    const savedPos = localStorage.getItem('navi-branch-position');
    if (savedPos) {
      const pos = JSON.parse(savedPos);
      indicator.style.left = pos.x + 'px';
      indicator.style.top = pos.y + 'px';
      indicator.style.bottom = 'auto';
      indicator.style.right = 'auto';
    }

    closeBtn.onclick = (e) => {
      e.stopPropagation();
      indicator.style.display = 'none';
      localStorage.setItem('navi-branch-indicator-hidden', 'true');
    };

    closeBtn.onmouseenter = () => { closeBtn.style.opacity = '0.8'; };
    closeBtn.onmouseleave = () => { closeBtn.style.opacity = '0.4'; };

    badge.onmousedown = (e) => {
      if (e.target.tagName === 'BUTTON') return;
      isDragging = true;
      const rect = indicator.getBoundingClientRect();
      dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      badge.style.cursor = 'grabbing';
    };

    document.onmousemove = (e) => {
      if (!isDragging) return;
      e.preventDefault();
      const x = e.clientX - dragOffset.x;
      const y = e.clientY - dragOffset.y;
      indicator.style.left = x + 'px';
      indicator.style.top = y + 'px';
      indicator.style.bottom = 'auto';
      indicator.style.right = 'auto';
      localStorage.setItem('navi-branch-position', JSON.stringify({ x, y }));
    };

    document.onmouseup = () => { isDragging = false; badge.style.cursor = 'move'; };

    badge.onmouseenter = () => { if (!isDragging) badge.style.boxShadow = '0 2px 6px rgba(0,0,0,0.15),0 1px 3px rgba(0,0,0,0.1)'; };
    badge.onmouseleave = () => { if (!isDragging) badge.style.boxShadow = '0 1px 3px rgba(0,0,0,0.12),0 1px 2px rgba(0,0,0,0.08)'; };

    // Listen for updates from parent
    window.addEventListener('message', (e) => {
      if (e.data?.type === 'navi:branchInfo') {
        window.NAVI_BRANCH = e.data.branch;
        const textEl = document.querySelector('#navi-branch-text div');
        if (textEl) textEl.textContent = e.data.branch;
      }
    });

    // Request update from parent
    if (window.parent !== window) window.parent.postMessage({ type: 'navi:getBranchInfo' }, '*');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject);
  else inject();
})();
</script>
`;
}

/**
 * Find preview info by port across all preview services
 */
function findPreviewByPort(port: string): { branch: string; projectName: string; type: string } | null {
  // Check container previews first
  const containerPreviews = previewService.listPreviews();
  const containerPreview = containerPreviews.find((p) => p.url?.includes(`:${port}`));
  if (containerPreview) {
    return {
      branch: containerPreview.branch || "preview",
      projectName: containerPreview.projectId || "Container Preview",
      type: "container",
    };
  }

  // Check native preview
  const nativeStatus = nativePreviewService.getStatus();
  if (nativeStatus.running && nativeStatus.port === parseInt(port)) {
    return {
      branch: nativeStatus.branch || "preview",
      projectName: "Native Preview",
      type: "native",
    };
  }

  // Check port manager previews
  const portManagerPreviews = portManagerPreviewService.listAll();
  const portManagerPreview = portManagerPreviews.find(
    (p) => p.ports?.primary === parseInt(port) || p.ports?.backend === parseInt(port)
  );
  if (portManagerPreview) {
    return {
      branch: portManagerPreview.branch || "preview",
      projectName: "Port Manager Preview",
      type: "port-manager",
    };
  }

  return null;
}

// Headers that block iframe embedding - we need to remove these
const BLOCKED_HEADERS = [
  "x-frame-options",
  "content-security-policy",
  "content-security-policy-report-only",
  "x-content-type-options",
  "cross-origin-opener-policy",
  "cross-origin-embedder-policy",
  "cross-origin-resource-policy",
];

// Headers to forward from original response
// NOTE: Do NOT forward content-encoding - fetch() auto-decompresses
const FORWARDED_HEADERS = [
  "content-type",
  "etag",
  "last-modified",
  "cache-control",
  "vary",
];

export async function handlePreviewProxyRoutes(
  url: URL,
  method: string,
  req: Request
): Promise<Response | null> {
  // GET /api/preview/proxy/:port/* - Proxy request to preview with branch indicator injection
  const proxyMatch = url.pathname.match(/^\/api\/preview\/proxy\/(\d+)(\/.*)?$/);
  if (proxyMatch) {
    const port = proxyMatch[1];
    const path = proxyMatch[2] || "/";
    const queryString = url.search || "";

    // Find the preview for this port across all preview services
    const previewInfo = findPreviewByPort(port);

    const branch = previewInfo?.branch || "preview";
    const projectName = previewInfo?.projectName || "Preview";

    try {
      // Fetch from the actual preview server
      // Use 127.0.0.1 instead of localhost to avoid IPv6/IPv4 resolution issues
      const targetUrl = `http://127.0.0.1:${port}${path}${queryString}`;

      // Forward relevant request headers
      const forwardHeaders: Record<string, string> = {
        Accept: req.headers.get("Accept") || "*/*",
        "Accept-Language": req.headers.get("Accept-Language") || "en-US,en;q=0.9",
        "Accept-Encoding": req.headers.get("Accept-Encoding") || "gzip, deflate",
      };

      // Forward cookie if present
      const cookie = req.headers.get("Cookie");
      if (cookie) forwardHeaders["Cookie"] = cookie;

      const response = await fetch(targetUrl, {
        method,
        headers: forwardHeaders,
        // Forward body for POST/PUT
        body: method !== "GET" && method !== "HEAD" ? req.body : undefined,
        // Add timeout to prevent hanging
        signal: AbortSignal.timeout(30000),
      });

      // Get content type
      const contentType = response.headers.get("Content-Type") || "";

      // Build response headers - forward safe ones, remove blockers
      const responseHeaders: Record<string, string> = {
        // Always allow iframe embedding
        "X-Frame-Options": "ALLOWALL",
        // Allow all cross-origin
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      };

      // Forward safe headers from original response
      for (const header of FORWARDED_HEADERS) {
        const value = response.headers.get(header);
        if (value) {
          responseHeaders[header] = value;
        }
      }

      // If it's HTML, inject the branch indicator and add base tag for proper URL resolution
      if (contentType.includes("text/html")) {
        let html = await response.text();

        // Inject a <base> tag to ensure all relative URLs go through the proxy
        // This fixes issues with CSS, JS, fonts, and images that use relative paths
        const baseTag = `<base href="/api/preview/proxy/${port}/">`;

        if (html.includes("<head>")) {
          html = html.replace("<head>", `<head>${baseTag}`);
        } else if (html.includes("<HEAD>")) {
          html = html.replace("<HEAD>", `<HEAD>${baseTag}`);
        } else if (html.includes("<!DOCTYPE") || html.includes("<!doctype")) {
          // Insert after doctype
          html = html.replace(/(<!DOCTYPE[^>]*>|<!doctype[^>]*>)/i, `$1${baseTag}`);
        } else {
          // Prepend to HTML
          html = baseTag + html;
        }

        // Rewrite absolute localhost URLs to go through the proxy
        // This handles Next.js and other frameworks that use absolute URLs in JS/HTML
        html = html.replace(
          new RegExp(`(["'])http://localhost:${port}/`, 'g'),
          `$1/api/preview/proxy/${port}/`
        );
        html = html.replace(
          new RegExp(`(["'])//localhost:${port}/`, 'g'),
          `$1/api/preview/proxy/${port}/`
        );

        // Rewrite absolute paths that start with / to go through the proxy
        // This fixes Next.js /_next/static/css, /_next/static/chunks, etc.
        // and other frameworks that use absolute paths for assets
        // Match href="/_next/...", src="/_next/...", href="/static/...", etc.
        // but NOT href="/api/preview/proxy/..." (already proxied) or href="#" or href="/"
        html = html.replace(
          /(href|src)=(["'])\/((?!api\/preview\/proxy)[^"'\s>][^"']*)/g,
          `$1=$2/api/preview/proxy/${port}/$3`
        );

        // Rewrite Next.js RSC resource hints (:HL["/_next/..."])
        // These are used to preload fonts, scripts, etc. and need to go through the proxy
        html = html.replace(
          /:HL\["\/((?!api\/preview\/proxy)_next\/[^"]+)"/g,
          `:HL["/api/preview/proxy/${port}/$1"`
        );

        // Also rewrite any other RSC paths that start with /_next/
        html = html.replace(
          /"(\/_next\/static\/[^"]+)"/g,
          (match, path) => {
            if (path.includes('/api/preview/proxy/')) return match;
            return `"/api/preview/proxy/${port}${path}"`;
          }
        );

        // Inject OAuth interceptor, element inspector, and branch indicator before </body> or at the end
        // Note: Fetch interceptor is already injected in <head> above
        const oauthScript = getOAuthInterceptScript();
        const inspectorScript = getInspectorScript();
        const branchScript = getBranchIndicatorScript(branch, projectName);
        const injectedScripts = oauthScript + inspectorScript + branchScript;

        if (html.includes("</body>")) {
          html = html.replace("</body>", `${injectedScripts}</body>`);
        } else if (html.includes("</html>")) {
          html = html.replace("</html>", `${injectedScripts}</html>`);
        } else {
          html += injectedScripts;
        }

        // Override content headers for modified HTML
        responseHeaders["Content-Type"] = "text/html; charset=utf-8";
        responseHeaders["Content-Length"] = new TextEncoder().encode(html).length.toString();
        delete responseHeaders["content-encoding"]; // Remove since we decoded it
        delete responseHeaders["etag"];
        delete responseHeaders["last-modified"];
        responseHeaders["cache-control"] = "no-store";
        responseHeaders["pragma"] = "no-cache";

        return new Response(html, {
          status: response.status,
          headers: responseHeaders,
        });
      }

      // For CSS files, rewrite absolute localhost URLs
      if (contentType.includes("text/css")) {
        let css = await response.text();

        // Rewrite absolute localhost URLs in CSS (for fonts, images, etc)
        css = css.replace(
          new RegExp(`url\\(['"]?http://localhost:${port}/`, 'g'),
          `url(/api/preview/proxy/${port}/`
        );
        css = css.replace(
          new RegExp(`url\\(['"]?//localhost:${port}/`, 'g'),
          `url(/api/preview/proxy/${port}/`
        );

        // CRITICAL: Rewrite relative paths starting with / (like /_next/static/media/...)
        // These are what Next.js uses for fonts and the browser resolves them wrong
        css = css.replace(
          /url\(\s*['"]?\/((?!api\/preview\/proxy)[^'"\s)]+)/g,
          `url(/api/preview/proxy/${port}/$1`
        );

        responseHeaders["Content-Type"] = "text/css; charset=utf-8";
        responseHeaders["Content-Length"] = new TextEncoder().encode(css).length.toString();
        delete responseHeaders["content-encoding"];
        delete responseHeaders["etag"];
        delete responseHeaders["last-modified"];

        return new Response(css, {
          status: response.status,
          headers: responseHeaders,
        });
      }

      // For JavaScript files, rewrite absolute localhost URLs and absolute paths
      if (contentType.includes("javascript") || contentType.includes("application/json")) {
        let js = await response.text();

        // Rewrite absolute localhost URLs in JS/JSON
        js = js.replace(
          new RegExp(`(["'\`])http://localhost:${port}/`, 'g'),
          `$1/api/preview/proxy/${port}/`
        );
        js = js.replace(
          new RegExp(`(["'\`])//localhost:${port}/`, 'g'),
          `$1/api/preview/proxy/${port}/`
        );

        // Rewrite absolute paths in JS (for Next.js dynamic imports, CSS loading, etc.)
        // Match "/_next/...", '/_next/...', `/_next/...`
        // but NOT "/api/preview/proxy/..." (already proxied)
        js = js.replace(
          /(["'\`])\/((?!api\/preview\/proxy)_next\/[^"'\`]+)/g,
          `$1/api/preview/proxy/${port}/$2`
        );
        // Also handle /static/ paths
        js = js.replace(
          /(["'\`])\/((?!api\/preview\/proxy)static\/[^"'\`]+)/g,
          `$1/api/preview/proxy/${port}/$2`
        );

        // Handle RSC payload font/resource hints in JS chunks
        // These look like :HL["/_next/static/media/..."]
        js = js.replace(
          /:HL\["\/((?!api\/preview\/proxy)_next\/[^"]+)"/g,
          `:HL["/api/preview/proxy/${port}/$1"`
        );

        // Handle any standalone /_next/static/ paths in strings
        js = js.replace(
          /"(\/_next\/static\/[^"]+)"/g,
          (match, path) => {
            if (path.includes('/api/preview/proxy/')) return match;
            return `"/api/preview/proxy/${port}${path}"`;
          }
        );

        responseHeaders["Content-Length"] = new TextEncoder().encode(js).length.toString();
        delete responseHeaders["content-encoding"];
        delete responseHeaders["etag"];
        delete responseHeaders["last-modified"];

        return new Response(js, {
          status: response.status,
          headers: responseHeaders,
        });
      }

      // For other content (images, fonts, etc), proxy through with proper headers
      return new Response(response.body, {
        status: response.status,
        headers: responseHeaders,
      });
    } catch (e: any) {
      console.error(`[PreviewProxy] Failed to proxy to port ${port}:`, e.message);
      return error(`Failed to proxy to preview: ${e.message}`, 502);
    }
  }

  return null;
}
