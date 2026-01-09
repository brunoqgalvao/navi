# Branch Indicator for Container Previews

A floating, draggable indicator that shows which git branch is being previewed in your container.

## Features

- **Branch name display** - Shows the current worktree/branch name
- **Draggable** - Move it anywhere on the screen
- **Minimizable** - Collapse to a small icon when needed
- **Persistent** - Remembers position and minimized state
- **Non-intrusive** - Hide it completely if you don't want it
- **Universal** - Works with ANY project via the proxy route

## How It Works (Universal - Any Project)

The preview panel now routes iframe requests through a **proxy** that automatically injects the branch indicator into HTML responses. This means:

1. **ANY project** you preview gets the branch indicator automatically
2. **No code changes** required in your app
3. The proxy intercepts HTML responses and injects the indicator script before `</body>`

When you open a preview:
- Direct URL: `http://localhost:4001` (for "Open in Browser")
- Proxy URL: `http://localhost:3001/api/preview/proxy/4001/` (for iframe, with indicator)

## Automatic Injection (for Navi Apps Only)

If your app uses Vite and runs in a Navi preview container, the indicator can ALSO be injected via:

1. **Environment variables** - Container sets `VITE_NAVI_BRANCH` and `NAVI_BRANCH`
2. **Vite config** - Exposes branch name to frontend via `import.meta.env.VITE_NAVI_BRANCH`
3. **Script injection** - `main.ts` loads the indicator script when in preview mode

## Manual Integration (for Any App)

### Option 1: Script Tag

Add this to your HTML `<head>` or before `</body>`:

```html
<script>
  // Set branch name (optional, will auto-detect from parent window)
  window.NAVI_BRANCH = 'my-feature-branch';
</script>
<script src="http://localhost:3001/api/preview/branch-indicator.js" async></script>
```

### Option 2: Dynamic Import

```javascript
// In your app's entry point
if (process.env.NAVI_PREVIEW === 'true') {
  const script = document.createElement('script');
  script.src = 'http://localhost:3001/api/preview/branch-indicator.js';
  script.async = true;
  document.head.appendChild(script);
}
```

### Option 3: Query Parameter

The indicator will automatically read from `?navi_branch=my-branch` in the URL.

## API

Once loaded, the indicator exposes a global API:

```javascript
// Update branch info
window.naviBranchIndicator.update('new-branch', 'Custom Meta');

// Show/hide
window.naviBranchIndicator.show();
window.naviBranchIndicator.hide();

// Minimize/expand programmatically
window.naviBranchIndicator.minimize();
window.naviBranchIndicator.expand();
```

## How It Works

1. **Container Manager** (`container-manager.ts`) sets `VITE_NAVI_BRANCH` env var when creating containers
2. **Vite Config** (`vite.config.js`) exposes this to the frontend
3. **Main App** (`main.ts`) injects the indicator script when running in preview
4. **Indicator Script** (`inject-indicator.js`) creates the floating UI
5. **Preview Panel** (`ContainerPreviewPanel.svelte`) sends branch info via `postMessage`

## Files

- `inject-indicator.js` - The indicator implementation
- `branch-indicator.html` - Standalone version (not used, kept for reference)
- API endpoint: `/api/preview/branch-indicator.js`
- Branch metadata: `/api/preview/branch-info/:port`

## Storage

The indicator uses `localStorage` to persist:
- Position on screen
- Minimized state
- Hidden state

Keys:
- `navi-branch-position` - JSON with `{x, y}` coordinates
- `navi-branch-minimized` - Boolean string
- `navi-branch-indicator-hidden` - Boolean string

## Styling

The indicator uses inline styles to avoid conflicts with app CSS. Colors use a purple gradient that stands out but doesn't clash with most designs.

## Troubleshooting

**Indicator doesn't appear:**
- Check that `VITE_NAVI_PREVIEW` is `"true"` in console
- Check that `VITE_NAVI_BRANCH` has a value
- Check browser console for script loading errors
- Try clearing localStorage: `localStorage.removeItem('navi-branch-indicator-hidden')`

**Can't move it:**
- Make sure you're dragging the badge itself, not the buttons
- Check that `z-index: 999999` isn't being overridden

**Branch name wrong:**
- Check environment variables in container: `docker exec <container> env | grep NAVI`
- Try updating manually: `window.naviBranchIndicator.update('correct-branch')`
