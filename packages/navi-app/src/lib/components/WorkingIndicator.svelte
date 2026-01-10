<script lang="ts">
  import DoodleThinking from "./DoodleThinking.svelte";

  type Variant = "pulse" | "spin" | "dots" | "doodle";
  type Size = "xs" | "sm" | "md" | "lg";
  type Color = "gray" | "blue" | "indigo" | "purple" | "green" | "orange" | "red";

  interface Props {
    variant?: Variant;
    size?: Size;
    color?: Color;
    label?: string;
    class?: string;
  }

  let { variant = "spin", size = "sm", color = "gray", label, class: className = "" }: Props = $props();

  // Map WorkingIndicator sizes to DoodleThinking sizes
  const doodleSizeMap: Record<Size, "sm" | "md" | "lg"> = {
    xs: "sm",
    sm: "sm",
    md: "md",
    lg: "lg",
  };

  const sizeMap: Record<Size, string> = {
    xs: "w-1.5 h-1.5",
    sm: "w-2 h-2",
    md: "w-3 h-3",
    lg: "w-4 h-4",
  };

  const spinSizeMap: Record<Size, string> = {
    xs: "w-2 h-2 border",
    sm: "w-3 h-3 border-2",
    md: "w-4 h-4 border-2",
    lg: "w-5 h-5 border-2",
  };

  const colorMap: Record<Color, { bg: string; border: string; borderTop: string; text: string }> = {
    gray: { bg: "bg-gray-400", border: "border-gray-300", borderTop: "border-t-gray-700", text: "text-gray-500" },
    blue: { bg: "bg-blue-500", border: "border-blue-300", borderTop: "border-t-blue-600", text: "text-blue-500" },
    indigo: { bg: "bg-indigo-500", border: "border-indigo-300", borderTop: "border-t-indigo-600", text: "text-indigo-500" },
    purple: { bg: "bg-purple-500", border: "border-purple-300", borderTop: "border-t-purple-600", text: "text-purple-500" },
    green: { bg: "bg-green-500", border: "border-green-300", borderTop: "border-t-green-600", text: "text-green-500" },
    orange: { bg: "bg-orange-500", border: "border-orange-300", borderTop: "border-t-orange-600", text: "text-orange-500" },
    red: { bg: "bg-red-500", border: "border-red-300", borderTop: "border-t-red-600", text: "text-red-500" },
  };

  const colors = $derived(colorMap[color]);
</script>

{#if variant === "pulse"}
  <span class="flex items-center gap-1 {className}">
    <span class="{sizeMap[size]} {colors.bg} rounded-full animate-pulse"></span>
    {#if label}
      <span class="text-xs {colors.text}">{label}</span>
    {/if}
  </span>
{:else if variant === "spin"}
  <span class="flex items-center gap-2 {className}">
    <span class="{spinSizeMap[size]} {colors.border} {colors.borderTop} rounded-full animate-spin"></span>
    {#if label}
      <span class="text-xs {colors.text}">{label}</span>
    {/if}
  </span>
{:else if variant === "dots"}
  <span class="flex items-center gap-2 {className}">
    <span class="flex gap-0.5">
      <span class="{sizeMap[size]} {colors.bg} rounded-full animate-bounce" style="animation-delay: 0ms"></span>
      <span class="{sizeMap[size]} {colors.bg} rounded-full animate-bounce" style="animation-delay: 150ms"></span>
      <span class="{sizeMap[size]} {colors.bg} rounded-full animate-bounce" style="animation-delay: 300ms"></span>
    </span>
    {#if label}
      <span class="text-xs {colors.text}">{label}</span>
    {/if}
  </span>
{:else if variant === "doodle"}
  <DoodleThinking size={doodleSizeMap[size]} {label} class={className} />
{/if}
