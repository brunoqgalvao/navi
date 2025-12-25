<script lang="ts">
  import { unreadNotificationCount, pendingPermissionRequests } from "../stores";

  interface Props {
    showCount?: boolean;
    size?: "sm" | "md";
    type?: "all" | "permissions";
  }

  let { showCount = true, size = "md", type = "all" }: Props = $props();

  const count = $derived(type === "permissions" ? $pendingPermissionRequests.length : $unreadNotificationCount);
  const hasNotifications = $derived(count > 0);
</script>

{#if hasNotifications}
  <span
    class="inline-flex items-center justify-center font-medium rounded-full
      {size === 'sm' ? 'min-w-4 h-4 text-[10px] px-1' : 'min-w-5 h-5 text-xs px-1.5'}
      {type === 'permissions' ? 'bg-purple-500 text-white' : 'bg-red-500 text-white'}"
  >
    {#if showCount}
      {count > 99 ? "99+" : count}
    {/if}
  </span>
{/if}
