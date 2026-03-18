<script lang="ts">
  import { marketplaceApi, skillsApi, type Skill } from "../api";
  import { showError, showSuccess } from "../errorHandler";
  import { skillLibrary } from "../stores";

  interface Props {
    open: boolean;
    onClose: () => void;
    installTarget: "global" | "project";
    projectId?: string | null;
    projectPath?: string | null;
    onInstalled?: (skill: Skill | null, scope: "global" | "project") => void;
  }

  let {
    open,
    onClose,
    installTarget,
    projectId = null,
    projectPath = null,
    onInstalled,
  }: Props = $props();

  let commandInput = $state("");
  let installing = $state(false);
  let error: string | null = $state(null);
  const commandFieldId = "skill-install-command";

  const exampleCommand =
    "npx skills add https://github.com/supercent-io/skills-template --skill remotion-video-production";

  let targetTitle = $derived(installTarget === "project" ? "Workspace Install" : "Global Install");
  let targetDescription = $derived(
    installTarget === "project"
      ? "Paste a skills.sh install command and Navi will add it to this workspace, import it into the library, and enable it here."
      : "Paste a skills.sh install command and Navi will add it globally, import it into the library, and keep the global toggle in sync."
  );

  function resetForm() {
    commandInput = "";
    error = null;
  }

  function getProjectPath(): string | undefined {
    const trimmed = projectPath?.trim();
    return trimmed ? trimmed : undefined;
  }

  function normalizeLookupKey(value: string | null | undefined): string {
    return value?.trim().toLowerCase().replace(/^["']|["']$/g, "").replace(/\/+$/, "") ?? "";
  }

  function findInstalledSkill(
    skills: Skill[],
    existingSlugs: Set<string>,
    requestedSkill?: string | null
  ): Skill | null {
    const lookupCandidates = new Set<string>();
    const normalizedRequestedSkill = normalizeLookupKey(requestedSkill);

    if (normalizedRequestedSkill) {
      lookupCandidates.add(normalizedRequestedSkill);
      const trailingSegment = normalizedRequestedSkill.split("/").filter(Boolean).pop();
      if (trailingSegment) {
        lookupCandidates.add(trailingSegment);
      }
    }

    if (lookupCandidates.size > 0) {
      const matched = skills.find((skill) => {
        const slug = normalizeLookupKey(skill.slug);
        const name = normalizeLookupKey(skill.name);
        return lookupCandidates.has(slug) || lookupCandidates.has(name);
      });
      if (matched) {
        return matched;
      }
    }

    const newSkills = skills.filter((skill) => !existingSlugs.has(skill.slug));
    return newSkills.length === 1 ? newSkills[0] : null;
  }

  async function handleInstall() {
    const trimmedCommand = commandInput.trim();
    if (!trimmedCommand) {
      error = "Paste a full `npx skills add ...` command.";
      return;
    }

    if (installTarget === "project" && !projectId) {
      error = "Project install is unavailable without a workspace.";
      return;
    }

    const installProjectPath = installTarget === "project" ? getProjectPath() : undefined;
    if (installTarget === "project" && !installProjectPath) {
      error = "Project path is required for workspace installs.";
      return;
    }

    installing = true;
    error = null;

    const existingSlugs = new Set($skillLibrary.map((skill) => skill.slug));

    try {
      const result = await marketplaceApi.installCommand(
        trimmedCommand,
        installTarget === "global",
        installProjectPath
      );

      await skillsApi.scan(installProjectPath);

      let skills = await skillsApi.list();
      let installedSkill = findInstalledSkill(skills, existingSlugs, result.requestedSkill);

      if (installedSkill) {
        if (installTarget === "global" && !installedSkill.enabled_globally) {
          await skillsApi.enableGlobal(installedSkill.id);
          skills = await skillsApi.list();
          installedSkill = skills.find((skill) => skill.id === installedSkill?.id) ?? installedSkill;
        }

        if (
          installTarget === "project" &&
          projectId &&
          !installedSkill.enabled_projects.includes(projectId)
        ) {
          await skillsApi.enableForProject(projectId, installedSkill.id);
          skills = await skillsApi.list();
          installedSkill = skills.find((skill) => skill.id === installedSkill?.id) ?? installedSkill;
        }
      }

      skillLibrary.set(skills);

      const installedLabel = installedSkill?.name || result.requestedSkill || "Skill";
      showSuccess(
        "Skill installed",
        installTarget === "project"
          ? `${installedLabel} is now available in this workspace`
          : `${installedLabel} has been installed globally`
      );

      onInstalled?.(installedSkill ?? null, installTarget);
      resetForm();
      onClose();
    } catch (e: any) {
      const message = e.message || "Failed to install skill";
      error = message;
      showError({
        title: "Install failed",
        message,
        error: e,
      });
    } finally {
      installing = false;
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    }
  }

  $effect(() => {
    if (open) {
      resetForm();
    }
  });
</script>

{#if open}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/30 p-4"
    onclick={handleBackdropClick}
    onkeydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div class="w-full max-w-2xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
      <div class="flex items-center justify-between border-b border-gray-100 px-6 py-4">
        <div class="flex items-center gap-3">
          <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          <div>
            <h3 class="text-lg font-semibold text-gray-900">Install Skill from Command</h3>
            <p class="text-sm text-gray-500">{targetDescription}</p>
          </div>
        </div>
        <button
          onclick={onClose}
          aria-label="Close install dialog"
          class="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="space-y-5 px-6 py-6">
        <div class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p class="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">{targetTitle}</p>
          <p class="mt-1 text-sm text-amber-800">
            Paste the exact command from skills.sh. Navi runs it for you and then refreshes the local skill library.
          </p>
        </div>

        <div class="space-y-2">
          <label for={commandFieldId} class="block text-sm font-medium text-gray-700">Install command</label>
          <textarea
            id={commandFieldId}
            bind:value={commandInput}
            rows="4"
            placeholder={exampleCommand}
            class="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-mono text-sm text-gray-900 transition-colors focus:border-gray-900 focus:outline-none"
          ></textarea>
          <p class="text-xs text-gray-500">
            Example: <span class="font-mono text-[11px]">{exampleCommand}</span>
          </p>
        </div>

        {#if error}
          <div class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        {/if}
      </div>

      <div class="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
        <button
          onclick={onClose}
          class="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 transition-colors hover:border-gray-400 hover:text-gray-900"
        >
          Cancel
        </button>
        <button
          onclick={handleInstall}
          disabled={installing}
          class="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-black disabled:opacity-50"
        >
          {installing ? "Installing..." : "Install Skill"}
        </button>
      </div>
    </div>
  </div>
{/if}
