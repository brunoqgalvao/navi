<script lang="ts">
  interface Props {
    active: boolean;
    onclick: (e: Event) => void;
    size?: "sm" | "md";
    showOnHover?: boolean;
  }

  let { active, onclick, size = "md", showOnHover = true }: Props = $props();

  const sizeClasses = {
    sm: "w-3.5 h-3.5",
    md: "w-4 h-4"
  };
</script>

<button 
  {onclick}
  class="p-1.5 rounded-lg transition-all {active ? 'text-yellow-400 opacity-100' : 'text-gray-300 hover:text-yellow-300'} {showOnHover && !active ? 'opacity-0 group-hover:opacity-100' : ''} hover:bg-gray-50/50"
  title={active ? 'Unstar' : 'Star'}
>
  <svg class={sizeClasses[size]} fill={active ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path>
  </svg>
</button>
