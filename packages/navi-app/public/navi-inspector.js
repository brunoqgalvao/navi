(function() {
  // Navi Element Inspector
  // Injected by dev server plugins OR proxy to enable element selection in Navi preview

  if (window.__naviInspector) return; // Already initialized
  window.__naviInspector = true;

  // When loaded via proxy, we're same-origin with Navi. When loaded via dev server plugin,
  // we need to postMessage to the Navi origin. Detect which case we're in.
  const isProxied = window.location.pathname.startsWith('/api/preview/proxy/');
  const NAVI_ORIGIN = isProxied ? window.location.origin : 'http://localhost:3001';
  const INSPECTOR_ID = 'navi-inspector-' + Math.random().toString(36).slice(2, 9);

  // State
  let inspectMode = false;
  let hoveredElement = null;

  // Create overlay element
  const overlay = document.createElement('div');
  overlay.id = 'navi-inspector-overlay';
  overlay.style.cssText = `
    position: fixed;
    pointer-events: none;
    border: 2px solid #3b82f6;
    background: rgba(59, 130, 246, 0.1);
    z-index: 2147483647;
    transition: all 0.05s ease-out;
    display: none;
    box-sizing: border-box;
  `;
  document.body.appendChild(overlay);

  // Create tooltip for element info
  const tooltip = document.createElement('div');
  tooltip.id = 'navi-inspector-tooltip';
  tooltip.style.cssText = `
    position: fixed;
    pointer-events: none;
    background: #1f2937;
    color: white;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
    font-size: 11px;
    padding: 4px 8px;
    border-radius: 4px;
    z-index: 2147483647;
    display: none;
    max-width: 300px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
  `;
  document.body.appendChild(tooltip);

  // Create mode indicator
  const indicator = document.createElement('div');
  indicator.id = 'navi-inspector-indicator';
  indicator.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="11" cy="11" r="8"></circle>
      <path d="m21 21-4.35-4.35"></path>
    </svg>
    <span>Inspect Mode</span>
    <span style="opacity:0.6;margin-left:4px">ESC to exit</span>
  `;
  indicator.style.cssText = `
    position: fixed;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    background: #3b82f6;
    color: white;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 12px;
    font-weight: 500;
    padding: 6px 12px;
    border-radius: 9999px;
    z-index: 2147483647;
    display: none;
    align-items: center;
    gap: 6px;
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
  `;
  document.body.appendChild(indicator);

  // Generate a unique CSS selector for an element
  function getSelector(el) {
    if (el.id) return '#' + CSS.escape(el.id);

    // Try data-testid or other stable attributes
    const testId = el.getAttribute('data-testid') || el.getAttribute('data-test-id');
    if (testId) return `[data-testid="${CSS.escape(testId)}"]`;

    // Build path
    const path = [];
    let current = el;

    while (current && current !== document.body && current !== document.documentElement) {
      let selector = current.tagName.toLowerCase();

      if (current.id) {
        selector = '#' + CSS.escape(current.id);
        path.unshift(selector);
        break;
      }

      if (current.className && typeof current.className === 'string') {
        const classes = current.className.trim().split(/\s+/).filter(c => c && !c.startsWith('navi-'));
        if (classes.length > 0) {
          selector += '.' + classes.slice(0, 2).map(c => CSS.escape(c)).join('.');
        }
      }

      // Add nth-of-type if needed for uniqueness
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-of-type(${index})`;
        }
      }

      path.unshift(selector);
      current = current.parentElement;
    }

    return path.join(' > ');
  }

  // Get element ancestors for context
  function getAncestors(el, limit = 3) {
    const ancestors = [];
    let current = el.parentElement;

    while (current && current !== document.body && ancestors.length < limit) {
      ancestors.push({
        tag: current.tagName.toLowerCase(),
        id: current.id || undefined,
        class: current.className && typeof current.className === 'string'
          ? current.className.trim().split(/\s+/).slice(0, 3).join(' ')
          : undefined,
      });
      current = current.parentElement;
    }

    return ancestors;
  }

  // Get relevant attributes
  function getAttributes(el) {
    const attrs = {};
    const relevant = ['id', 'class', 'name', 'type', 'role', 'href', 'src', 'alt', 'title', 'placeholder', 'value'];

    for (const attr of el.attributes) {
      if (relevant.includes(attr.name) || attr.name.startsWith('data-') || attr.name.startsWith('aria-')) {
        attrs[attr.name] = attr.value;
      }
    }

    return attrs;
  }

  // Get computed styles (relevant ones)
  function getComputedInfo(el) {
    const computed = window.getComputedStyle(el);
    return {
      display: computed.display,
      position: computed.position,
      width: computed.width,
      height: computed.height,
      color: computed.color,
      backgroundColor: computed.backgroundColor,
      fontSize: computed.fontSize,
      fontFamily: computed.fontFamily.split(',')[0].trim(),
    };
  }

  // Extract element data
  function extractElementData(el) {
    const rect = el.getBoundingClientRect();
    const outerHTML = el.outerHTML;

    return {
      tagName: el.tagName.toLowerCase(),
      selector: getSelector(el),
      outerHTML: outerHTML.length > 2000 ? outerHTML.slice(0, 2000) + '...' : outerHTML,
      innerHTML: el.innerHTML.length > 500 ? el.innerHTML.slice(0, 500) + '...' : el.innerHTML,
      textContent: (el.textContent || '').trim().slice(0, 500),
      attributes: getAttributes(el),
      ancestors: getAncestors(el),
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      computed: getComputedInfo(el),
      page: {
        url: window.location.href,
        title: document.title,
      },
    };
  }

  // Update overlay position
  function updateOverlay(el) {
    if (!el) {
      overlay.style.display = 'none';
      tooltip.style.display = 'none';
      return;
    }

    const rect = el.getBoundingClientRect();

    overlay.style.display = 'block';
    overlay.style.top = rect.top + 'px';
    overlay.style.left = rect.left + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';

    // Update tooltip
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const cls = el.className && typeof el.className === 'string'
      ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
      : '';

    tooltip.textContent = `${tag}${id}${cls}`;
    tooltip.style.display = 'block';

    // Position tooltip
    let tooltipY = rect.top - 28;
    if (tooltipY < 4) tooltipY = rect.bottom + 4;

    let tooltipX = rect.left;
    if (tooltipX + 300 > window.innerWidth) tooltipX = window.innerWidth - 304;
    if (tooltipX < 4) tooltipX = 4;

    tooltip.style.top = tooltipY + 'px';
    tooltip.style.left = tooltipX + 'px';
  }

  // Enable inspect mode
  function enableInspect() {
    inspectMode = true;
    document.body.style.cursor = 'crosshair';
    indicator.style.display = 'flex';
    sendMessage({ type: 'inspector_enabled' });
  }

  // Disable inspect mode
  function disableInspect() {
    inspectMode = false;
    hoveredElement = null;
    document.body.style.cursor = '';
    overlay.style.display = 'none';
    tooltip.style.display = 'none';
    indicator.style.display = 'none';
    sendMessage({ type: 'inspector_disabled' });
  }

  // Send message to parent (Navi)
  function sendMessage(data) {
    window.parent.postMessage({
      source: 'navi-inspector',
      id: INSPECTOR_ID,
      ...data,
    }, NAVI_ORIGIN);
  }

  // Handle mousemove
  function handleMouseMove(e) {
    if (!inspectMode) return;

    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (el && el !== hoveredElement && !el.id?.startsWith('navi-inspector')) {
      hoveredElement = el;
      updateOverlay(el);
    }
  }

  // Handle click
  function handleClick(e) {
    if (!inspectMode) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (el && !el.id?.startsWith('navi-inspector')) {
      const data = extractElementData(el);
      sendMessage({ type: 'element_selected', data });
      disableInspect();
    }

    return false;
  }

  // Handle keydown (Esc to exit)
  function handleKeydown(e) {
    if (e.key === 'Escape' && inspectMode) {
      e.preventDefault();
      disableInspect();
    }
  }

  // Handle messages from Navi
  function handleMessage(e) {
    // Verify origin
    if (e.origin !== NAVI_ORIGIN && e.origin !== window.location.origin) return;

    const { type } = e.data || {};

    switch (type) {
      case 'toggle_inspect':
        if (inspectMode) {
          disableInspect();
        } else {
          enableInspect();
        }
        break;
      case 'enable_inspect':
        enableInspect();
        break;
      case 'disable_inspect':
        disableInspect();
        break;
      case 'ping':
        sendMessage({ type: 'pong' });
        break;
    }
  }

  // Set up event listeners
  document.addEventListener('mousemove', handleMouseMove, true);
  document.addEventListener('click', handleClick, true);
  document.addEventListener('keydown', handleKeydown, true);
  window.addEventListener('message', handleMessage);

  // Announce ready
  sendMessage({ type: 'ready' });

  // Log for debugging
  console.log('[Navi Inspector] Ready - waiting for inspect mode toggle');
})();
