<script lang="ts">
  let adminKey = $state("");
  let isLoggedIn = $state(false);
  let loginError = $state("");
  let loading = $state(false);

  // Stats data
  let stats = $state<{
    crashes: {
      total: number;
      today: number;
      thisWeek: number;
      topErrors: Array<{ error_type: string; message: string; count: number }>;
    };
    usage: {
      totalEvents: number;
      eventsToday: number;
      topEvents: Array<{ event_name: string; count: number }>;
      eventsByDay: Array<{ date: string; count: number }>;
    };
    users: {
      total: number;
      activeToday: number;
      activeThisWeek: number;
      versionDistribution: Array<{ app_version: string; users: number }>;
    };
  } | null>(null);

  // Detailed data views
  let crashes = $state<Array<{
    id: number;
    device_id: string;
    app_version: string;
    os: string;
    error_type: string;
    message: string;
    stack: string;
    created_at: string;
  }>>([]);
  let events = $state<Array<{
    id: number;
    device_id: string;
    app_version: string;
    event_name: string;
    properties: Record<string, unknown>;
    created_at: string;
  }>>([]);

  let activeTab = $state<"overview" | "crashes" | "events">("overview");
  let refreshing = $state(false);

  // Check if already logged in (session storage)
  $effect(() => {
    const savedKey = sessionStorage.getItem("admin_key");
    if (savedKey) {
      adminKey = savedKey;
      isLoggedIn = true;
      loadStats();
    }
  });

  async function login() {
    if (!adminKey.trim()) {
      loginError = "Please enter an admin key";
      return;
    }

    loading = true;
    loginError = "";

    try {
      const res = await fetch("/api/telemetry/stats", {
        headers: { Authorization: `Bearer ${adminKey}` },
      });

      if (res.status === 401) {
        loginError = "Invalid admin key";
        loading = false;
        return;
      }

      if (!res.ok) {
        loginError = "Failed to authenticate";
        loading = false;
        return;
      }

      // Success - save key and load data
      sessionStorage.setItem("admin_key", adminKey);
      isLoggedIn = true;
      stats = await res.json();
    } catch (err) {
      loginError = "Connection error";
    } finally {
      loading = false;
    }
  }

  function logout() {
    sessionStorage.removeItem("admin_key");
    isLoggedIn = false;
    adminKey = "";
    stats = null;
    crashes = [];
    events = [];
  }

  async function loadStats() {
    refreshing = true;
    try {
      const res = await fetch("/api/telemetry/stats", {
        headers: { Authorization: `Bearer ${adminKey}` },
      });
      if (res.ok) {
        stats = await res.json();
      }
    } catch (err) {
      console.error("Failed to load stats:", err);
    } finally {
      refreshing = false;
    }
  }

  async function loadCrashes() {
    try {
      const res = await fetch("/api/telemetry/crashes?limit=50", {
        headers: { Authorization: `Bearer ${adminKey}` },
      });
      if (res.ok) {
        const data = await res.json();
        crashes = data.crashes;
      }
    } catch (err) {
      console.error("Failed to load crashes:", err);
    }
  }

  async function loadEvents() {
    try {
      const res = await fetch("/api/telemetry/usage?limit=50", {
        headers: { Authorization: `Bearer ${adminKey}` },
      });
      if (res.ok) {
        const data = await res.json();
        events = data.events;
      }
    } catch (err) {
      console.error("Failed to load events:", err);
    }
  }

  function handleTabChange(tab: "overview" | "crashes" | "events") {
    activeTab = tab;
    if (tab === "crashes" && crashes.length === 0) {
      loadCrashes();
    } else if (tab === "events" && events.length === 0) {
      loadEvents();
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString();
  }

  function truncate(str: string, len: number) {
    if (!str) return "";
    return str.length > len ? str.substring(0, len) + "..." : str;
  }
</script>

<div class="min-h-screen bg-gray-950 text-gray-100">
  {#if !isLoggedIn}
    <!-- Login Screen -->
    <div class="flex items-center justify-center min-h-screen">
      <div class="w-full max-w-md p-8">
        <div class="text-center mb-8">
          <h1 class="text-3xl font-bold text-white mb-2">Navi Admin</h1>
          <p class="text-gray-400">Enter your admin key to access the dashboard</p>
        </div>

        <form onsubmit={(e) => { e.preventDefault(); login(); }} class="space-y-4">
          <div>
            <label for="adminKey" class="block text-sm font-medium text-gray-300 mb-2">
              Admin Key
            </label>
            <input
              id="adminKey"
              type="password"
              bind:value={adminKey}
              placeholder="Enter admin key..."
              class="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {#if loginError}
            <p class="text-red-400 text-sm">{loginError}</p>
          {/if}

          <button
            type="submit"
            disabled={loading}
            class="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            {loading ? "Authenticating..." : "Login"}
          </button>
        </form>

        <div class="mt-8 text-center">
          <a href="/" class="text-gray-500 hover:text-gray-300 text-sm">
            ← Back to Navi
          </a>
        </div>
      </div>
    </div>
  {:else}
    <!-- Dashboard -->
    <div class="flex">
      <!-- Sidebar -->
      <div class="w-64 bg-gray-900 min-h-screen p-4 border-r border-gray-800">
        <div class="flex items-center justify-between mb-8">
          <h1 class="text-xl font-bold text-white">Navi Admin</h1>
          <button
            onclick={logout}
            class="text-gray-400 hover:text-white text-sm"
            title="Logout"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>

        <nav class="space-y-1">
          <button
            onclick={() => handleTabChange("overview")}
            class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors {activeTab === 'overview' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'}"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Overview
          </button>
          <button
            onclick={() => handleTabChange("crashes")}
            class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors {activeTab === 'crashes' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'}"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Crash Reports
            {#if stats?.crashes.today}
              <span class="ml-auto text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">
                {stats.crashes.today}
              </span>
            {/if}
          </button>
          <button
            onclick={() => handleTabChange("events")}
            class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors {activeTab === 'events' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'}"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Usage Events
          </button>
        </nav>

        <div class="mt-8 pt-8 border-t border-gray-800">
          <button
            onclick={loadStats}
            disabled={refreshing}
            class="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            <svg class="w-4 h-4 {refreshing ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {refreshing ? "Refreshing..." : "Refresh Data"}
          </button>
        </div>
      </div>

      <!-- Main Content -->
      <div class="flex-1 p-8">
        {#if activeTab === "overview"}
          <div class="space-y-8">
            <div>
              <h2 class="text-2xl font-bold text-white mb-6">Dashboard Overview</h2>
            </div>

            {#if stats}
              <!-- Stats Grid -->
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div class="bg-gray-900 rounded-xl p-6 border border-gray-800">
                  <div class="text-gray-400 text-sm mb-1">Total Users</div>
                  <div class="text-3xl font-bold text-white">{stats.users.total}</div>
                  <div class="text-green-400 text-sm mt-1">
                    {stats.users.activeThisWeek} active this week
                  </div>
                </div>

                <div class="bg-gray-900 rounded-xl p-6 border border-gray-800">
                  <div class="text-gray-400 text-sm mb-1">Active Today</div>
                  <div class="text-3xl font-bold text-white">{stats.users.activeToday}</div>
                  <div class="text-gray-500 text-sm mt-1">unique devices</div>
                </div>

                <div class="bg-gray-900 rounded-xl p-6 border border-gray-800">
                  <div class="text-gray-400 text-sm mb-1">Total Events</div>
                  <div class="text-3xl font-bold text-white">{stats.usage.totalEvents.toLocaleString()}</div>
                  <div class="text-blue-400 text-sm mt-1">
                    {stats.usage.eventsToday} today
                  </div>
                </div>

                <div class="bg-gray-900 rounded-xl p-6 border border-gray-800">
                  <div class="text-gray-400 text-sm mb-1">Crashes This Week</div>
                  <div class="text-3xl font-bold {stats.crashes.thisWeek > 0 ? 'text-red-400' : 'text-white'}">
                    {stats.crashes.thisWeek}
                  </div>
                  <div class="text-gray-500 text-sm mt-1">
                    {stats.crashes.total} total
                  </div>
                </div>
              </div>

              <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <!-- Top Events -->
                <div class="bg-gray-900 rounded-xl p-6 border border-gray-800">
                  <h3 class="text-lg font-semibold text-white mb-4">Top Events (7 days)</h3>
                  <div class="space-y-3">
                    {#each stats.usage.topEvents.slice(0, 8) as event}
                      <div class="flex items-center justify-between">
                        <span class="text-gray-300 font-mono text-sm">{event.event_name}</span>
                        <span class="text-gray-500">{event.count}</span>
                      </div>
                    {/each}
                    {#if stats.usage.topEvents.length === 0}
                      <p class="text-gray-500 text-sm">No events yet</p>
                    {/if}
                  </div>
                </div>

                <!-- Version Distribution -->
                <div class="bg-gray-900 rounded-xl p-6 border border-gray-800">
                  <h3 class="text-lg font-semibold text-white mb-4">Version Distribution</h3>
                  <div class="space-y-3">
                    {#each stats.users.versionDistribution as version}
                      <div class="flex items-center justify-between">
                        <span class="text-gray-300 font-mono text-sm">v{version.app_version}</span>
                        <span class="text-gray-500">{version.users} users</span>
                      </div>
                    {/each}
                    {#if stats.users.versionDistribution.length === 0}
                      <p class="text-gray-500 text-sm">No version data yet</p>
                    {/if}
                  </div>
                </div>

                <!-- Top Errors -->
                <div class="bg-gray-900 rounded-xl p-6 border border-gray-800 lg:col-span-2">
                  <h3 class="text-lg font-semibold text-white mb-4">Top Errors (7 days)</h3>
                  <div class="space-y-3">
                    {#each stats.crashes.topErrors as error}
                      <div class="flex items-center justify-between bg-gray-800/50 rounded-lg p-3">
                        <div class="flex-1 min-w-0">
                          <span class="text-red-400 text-sm font-medium">{error.error_type}</span>
                          <p class="text-gray-400 text-sm truncate">{truncate(error.message, 80)}</p>
                        </div>
                        <span class="text-gray-500 ml-4">{error.count}x</span>
                      </div>
                    {/each}
                    {#if stats.crashes.topErrors.length === 0}
                      <p class="text-gray-500 text-sm">No errors - nice!</p>
                    {/if}
                  </div>
                </div>

                <!-- Activity Chart (simple bar representation) -->
                <div class="bg-gray-900 rounded-xl p-6 border border-gray-800 lg:col-span-2">
                  <h3 class="text-lg font-semibold text-white mb-4">Daily Activity (14 days)</h3>
                  <div class="flex items-end gap-1 h-32">
                    {#each stats.usage.eventsByDay as day}
                      {@const maxCount = Math.max(...stats.usage.eventsByDay.map(d => Number(d.count)), 1)}
                      {@const height = (Number(day.count) / maxCount) * 100}
                      <div class="flex-1 flex flex-col items-center gap-1">
                        <div
                          class="w-full bg-blue-500/80 rounded-t"
                          style="height: {Math.max(height, 2)}%"
                          title="{day.date}: {day.count} events"
                        ></div>
                        <span class="text-[10px] text-gray-500 -rotate-45 origin-left">
                          {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    {/each}
                    {#if stats.usage.eventsByDay.length === 0}
                      <p class="text-gray-500 text-sm w-full text-center">No activity data yet</p>
                    {/if}
                  </div>
                </div>
              </div>
            {:else}
              <div class="flex items-center justify-center h-64">
                <div class="text-gray-500">Loading stats...</div>
              </div>
            {/if}
          </div>

        {:else if activeTab === "crashes"}
          <div class="space-y-6">
            <div class="flex items-center justify-between">
              <h2 class="text-2xl font-bold text-white">Crash Reports</h2>
              <button
                onclick={loadCrashes}
                class="text-sm text-gray-400 hover:text-white"
              >
                Refresh
              </button>
            </div>

            <div class="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              <table class="w-full">
                <thead class="bg-gray-800/50">
                  <tr>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Time</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Type</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Message</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Version</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">OS</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-800">
                  {#each crashes as crash}
                    <tr class="hover:bg-gray-800/30">
                      <td class="px-4 py-3 text-sm text-gray-400 whitespace-nowrap">
                        {formatDate(crash.created_at)}
                      </td>
                      <td class="px-4 py-3 text-sm text-red-400 font-mono">
                        {crash.error_type}
                      </td>
                      <td class="px-4 py-3 text-sm text-gray-300 max-w-md truncate">
                        {truncate(crash.message, 60)}
                      </td>
                      <td class="px-4 py-3 text-sm text-gray-400 font-mono">
                        {crash.app_version}
                      </td>
                      <td class="px-4 py-3 text-sm text-gray-400">
                        {crash.os || "-"}
                      </td>
                    </tr>
                  {/each}
                  {#if crashes.length === 0}
                    <tr>
                      <td colspan="5" class="px-4 py-8 text-center text-gray-500">
                        No crash reports yet
                      </td>
                    </tr>
                  {/if}
                </tbody>
              </table>
            </div>
          </div>

        {:else if activeTab === "events"}
          <div class="space-y-6">
            <div class="flex items-center justify-between">
              <h2 class="text-2xl font-bold text-white">Usage Events</h2>
              <button
                onclick={loadEvents}
                class="text-sm text-gray-400 hover:text-white"
              >
                Refresh
              </button>
            </div>

            <div class="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              <table class="w-full">
                <thead class="bg-gray-800/50">
                  <tr>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Time</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Event</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Properties</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Version</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Device</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-800">
                  {#each events as event}
                    <tr class="hover:bg-gray-800/30">
                      <td class="px-4 py-3 text-sm text-gray-400 whitespace-nowrap">
                        {formatDate(event.created_at)}
                      </td>
                      <td class="px-4 py-3 text-sm text-blue-400 font-mono">
                        {event.event_name}
                      </td>
                      <td class="px-4 py-3 text-sm text-gray-400 font-mono max-w-xs truncate">
                        {event.properties ? JSON.stringify(event.properties) : "-"}
                      </td>
                      <td class="px-4 py-3 text-sm text-gray-400 font-mono">
                        {event.app_version}
                      </td>
                      <td class="px-4 py-3 text-sm text-gray-500 font-mono">
                        {event.device_id.substring(0, 8)}...
                      </td>
                    </tr>
                  {/each}
                  {#if events.length === 0}
                    <tr>
                      <td colspan="5" class="px-4 py-8 text-center text-gray-500">
                        No events yet
                      </td>
                    </tr>
                  {/if}
                </tbody>
              </table>
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
