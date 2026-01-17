export function createSandboxedContent(htmlContent: string, componentId: string, sanitize: (html: string) => string): string {
  const sanitizedHtml = sanitize(htmlContent);
  const escapedId = JSON.stringify(componentId);

  const styles = `
    body { margin: 0; padding: 16px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; font-size: 14px; line-height: 1.6; color: #374151; background: white; }
    * { box-sizing: border-box; }
    button { background: #3b82f6; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: background 0.15s; }
    button:hover { background: #2563eb; }
    button:active { background: #1d4ed8; }
    button.secondary { background: #6b7280; }
    button.secondary:hover { background: #4b5563; }
    button.danger { background: #ef4444; }
    button.danger:hover { background: #dc2626; }
    button.success { background: #10b981; }
    button.success:hover { background: #059669; }
    input, select, textarea { border: 1px solid #d1d5db; border-radius: 6px; padding: 8px 12px; font-size: 14px; width: 100%; }
    input:focus, select:focus, textarea:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }
    label { display: block; margin-bottom: 4px; font-weight: 500; color: #374151; }
    .form-group { margin-bottom: 12px; }
    .btn-group { display: flex; gap: 8px; margin-top: 16px; }
  `;

  // Our interaction bridge - runs BEFORE user scripts so they can use sendToChat()
  const bridgeJs = `
    var COMPONENT_ID = ${escapedId};

    // Send interaction event to parent (internal use)
    function sendInteraction(type, target, data) {
      window.parent.postMessage({ source: "generative-ui", id: COMPONENT_ID, type: type, target: target, data: data }, "*");
    }

    // PUBLIC API: Send a message to the chat input
    // Usage: sendToChat("User selected option A") or sendToChat({ choice: "A", reason: "..." })
    function sendToChat(message, autoSubmit) {
      var text = typeof message === "string" ? message : JSON.stringify(message, null, 2);
      sendInteraction("send_to_chat", null, { message: text, autoSubmit: autoSubmit || false });
    }

    // PUBLIC API: Submit form data to chat
    // Usage: submitForm({ name: "John", email: "john@example.com" })
    function submitForm(data, autoSubmit) {
      sendInteraction("form_submit", { id: "programmatic" }, { ...data, _autoSubmit: autoSubmit || false });
    }

    // Capture form submissions
    document.addEventListener("submit", function(e) {
      e.preventDefault();
      var form = e.target;
      var formData = new FormData(form);
      var data = {};
      formData.forEach(function(value, key) { data[key] = value; });
      // Check for data-autosubmit attribute on form
      var autoSubmit = form.hasAttribute("data-autosubmit");
      sendInteraction("form_submit", { id: form.id, action: form.action, method: form.method }, { ...data, _autoSubmit: autoSubmit });
    });

    // Capture all clicks
    document.addEventListener("click", function(e) {
      var t = e.target;
      // Walk up to find clickable element (button or anchor)
      while (t && t !== document.body) {
        if (t.tagName === "BUTTON") {
          // For buttons NOT in a form, or non-submit buttons, send to chat
          var isSubmit = t.type === "submit" || !t.type || t.type === "";
          var inForm = t.closest("form");

          // If it's a submit button in a form, let the form handler deal with it
          if (isSubmit && inForm) {
            return;
          }

          // Otherwise, this is an action button - send to chat
          var buttonText = (t.textContent || "").trim();
          var buttonValue = t.value || t.dataset.value || buttonText;

          // If button has data-message, use that
          if (t.dataset.message) {
            sendInteraction("send_to_chat", null, { message: t.dataset.message, autoSubmit: t.hasAttribute("data-autosubmit") });
          } else {
            sendInteraction("button_click", {
              tagName: t.tagName,
              id: t.id,
              name: t.name,
              className: t.className,
              textContent: buttonText,
              value: buttonValue,
              dataset: Object.assign({}, t.dataset)
            }, { buttonText: buttonText, buttonValue: buttonValue });
          }
          return;
        } else if (t.tagName === "A") {
          // Prevent navigation for links
          e.preventDefault();
          sendInteraction("click", {
            tagName: t.tagName,
            href: t.href,
            textContent: (t.textContent || "").trim()
          });
          return;
        }
        t = t.parentElement;
      }
    });

    // Capture input changes
    document.addEventListener("change", function(e) {
      var t = e.target;
      if (t.type === "checkbox" || t.type === "radio") {
        sendInteraction("input_change", { id: t.id, name: t.name, type: t.type }, { value: t.value, checked: t.checked });
      } else if (t.tagName === "SELECT") {
        sendInteraction("input_change", { id: t.id, name: t.name, type: "select" }, { value: t.value, selectedIndex: t.selectedIndex });
      }
    });

    // Auto-resize iframe to content
    function reportHeight() {
      var height = document.body.scrollHeight;
      sendInteraction("resize", null, { height: height });
    }

    // Report height on load and when content changes
    window.addEventListener("load", reportHeight);
    new MutationObserver(reportHeight).observe(document.body, { childList: true, subtree: true, attributes: true });

    // Signal ready
    console.log("[GenUI] Script initialized, ID:", COMPONENT_ID);
    window.parent.postMessage({ source: "generative-ui", id: COMPONENT_ID, type: "ready" }, "*");
    setTimeout(reportHeight, 100);
    console.log("[GenUI] Ready message sent");
  `;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${styles}</style><script>${bridgeJs}</script></head><body>${sanitizedHtml}</body></html>`;
}
