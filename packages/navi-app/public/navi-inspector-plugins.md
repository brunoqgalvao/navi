# Navi Element Inspector - Framework Plugins

Add element inspection to your dev server so you can click on elements in Navi's browser preview and get their info in the chat.

## Automatic Injection (Native Preview)

**If you're using Navi's Native Preview (⚡), the inspector is automatically injected!** No setup needed - just click the cursor icon in the preview toolbar to start inspecting.

## Manual Setup (Browser Panel)

For the standalone Browser panel, you need to inject the inspector script manually via your dev server.

## How It Works

1. Your dev server injects `navi-inspector.js` into the page
2. In Navi's browser preview, click the **Inspect** button (cursor icon)
3. Hover over elements to see them highlighted
4. Click an element to capture its info
5. The element's HTML, selector, and attributes appear in your chat input

## Framework Setup

### Vite (React, Vue, Svelte, etc.)

Add to `vite.config.ts`:

```ts
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    {
      name: 'navi-inspector',
      transformIndexHtml(html) {
        // Only inject in dev mode
        if (process.env.NODE_ENV === 'production') return html
        return html.replace(
          '</body>',
          '<script src="http://localhost:3001/navi-inspector.js"></script></body>'
        )
      }
    },
    // ... your other plugins
  ]
})
```

### Next.js

Option 1: Custom `_document.tsx` (Pages Router):

```tsx
// pages/_document.tsx
import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html>
      <Head />
      <body>
        <Main />
        <NextScript />
        {process.env.NODE_ENV === 'development' && (
          <script src="http://localhost:3001/navi-inspector.js" />
        )}
      </body>
    </Html>
  )
}
```

Option 2: Layout component (App Router):

```tsx
// app/layout.tsx
import Script from 'next/script'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        {process.env.NODE_ENV === 'development' && (
          <Script src="http://localhost:3001/navi-inspector.js" strategy="lazyOnload" />
        )}
      </body>
    </html>
  )
}
```

### SvelteKit

Add to `src/app.html`:

```html
<!DOCTYPE html>
<html>
  <head>%sveltekit.head%</head>
  <body>
    <div style="display: contents">%sveltekit.body%</div>

    <!-- Navi Inspector (dev only) -->
    <script>
      if (location.hostname === 'localhost') {
        const s = document.createElement('script');
        s.src = 'http://localhost:3001/navi-inspector.js';
        document.body.appendChild(s);
      }
    </script>
  </body>
</html>
```

Or use a Vite plugin in `vite.config.ts` (same as Vite section above).

### Remix

Add to `app/root.tsx`:

```tsx
import { Scripts } from '@remix-run/react'

export default function App() {
  return (
    <html>
      <body>
        {/* ... your content ... */}
        <Scripts />
        {process.env.NODE_ENV === 'development' && (
          <script src="http://localhost:3001/navi-inspector.js" />
        )}
      </body>
    </html>
  )
}
```

### Astro

Add to your layout component:

```astro
---
// src/layouts/Layout.astro
const isDev = import.meta.env.DEV
---
<html>
  <body>
    <slot />
    {isDev && <script src="http://localhost:3001/navi-inspector.js" />}
  </body>
</html>
```

### Plain HTML / Custom Server

Just add before `</body>`:

```html
<script src="http://localhost:3001/navi-inspector.js"></script>
```

## Troubleshooting

### "Inspector not available" message

1. **Check if Navi is running** - The script loads from `localhost:3001`
2. **Check for CSP blocking** - Your dev server might block external scripts. Add `http://localhost:3001` to your CSP `script-src`
3. **Check iframe restrictions** - Some frameworks set `X-Frame-Options`. Remove or adjust it for dev mode

### Inspector loads but doesn't respond

1. **Origin mismatch** - Make sure your dev server is on `localhost` (not `127.0.0.1` or `0.0.0.0`)
2. **Multiple iframes** - The inspector only works in the top-level frame

### CSP Fix (if needed)

Add to your dev server's response headers:

```
Content-Security-Policy: script-src 'self' http://localhost:3001; frame-ancestors 'self' http://localhost:3001;
```

## What Gets Captured

When you click an element, Navi captures:

- **outerHTML** - The element's full HTML (truncated to 2KB)
- **selector** - A unique CSS selector path
- **attributes** - id, class, data-*, aria-*, and common attributes
- **textContent** - The element's text content
- **ancestors** - Parent elements for context
- **computed styles** - Key CSS properties
- **page info** - URL and title
