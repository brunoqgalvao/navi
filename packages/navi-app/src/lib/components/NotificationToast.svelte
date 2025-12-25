<script lang="ts">
  import { activeNotifications, notifications, type Notification } from "../stores";
  import { fly, fade } from "svelte/transition";

  const typeStyles: Record<string, { bg: string; border: string; icon: string; iconBg: string }> = {
    info: { bg: "bg-blue-50", border: "border-blue-200", icon: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z", iconBg: "bg-blue-100 text-blue-600" },
    success: { bg: "bg-green-50", border: "border-green-200", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z", iconBg: "bg-green-100 text-green-600" },
    warning: { bg: "bg-amber-50", border: "border-amber-200", icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z", iconBg: "bg-amber-100 text-amber-600" },
    error: { bg: "bg-red-50", border: "border-red-200", icon: "M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z", iconBg: "bg-red-100 text-red-600" },
    permission_request: { bg: "bg-purple-50", border: "border-purple-200", icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z", iconBg: "bg-purple-100 text-purple-600" },
  };

  function getStyle(type: string) {
    return typeStyles[type] || typeStyles.info;
  }

  function formatTime(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
</script>

<div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
  {#each $activeNotifications.slice(0, 5) as notification (notification.id)}
    {@const style = getStyle(notification.type)}
    <div
      class="pointer-events-auto {style.bg} {style.border} border rounded-xl shadow-lg overflow-hidden"
      in:fly={{ x: 100, duration: 200 }}
      out:fade={{ duration: 150 }}
    >
      <div class="p-4">
        <div class="flex items-start gap-3">
          <div class="shrink-0 w-8 h-8 rounded-lg {style.iconBg} flex items-center justify-center">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={style.icon} />
            </svg>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-start justify-between gap-2">
              <p class="text-sm font-medium text-gray-900">{notification.title}</p>
              <button
                onclick={() => notifications.dismiss(notification.id)}
                class="shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {#if notification.message}
              <p class="text-sm text-gray-600 mt-1 line-clamp-2">{notification.message}</p>
            {/if}
            <p class="text-xs text-gray-400 mt-1">{formatTime(notification.timestamp)}</p>
          </div>
        </div>

        {#if notification.actions && notification.actions.length > 0}
          <div class="flex gap-2 mt-3 pt-3 border-t {style.border}">
            {#each notification.actions as action}
              <button
                onclick={() => {
                  action.handler();
                  notifications.dismiss(notification.id);
                }}
                class="flex-1 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors
                  {action.variant === 'primary' ? 'bg-gray-900 text-white hover:bg-black' :
                   action.variant === 'danger' ? 'bg-red-600 text-white hover:bg-red-700' :
                   'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}"
              >
                {action.label}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/each}
</div>
