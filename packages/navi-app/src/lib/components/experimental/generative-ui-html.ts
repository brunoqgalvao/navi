export function createSandboxedContent(htmlContent: string, componentId: string, sanitize: (html: string) => string): string {
  const sanitizedHtml = sanitize(htmlContent);
  const escapedId = JSON.stringify(componentId);
  
  const styles = `
    body { margin: 0; padding: 16px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; font-size: 14px; line-height: 1.6; color: #374151; background: white; }
    * { box-sizing: border-box; }
    button { background: #3b82f6; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 14px; }
    button:hover { background: #2563eb; }
    input, select, textarea { border: 1px solid #d1d5db; border-radius: 6px; padding: 8px 12px; font-size: 14px; }
    input:focus, select:focus, textarea:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }
  `;

  const js = `
    var COMPONENT_ID = ${escapedId};
    function sendInteraction(type, target, data) {
      window.parent.postMessage({ source: "generative-ui", id: COMPONENT_ID, type: type, target: target, data: data }, "*");
    }
    document.addEventListener("click", function(e) {
      e.preventDefault();
      var t = e.target;
      sendInteraction("click", { tagName: t.tagName, id: t.id, className: t.className, textContent: (t.textContent || "").trim(), href: t.href });
    });
    document.addEventListener("submit", function(e) {
      e.preventDefault();
      var form = e.target;
      var formData = new FormData(form);
      var data = {};
      formData.forEach(function(value, key) { data[key] = value; });
      sendInteraction("form_submit", { id: form.id, action: form.action, method: form.method }, data);
    });
    document.addEventListener("change", function(e) {
      var t = e.target;
      if (t.type === "checkbox" || t.type === "radio") {
        sendInteraction("input_change", { id: t.id, name: t.name, type: t.type }, { value: t.value, checked: t.checked });
      } else if (t.tagName === "SELECT") {
        sendInteraction("input_change", { id: t.id, name: t.name, type: "select" }, { value: t.value, selectedIndex: t.selectedIndex });
      }
    });
    window.parent.postMessage({ source: "generative-ui", id: COMPONENT_ID, type: "ready" }, "*");
  `;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${styles}</style></head><body>${sanitizedHtml}<script>${js}</script></body></html>`;
}
