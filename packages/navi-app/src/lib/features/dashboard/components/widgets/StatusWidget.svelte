<script lang="ts">
  /**
   * StatusWidget - Shows status of multiple services
   */
  import { onMount } from "svelte";
  import type { StatusWidgetConfig, ServiceStatus } from "../../types";
  import { checkServiceStatus } from "../../api";

  interface Props {
    config: StatusWidgetConfig;
  }

  let { config }: Props = $props();

  let statuses = $state<ServiceStatus[]>([]);

  const services = config.services || [];

  async function checkAllServices() {
    // Initialize all as checking
    statuses = services.map((s) => ({
      name: s.name,
      url: s.url,
      status: "checking" as const,
    }));

    // Check each service in parallel
    const results = await Promise.all(
      services.map(async (service, index) => {
        try {
          const result = await checkServiceStatus(service.url);
          return {
            name: service.name,
            url: service.url,
            status: result.up ? ("up" as const) : ("down" as const),
            latency: result.latency,
          };
        } catch {
          return {
            name: service.name,
            url: service.url,
            status: "down" as const,
          };
        }
      })
    );

    statuses = results;
  }

  onMount(() => {
    checkAllServices();
  });
</script>

<div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
  <div class="px-4 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
    <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Service Status</span>
    <button
      onclick={checkAllServices}
      class="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
      title="Refresh"
    >
      ↻
    </button>
  </div>

  {#if services.length === 0}
    <div class="p-4 text-center text-sm text-gray-500">
      No services configured
    </div>
  {:else}
    <div class="divide-y divide-gray-200 dark:divide-gray-700">
      {#each statuses as service}
        <div class="px-4 py-2 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span
              class="w-2 h-2 rounded-full
                {service.status === 'up' ? 'bg-green-500' : ''}
                {service.status === 'down' ? 'bg-red-500' : ''}
                {service.status === 'checking' ? 'bg-yellow-500 animate-pulse' : ''}"
            ></span>
            <span class="text-sm text-gray-800 dark:text-gray-200">{service.name}</span>
          </div>
          <div class="flex items-center gap-2 text-xs text-gray-500">
            {#if service.status === "checking"}
              <span>Checking...</span>
            {:else if service.status === "up" && service.latency}
              <span>{service.latency}ms</span>
            {:else if service.status === "down"}
              <span class="text-red-500">Down</span>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
