<script lang="ts">
  /**
   * Multi-Session MCP Widget
   *
   * Beautiful UIs for multi-agent coordination tools:
   * - spawn_agent: Shows agent card being spawned with role, task, type
   * - get_context: Shows context query and result summary
   * - log_decision: Shows decision being logged with category
   * - escalate: Shows escalation with type and urgency
   * - deliver: Shows delivery summary with artifacts
   */

  interface Props {
    toolName: string;
    input: Record<string, any>;
    result?: { content: string; is_error?: boolean };
    compact?: boolean;
  }

  let { toolName, input, result, compact = false }: Props = $props();

  const hasResult = $derived(!!result);
  const hasError = $derived(result?.is_error === true);
  const isSuccess = $derived(hasResult && !hasError);

  // Parse result for display
  function parseResult(): Record<string, any> | null {
    if (!result?.content) return null;
    try {
      const parsed = JSON.parse(result.content);
      return parsed.result || parsed;
    } catch {
      return null;
    }
  }

  const parsedResult = $derived(parseResult());

  // Agent type colors and icons
  const agentTypeConfig: Record<string, { color: string; bgColor: string; icon: string }> = {
    browser: { color: 'text-blue-600', bgColor: 'bg-blue-100', icon: '🌐' },
    coding: { color: 'text-emerald-600', bgColor: 'bg-emerald-100', icon: '🔧' },
    runner: { color: 'text-cyan-600', bgColor: 'bg-cyan-100', icon: '▶️' },
    research: { color: 'text-purple-600', bgColor: 'bg-purple-100', icon: '🔍' },
    planning: { color: 'text-amber-600', bgColor: 'bg-amber-100', icon: '📋' },
    reviewer: { color: 'text-rose-600', bgColor: 'bg-rose-100', icon: '👀' },
    general: { color: 'text-gray-600', bgColor: 'bg-gray-100', icon: '🤖' },
  };

  const getAgentConfig = (type: string) => agentTypeConfig[type] || agentTypeConfig.general;

  // Escalation type config
  const escalationConfig: Record<string, { color: string; icon: string; label: string }> = {
    question: { color: 'text-blue-600', icon: '❓', label: 'Question' },
    decision_needed: { color: 'text-amber-600', icon: '⚖️', label: 'Decision Needed' },
    blocker: { color: 'text-red-600', icon: '🚫', label: 'Blocked' },
    permission: { color: 'text-purple-600', icon: '🔐', label: 'Permission Required' },
  };

  // Delivery type config
  const deliveryConfig: Record<string, { color: string; icon: string }> = {
    code: { color: 'text-emerald-600', icon: '💻' },
    research: { color: 'text-purple-600', icon: '📊' },
    decision: { color: 'text-amber-600', icon: '✅' },
    artifact: { color: 'text-blue-600', icon: '📦' },
    error: { color: 'text-red-600', icon: '❌' },
  };

  // Model badge config - matches app design language (subtle, dark mode aware)
  const modelConfig: Record<string, { bg: string; text: string; label: string }> = {
    opus: { bg: 'bg-violet-50 dark:bg-violet-900/30', text: 'text-violet-600 dark:text-violet-400', label: 'Opus' },
    sonnet: { bg: 'bg-blue-50 dark:bg-blue-900/30', text: 'text-blue-600 dark:text-blue-400', label: 'Sonnet' },
    haiku: { bg: 'bg-emerald-50 dark:bg-emerald-900/30', text: 'text-emerald-600 dark:text-emerald-400', label: 'Haiku' },
  };

  // Get model from input or parsed result
  const resolvedModel = $derived(() => {
    // First check explicit input
    if (input.model) return input.model;
    // Then check result for resolved model
    if (parsedResult?.model) return parsedResult.model;
    // Default shows as inherited
    return null;
  });

  const getModelConfig = (model: string | null) => {
    if (!model) return null;
    return modelConfig[model.toLowerCase()] || modelConfig.sonnet;
  };
</script>

