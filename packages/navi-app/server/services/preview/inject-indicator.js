/**
 * Branch Indicator Injection Script
 *
 * This script injects a floating branch indicator into the preview.
 * It's injected into the container's HTML responses via iframe sandboxing.
 */
(function() {
  'use strict';

  // Check if already injected
  if (window.__NAVI_BRANCH_INDICATOR_LOADED) return;
  window.__NAVI_BRANCH_INDICATOR_LOADED = true;

  // Get branch info from environment, URL, or message
  const envBranch = typeof import !== 'undefined' && import.meta?.env?.VITE_NAVI_BRANCH;
  const urlBranch = new URLSearchParams(window.location.search).get('navi_branch');

  let branchInfo = {
    branch: envBranch || urlBranch || window.NAVI_BRANCH || 'preview',
    meta: 'Container Preview'
  };

  // Create indicator HTML
  const indicatorHTML = `
    <div id="navi-branch-indicator" style="position:fixed;top:12px;right:12px;z-index:999999;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;user-select:none">
      <div id="navi-branch-badge" style="display:flex;align-items:center;gap:8px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:8px 14px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15),0 2px 4px rgba(0,0,0,0.1);cursor:move;font-size:13px;font-weight:600;backdrop-filter:blur(10px);transition:all 0.2s ease">
        <span class="navi-branch-icon" style="font-size:16px;line-height:1">🌿</span>
        <div class="navi-branch-text" style="display:flex;flex-direction:column;gap:2px">
          <div class="navi-branch-name" style="font-weight:700;letter-spacing:-0.01em" id="navi-branch-name">${branchInfo.branch}</div>
          <div class="navi-branch-meta" style="font-size:10px;opacity:0.85;font-weight:500" id="navi-branch-meta">${branchInfo.meta}</div>
        </div>
        <div class="navi-branch-controls" style="display:flex;gap:4px;margin-left:4px">
          <button class="navi-branch-btn" id="navi-minimize-btn" title="Minimize" style="width:20px;height:20px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.2);border:none;border-radius:4px;color:white;cursor:pointer;font-size:12px;transition:all 0.15s ease">−</button>
          <button class="navi-branch-btn" id="navi-close-btn" title="Hide" style="width:20px;height:20px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.2);border:none;border-radius:4px;color:white;cursor:pointer;font-size:12px;transition:all 0.15s ease">×</button>
        </div>
      </div>
    </div>
  `;

  // Inject into DOM when ready
  function inject() {
    if (document.body) {
      const container = document.createElement('div');
      container.innerHTML = indicatorHTML;
      document.body.appendChild(container.firstElementChild);
      setupInteractions();
    } else {
      setTimeout(inject, 10);
    }
  }

  // Setup interactions
  function setupInteractions() {
    const indicator = document.getElementById('navi-branch-indicator');
    const badge = document.getElementById('navi-branch-badge');
    const text = badge.querySelector('.navi-branch-text');
    const controls = badge.querySelector('.navi-branch-controls');
    const minimizeBtn = document.getElementById('navi-minimize-btn');
    const closeBtn = document.getElementById('navi-close-btn');
    const nameEl = document.getElementById('navi-branch-name');
    const metaEl = document.getElementById('navi-branch-meta');

    let isMinimized = localStorage.getItem('navi-branch-minimized') === 'true';
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };

    // Apply saved state
    if (isMinimized) {
      toggleMinimize(true);
    }

    if (localStorage.getItem('navi-branch-indicator-hidden') === 'true') {
      indicator.style.display = 'none';
    }

    // Restore position
    const savedPos = localStorage.getItem('navi-branch-position');
    if (savedPos) {
      const pos = JSON.parse(savedPos);
      indicator.style.left = pos.x + 'px';
      indicator.style.top = pos.y + 'px';
      indicator.style.right = 'auto';
    }

    function toggleMinimize(minimize) {
      isMinimized = minimize;
      if (minimize) {
        badge.style.padding = '6px 10px';
        badge.style.opacity = '0.7';
        text.style.display = 'none';
        controls.style.display = 'none';
        minimizeBtn.textContent = '+';
      } else {
        badge.style.padding = '8px 14px';
        badge.style.opacity = '1';
        text.style.display = 'flex';
        controls.style.display = 'flex';
        minimizeBtn.textContent = '−';
      }
      localStorage.setItem('navi-branch-minimized', minimize.toString());
    }

    // Minimize/expand
    minimizeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMinimize(!isMinimized);
    });

    // Close
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      indicator.style.display = 'none';
      localStorage.setItem('navi-branch-indicator-hidden', 'true');
    });

    // Dragging
    badge.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      isDragging = true;
      const rect = indicator.getBoundingClientRect();
      dragOffset.x = e.clientX - rect.left;
      dragOffset.y = e.clientY - rect.top;
      badge.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      e.preventDefault();
      const x = e.clientX - dragOffset.x;
      const y = e.clientY - dragOffset.y;
      indicator.style.left = x + 'px';
      indicator.style.top = y + 'px';
      indicator.style.right = 'auto';
      localStorage.setItem('navi-branch-position', JSON.stringify({ x, y }));
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        badge.style.cursor = 'move';
      }
    });

    // Hover effects
    badge.addEventListener('mouseenter', () => {
      if (!isDragging) {
        badge.style.boxShadow = '0 6px 16px rgba(0,0,0,0.2),0 3px 6px rgba(0,0,0,0.15)';
        badge.style.transform = 'translateY(-1px)';
        if (!isMinimized) {
          badge.style.opacity = '1';
        } else {
          badge.style.opacity = '1';
        }
      }
    });

    badge.addEventListener('mouseleave', () => {
      if (!isDragging) {
        badge.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15),0 2px 4px rgba(0,0,0,0.1)';
        badge.style.transform = 'translateY(0)';
        if (isMinimized) {
          badge.style.opacity = '0.7';
        }
      }
    });

    // Button hover effects
    const btns = [minimizeBtn, closeBtn];
    btns.forEach(btn => {
      btn.addEventListener('mouseenter', () => {
        btn.style.background = 'rgba(255,255,255,0.3)';
        btn.style.transform = 'scale(1.05)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'rgba(255,255,255,0.2)';
        btn.style.transform = 'scale(1)';
      });
      btn.addEventListener('mousedown', () => {
        btn.style.transform = 'scale(0.95)';
      });
      btn.addEventListener('mouseup', () => {
        btn.style.transform = 'scale(1.05)';
      });
    });

    // Listen for updates from parent
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'navi:branchInfo') {
        nameEl.textContent = event.data.branch;
        if (event.data.meta) {
          metaEl.textContent = event.data.meta;
        }
        branchInfo = event.data;
      }
    });

    // Request branch info from parent
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'navi:getBranchInfo' }, '*');
    }

    // Expose API
    window.naviBranchIndicator = {
      update: (branch, meta) => {
        nameEl.textContent = branch;
        if (meta) metaEl.textContent = meta;
        branchInfo = { branch, meta };
      },
      show: () => {
        indicator.style.display = 'block';
        localStorage.removeItem('navi-branch-indicator-hidden');
      },
      hide: () => {
        indicator.style.display = 'none';
        localStorage.setItem('navi-branch-indicator-hidden', 'true');
      },
      minimize: () => toggleMinimize(true),
      expand: () => toggleMinimize(false)
    };
  }

  // Start injection
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
