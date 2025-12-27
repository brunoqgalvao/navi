<script lang="ts">
  interface Props {
    value: string;
    onSave: (newValue: string) => void;
    class?: string;
    inputClass?: string;
    placeholder?: string;
  }

  let {
    value,
    onSave,
    class: className = "",
    inputClass = "",
    placeholder = "Enter text..."
  }: Props = $props();

  let isEditing = $state(false);
  let editValue = $state(value);
  let inputEl: HTMLInputElement | null = $state(null);

  function startEditing() {
    editValue = value;
    isEditing = true;
    // Focus input after it renders
    requestAnimationFrame(() => {
      inputEl?.focus();
      inputEl?.select();
    });
  }

  function save() {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== value) {
      onSave(trimmed);
    }
    isEditing = false;
  }

  function cancel() {
    editValue = value;
    isEditing = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  }

  function handleBlur() {
    save();
  }

  function handleDoubleClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    startEditing();
  }
</script>

{#if isEditing}
  <input
    bind:this={inputEl}
    type="text"
    bind:value={editValue}
    onkeydown={handleKeydown}
    onblur={handleBlur}
    onclick={(e) => e.stopPropagation()}
    {placeholder}
    class="bg-white border border-gray-300 rounded px-1 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 {inputClass}"
  />
{:else}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <span
    ondblclick={handleDoubleClick}
    class="cursor-text select-none {className}"
    title="Double-click to edit"
  >
    {value}
  </span>
{/if}
