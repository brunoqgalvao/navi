<script lang="ts">
  import Hero from './lib/components/Hero.svelte';
  import Features from './lib/components/Features.svelte';
  import UseCases from './lib/components/UseCases.svelte';
  import Footer from './lib/components/Footer.svelte';
  import Admin from './lib/components/Admin.svelte';

  // Simple routing based on pathname
  let isAdminRoute = $state(false);
  let pageTitle = $derived(isAdminRoute ? 'Navi Admin' : 'Navi - Already on it.');

  $effect(() => {
    isAdminRoute = typeof window !== 'undefined' && window.location.pathname === '/admin';
  });
</script>

<svelte:head>
  <title>{pageTitle}</title>
</svelte:head>

{#if isAdminRoute}
  <Admin />
{:else}
  <main class="min-h-screen bg-white text-gray-900 selection:bg-gray-200 selection:text-gray-900 font-sans">
    <Hero />
    <Features />
    <UseCases />
    <Footer />
  </main>
{/if}