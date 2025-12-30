<script lang="ts">
  import { activeNotifications, notifications, type Notification } from "../stores";
  import { fly, fade } from "svelte/transition";
  import { cubicOut } from "svelte/easing";

  const typeStyles: Record<string, { accent: string; icon: string; glow: string }> = {
    info: {
      accent: "from-blue-500 to-cyan-400",
      icon: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
      glow: "shadow-blue-500/20"
    },
    success: {
      accent: "from-emerald-500 to-green-400",
      icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
      glow: "shadow-emerald-500/20"
    },
    warning: {
      accent: "from-amber-500 to-orange-400",
      icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
      glow: "shadow-amber-500/20"
    },
    error: {
      accent: "from-red-500 to-rose-400",
      icon: "M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z",
      glow: "shadow-red-500/20"
    },
    permission_request: {
      accent: "from-violet-500 to-purple-400",
      icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
      glow: "shadow-violet-500/20"
    },
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

<div class="fixed bottom-4 right-4 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none">
  {#each $activeNotifications.slice(0, 5) as notification (notification.id)}
    {@const style = getStyle(notification.type)}
    <div
      class="pointer-events-auto relative overflow-hidden rounded-2xl shadow-2xl {style.glow}"
      in:fly={{ x: 100, duration: 300, easing: cubicOut }}
      out:fade={{ duration: 150 }}
    >
      <!-- Glass background - light mode -->
      <div class="absolute inset-0 bg-white"></div>

      <!-- Accent gradient bar -->
      <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r {style.accent}"></div>

      <!-- Content -->
      <div class="relative p-4">
        <div class="flex items-start gap-3">
          <!-- Icon with gradient background -->
          <div class="shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br {style.accent} flex items-center justify-center shadow-lg">
            <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={style.icon} />
            </svg>
          </div>

          <div class="flex-1 min-w-0">
            <div class="flex items-start justify-between gap-2">
              <p class="text-sm font-semibold text-gray-900">{notification.title}</p>
              <button
                onclick={() => notifications.dismiss(notification.id)}
                class="shrink-0 w-6 h-6 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-all duration-200 group"
              >
                <svg class="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {#if notification.message}
              <p class="text-sm text-gray-600 mt-1 line-clamp-2 leading-relaxed">{notification.message}</p>
            {/if}
            <p class="text-xs text-gray-400 mt-2 font-medium">{formatTime(notification.timestamp)}</p>
          </div>
        </div>

        {#if notification.actions && notification.actions.length > 0}
          <div class="flex gap-2 mt-4 pt-3 border-t border-gray-100">
            {#each notification.actions as action}
              <button
                onclick={() => {
                  action.handler();
                  notifications.dismiss(notification.id);
                }}
                class="flex-1 px-4 py-2 text-sm font-medium rounded-xl transition-all duration-200
                  {action.variant === 'primary'
                    ? 'bg-gradient-to-r ' + style.accent + ' text-white shadow-lg hover:shadow-xl hover:scale-[1.02]'
                    : action.variant === 'danger'
                      ? 'bg-gradient-to-r from-red-500 to-rose-500 text-white shadow-lg hover:shadow-xl hover:scale-[1.02]'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
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