{#if compact}
  <!-- Compact pill view -->
  {@const compactModel = resolvedModel()}
  {@const compactMConfig = getModelConfig(compactModel)}
  <div class="flex items-center gap-2 px-2 py-1 text-xs rounded-md border
    {toolName === 'spawn_agent' ? 'border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/30' :
     toolName === 'escalate' ? 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30' :
     toolName === 'deliver' ? 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/30' :
     'border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50'}">
    <span class="text-sm">
      {toolName === 'spawn_agent' ? '🚀' :
       toolName === 'get_context' ? '📖' :
       toolName === 'log_decision' ? '📝' :
       toolName === 'escalate' ? '🆘' :
       toolName === 'deliver' ? '📦' : '🔧'}
    </span>
    <span class="font-medium text-gray-700">
      {toolName === 'spawn_agent' ? 'Spawn' :
       toolName === 'get_context' ? 'Context' :
       toolName === 'log_decision' ? 'Decision' :
       toolName === 'escalate' ? 'Escalate' :
       toolName === 'deliver' ? 'Deliver' : toolName}
    </span>
    <span class="text-gray-500 truncate">
      {#if toolName === 'spawn_agent'}
        {input.role || 'agent'}
      {:else if toolName === 'get_context'}
        {input.source}
      {:else if toolName === 'log_decision'}
        {input.category || 'decision'}
      {:else if toolName === 'escalate'}
        {input.type}
      {:else if toolName === 'deliver'}
        {input.type}
      {/if}
    </span>
    {#if toolName === 'spawn_agent' && compactMConfig}
      <span class="text-[9px] px-1 py-0.5 rounded {compactMConfig.bg} {compactMConfig.text} font-medium">
        {compactMConfig.label}
      </span>
    {/if}
    {#if hasResult}
      <span class="{isSuccess ? 'text-green-500' : 'text-red-500'}">
        {isSuccess ? '✓' : '✗'}
      </span>
    {:else}
      <span class="w-2.5 h-2.5 border border-gray-300 border-t-transparent rounded-full animate-spin"></span>
    {/if}
  </div>

{:else if toolName === 'spawn_agent'}
  <!-- Spawn Agent - Show agent card -->
  {@const agentType = input.agent_type || 'general'}
  {@const config = getAgentConfig(agentType)}
  {@const model = resolvedModel()}
  {@const mConfig = getModelConfig(model)}
  <div class="rounded-lg border border-indigo-200 dark:border-indigo-800 bg-gradient-to-br from-indigo-50/80 to-white dark:from-indigo-950/50 dark:to-gray-900 overflow-hidden">
    <div class="px-3 py-2 border-b border-indigo-100 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/30">
      <div class="flex items-center gap-2">
        <div class="p-1.5 rounded-md bg-indigo-100 dark:bg-indigo-900/50">
          <span class="text-lg">🚀</span>
        </div>
        <div class="flex-1">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-indigo-800 dark:text-indigo-300">Spawning Agent</span>
            {#if !hasResult}
              <span class="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></span>
            {:else if isSuccess}
              <span class="text-xs text-green-600 dark:text-green-400 font-medium">✓ Spawned</span>
            {/if}
          </div>
        </div>
        <!-- Model badge in header -->
        {#if mConfig}
          <span class="text-[10px] px-1.5 py-0.5 rounded font-medium {mConfig.bg} {mConfig.text}">
            {mConfig.label}
          </span>
        {:else}
          <span class="text-[10px] px-1.5 py-0.5 rounded font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
            Inherited
          </span>
        {/if}
      </div>
    </div>

    <div class="p-3">
      <!-- Agent Preview Card -->
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 shadow-sm">
        <div class="flex items-start gap-3">
          <div class="w-10 h-10 rounded-lg {config.bgColor} flex items-center justify-center text-xl flex-shrink-0">
            {config.icon}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <span class="font-medium text-gray-900 dark:text-gray-100">{input.title || input.role || 'Agent'}</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded {config.bgColor} {config.color} font-medium">
                {agentType}
              </span>
            </div>
            {#if input.role}
              <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">Role: {input.role}</div>
            {/if}
            {#if input.task}
              <p class="text-sm text-gray-600 dark:text-gray-300 line-clamp-2">{input.task}</p>
            {/if}
            {#if input.backend && input.backend !== 'claude'}
              <div class="flex items-center gap-2 mt-2 text-xs">
                <span class="px-1.5 py-0.5 bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded font-medium">{input.backend}</span>
              </div>
            {/if}
          </div>
        </div>
      </div>

      {#if isSuccess && parsedResult}
        <div class="mt-2 text-xs text-gray-500 flex items-center gap-1">
          <svg class="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
          </svg>
          Agent spawned • Working independently
        </div>
      {/if}
    </div>

    {#if hasError && result?.content}
      <div class="px-3 pb-3">
        <div class="text-xs text-red-600 bg-red-50 border border-red-100 rounded p-2">
          {result.content}
        </div>
      </div>
    {/if}
  </div>

{:else if toolName === 'get_context'}
  <!-- Get Context - Show query and result summary -->
  <div class="rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50/80 to-white overflow-hidden">
    <div class="px-3 py-2 border-b border-blue-100 bg-blue-50/50">
      <div class="flex items-center gap-2">
        <span class="text-lg">📖</span>
        <span class="text-sm font-medium text-blue-800">Getting Context</span>
        <span class="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
          {input.source}
        </span>
      </div>
    </div>
    <div class="p-3">
      {#if input.query}
        <div class="text-sm text-gray-600 bg-white rounded border border-gray-100 p-2 mb-2">
          "{input.query}"
        </div>
      {/if}
      {#if input.sibling_role}
        <div class="text-xs text-gray-500">
          Querying sibling: <span class="font-medium">{input.sibling_role}</span>
        </div>
      {/if}
      {#if isSuccess && parsedResult}
        <div class="mt-2 text-xs text-green-600 flex items-center gap-1">
          <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
          </svg>
          Context retrieved
        </div>
      {/if}
    </div>
  </div>

{:else if toolName === 'log_decision'}
  <!-- Log Decision -->
  <div class="rounded-lg border border-amber-200 bg-gradient-to-br from-amber-50/80 to-white overflow-hidden">
    <div class="px-3 py-2 border-b border-amber-100 bg-amber-50/50">
      <div class="flex items-center gap-2">
        <span class="text-lg">📝</span>
        <span class="text-sm font-medium text-amber-800">Logging Decision</span>
        {#if input.category}
          <span class="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
            {input.category}
          </span>
        {/if}
      </div>
    </div>
    <div class="p-3">
      <div class="bg-white rounded-lg border border-amber-100 p-3">
        <p class="text-sm text-gray-700 font-medium">{input.decision}</p>
        {#if input.rationale}
          <p class="text-xs text-gray-500 mt-2 italic">"{input.rationale}"</p>
        {/if}
      </div>
      {#if isSuccess}
        <div class="mt-2 text-xs text-green-600 flex items-center gap-1">
          <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
          </svg>
          Decision logged • Visible to all agents
        </div>
      {/if}
    </div>
  </div>

{:else if toolName === 'escalate'}
  <!-- Escalate -->
  {@const escConfig = escalationConfig[input.type] || { color: 'text-gray-600', icon: '⚠️', label: input.type }}
  <div class="rounded-lg border border-red-200 bg-gradient-to-br from-red-50/80 to-white overflow-hidden">
    <div class="px-3 py-2 border-b border-red-100 bg-red-50/50">
      <div class="flex items-center gap-2">
        <span class="text-lg">{escConfig.icon}</span>
        <span class="text-sm font-medium text-red-800">Escalating to Parent</span>
        <span class="text-xs px-1.5 py-0.5 rounded bg-red-100 {escConfig.color} font-medium">
          {escConfig.label}
        </span>
      </div>
    </div>
    <div class="p-3">
      <div class="bg-white rounded-lg border border-red-100 p-3">
        <p class="text-sm text-gray-700 font-medium">{input.summary}</p>
        {#if input.context}
          <p class="text-xs text-gray-500 mt-2">{input.context}</p>
        {/if}
        {#if input.options && input.options.length > 0}
          <div class="mt-2 pt-2 border-t border-gray-100">
            <div class="text-xs text-gray-500 mb-1">Options:</div>
            <div class="flex flex-wrap gap-1">
              {#each input.options as opt}
                <span class="text-xs bg-gray-100 px-2 py-0.5 rounded">{opt}</span>
              {/each}
            </div>
          </div>
        {/if}
      </div>
      {#if isSuccess}
        <div class="mt-2 text-xs text-amber-600 flex items-center gap-1">
          <span class="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>
          Waiting for parent response...
        </div>
      {/if}
    </div>
  </div>

{:else if toolName === 'deliver'}
  <!-- Deliver -->
  {@const delConfig = deliveryConfig[input.type] || { color: 'text-gray-600', icon: '📦' }}
  <div class="rounded-lg border border-green-200 bg-gradient-to-br from-green-50/80 to-white overflow-hidden">
    <div class="px-3 py-2 border-b border-green-100 bg-green-50/50">
      <div class="flex items-center gap-2">
        <span class="text-lg">{delConfig.icon}</span>
        <span class="text-sm font-medium text-green-800">Delivering Results</span>
        <span class="text-xs px-1.5 py-0.5 rounded bg-green-100 {delConfig.color} font-medium">
          {input.type}
        </span>
      </div>
    </div>
    <div class="p-3">
      <div class="bg-white rounded-lg border border-green-100 p-3">
        <p class="text-sm text-gray-700 font-medium">{input.summary}</p>
        {#if input.artifacts && input.artifacts.length > 0}
          <div class="mt-2 pt-2 border-t border-gray-100">
            <div class="text-xs text-gray-500 mb-1">Artifacts ({input.artifacts.length}):</div>
            <div class="space-y-1">
              {#each input.artifacts.slice(0, 3) as artifact}
                <div class="flex items-center gap-1 text-xs">
                  <svg class="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span class="font-mono text-gray-600 truncate">{artifact.path}</span>
                </div>
              {/each}
              {#if input.artifacts.length > 3}
                <div class="text-xs text-gray-400">+{input.artifacts.length - 3} more</div>
              {/if}
            </div>
          </div>
        {/if}
      </div>
      {#if isSuccess}
        <div class="mt-2 text-xs text-green-600 flex items-center gap-1">
          <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
          </svg>
          Delivered to parent • Session complete
        </div>
      {/if}
    </div>
  </div>

{:else}
  <!-- Fallback for unknown tools -->
  <div class="rounded-lg border border-gray-200 bg-gray-50 p-3">
    <div class="flex items-center gap-2 text-sm text-gray-600">
      <span>🔧</span>
      <span class="font-medium">{toolName}</span>
    </div>
    <pre class="mt-2 text-xs text-gray-500 overflow-x-auto">{JSON.stringify(input, null, 2)}</pre>
  </div>
{/if}
