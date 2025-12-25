<script lang="ts">
  import Hero from './lib/components/Hero.svelte';
  import Features from './lib/components/Features.svelte';
  import UseCases from './lib/components/UseCases.svelte';
  import Footer from './lib/components/Footer.svelte';
</script>

<svelte:head>
  <title>Navi - Already on it.</title>
</svelte:head>

<main class="min-h-screen bg-white text-gray-900 selection:bg-gray-200 selection:text-gray-900 font-sans">
  <Hero />
  <Features />
  <UseCases />
  <Footer />
</main>