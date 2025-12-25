<script lang="ts">
  interface Props {
    timestamp: number;
    class?: string;
  }

  let { timestamp, class: className = "" }: Props = $props();

  let now = $state(Date.now());

  // Update every minute
  $effect(() => {
    const interval = setInterval(() => {
      now = Date.now();
    }, 60000);
    return () => clearInterval(interval);
  });

  let relativeTime = $derived.by(() => {
    const seconds = Math.floor((now - timestamp) / 1000);

    if (seconds < 60) return "Just now";

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;

    const weeks = Math.floor(days / 7);
    if (weeks < 4) return `${weeks}w ago`;

    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;

    const years = Math.floor(days / 365);
    return `${years}y ago`;
  });
</script>

<span class={className} title={new Date(timestamp).toLocaleString()}>{relativeTime}</span>
