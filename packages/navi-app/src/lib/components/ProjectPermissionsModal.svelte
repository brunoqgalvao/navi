<script lang="ts">
  import type { Project } from "../api";
  import type { PermissionSettings } from "../api";

  interface Props {
    project: Project | null;
    globalPermissionSettings: PermissionSettings | null;
    onClose: () => void;
    onToggleAutoAccept: (project: Project, newValue: boolean) => Promise<void>;
    onOpenSettings: () => void;
  }

  let {
    project,
    globalPermissionSettings,
    onClose,
    onToggleAutoAccept,
    onOpenSettings,
  }: Props = $props();
</script>

{#if project}
  <div 
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/30"
    onclick={onClose}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div 
      class="bg-white border border-gray-200 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden animate-in zoom-in-95 duration-200"
      onclick={(e) => e.stopPropagation()}
    >
      <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
        <div class="flex items-center gap-3">
          <div class="p-2 bg-purple-100 rounded-lg">
            <svg class="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div>
            <h3 class="font-semibold text-sm text-gray-900">Permissions</h3>
            <p class="text-xs text-gray-500">{project.name}</p>
          </div>
        </div>
        <button onclick={onClose} class="p-1 text-gray-400 hover:text-gray-600 transition-colors">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div class="p-6 overflow-y-auto max-h-[calc(80vh-80px)]">
        <div class="space-y-4">
          <div class="border border-gray-200 rounded-lg p-4">
            <div class="flex items-center justify-between">
              <div>
                <h4 class="font-medium text-sm text-gray-900">Always Allow for this Project</h4>
                <p class="text-xs text-gray-500 mt-1">Skip permission prompts for all chats in this project</p>
              </div>
              <button
                onclick={() => onToggleAutoAccept(project, !project.auto_accept_all)}
                class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors {project.auto_accept_all ? 'bg-purple-600' : 'bg-gray-300'}"
              >
                <span class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform {project.auto_accept_all ? 'translate-x-6' : 'translate-x-1'}"></span>
              </button>
            </div>
          </div>

          <div class="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h4 class="font-medium text-sm text-gray-900 mb-2">How Permissions Work</h4>
            <ul class="text-xs text-gray-600 space-y-1.5">
              <li class="flex items-start gap-2">
                <span class="text-gray-400">•</span>
                <span><strong>Allow</strong> - Allows that single action</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="text-gray-400">•</span>
                <span><strong>Always Allow</strong> - Allows all actions for the rest of the chat (persists)</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="text-gray-400">•</span>
                <span><strong>Project toggle above</strong> - Skips all prompts for this project</span>
              </li>
            </ul>
          </div>
          
          <div class="border border-gray-200 rounded-lg p-4">
            <h4 class="font-medium text-sm text-gray-900 mb-2">Global Settings</h4>
            <p class="text-xs text-gray-500 mb-3">These settings apply to all projects.</p>
            {#if globalPermissionSettings}
              <div class="space-y-2 text-sm">
                <div class="flex items-center justify-between py-1">
                  <span class="text-gray-600">Auto-accept all (global)</span>
                  <span class={globalPermissionSettings.autoAcceptAll ? "text-amber-600 font-medium" : "text-gray-400"}>
                    {globalPermissionSettings.autoAcceptAll ? "Enabled" : "Disabled"}
                  </span>
                </div>
                <div class="flex items-center justify-between py-1">
                  <span class="text-gray-600">Tools requiring confirmation</span>
                  <span class="text-gray-900 font-medium">{globalPermissionSettings.requireConfirmation.length}</span>
                </div>
              </div>
            {:else}
              <p class="text-sm text-gray-500">Loading...</p>
            {/if}
          </div>

          <div class="flex justify-end">
            <button 
              onclick={onOpenSettings}
              class="px-4 py-2 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-lg transition-colors"
            >
              Open Global Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}
