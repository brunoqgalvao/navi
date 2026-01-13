/**
 * Browser + Email Feature Initialization
 *
 * Registers native browser-use and email components
 */

import { registerContentWidget } from "$lib/core";
import { extensionRegistry } from "$lib/features/extensions/registry";
import BrowserActionWidget from "$lib/components/widgets/BrowserActionWidget.svelte";
import EmailNotificationWidget from "$lib/components/widgets/EmailNotificationWidget.svelte";
import EmailPanel from "$lib/features/email/EmailPanel.svelte";
import type { ComponentType, SvelteComponent } from "svelte";
import type { Extension } from "$lib/features/extensions/types";

/**
 * Initialize browser and email features
 * Call this once at app startup
 */
export function initBrowserEmail() {
  // Register browser action widget
  registerContentWidget(
    "browser-action",
    BrowserActionWidget as unknown as ComponentType<SvelteComponent>,
    (content: any) => {
      return (
        typeof content === "object" &&
        content !== null &&
        content.type === "browser_action"
      );
    },
    {
      parseConfig: (content: any) => ({
        action: content.action || "Browser action",
        url: content.url,
        screenshot: content.screenshot,
        result: content.result,
        status: content.status || "pending",
        timestamp: content.timestamp,
        duration: content.duration,
      }),
    }
  );

  // Register email notification widget
  registerContentWidget(
    "email-notification",
    EmailNotificationWidget as unknown as ComponentType<SvelteComponent>,
    (content: any) => {
      return (
        typeof content === "object" &&
        content !== null &&
        content.type === "email_received"
      );
    },
    {
      parseConfig: (content: any) => ({
        from: content.from || "Unknown",
        to: content.to || "",
        subject: content.subject || "(No subject)",
        preview: content.preview,
        timestamp: content.timestamp || Date.now(),
        messageId: content.message_id || "",
        inbox: content.inbox || "",
        hasVerificationLink: content.has_verification_link || false,
      }),
    }
  );

  // Register email sent widget
  registerContentWidget(
    "email-sent",
    EmailNotificationWidget as unknown as ComponentType<SvelteComponent>,
    (content: any) => {
      return (
        typeof content === "object" &&
        content !== null &&
        content.type === "email_sent"
      );
    },
    {
      parseConfig: (content: any) => ({
        from: content.from || "",
        to: content.to || "Unknown",
        subject: content.subject || "(No subject)",
        preview: null,
        timestamp: content.timestamp || Date.now(),
        messageId: content.message_id || "",
        inbox: content.inbox || "",
        hasVerificationLink: false,
      }),
    }
  );

  // Register email extension to the features/extensions registry
  // @experimental - Email is disabled by default (AgentMail integration)
  const emailExtension: Extension = {
    id: "email",
    name: "Email",
    icon: "mail",
    description: "Navi's email inboxes (experimental)",
    panelMode: "email" as any,
    requiresProject: false,
    defaultEnabled: false,
    defaultOrder: 7,
  };
  extensionRegistry.register(emailExtension);
}
