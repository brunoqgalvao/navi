<script lang="ts">
  import { onMount } from 'svelte';

  let visible = $state(false);
  let copied = $state(false);

  const installCmd = 'git clone https://github.com/brunoqgalvao/navi.git && cd navi && bun install && bun run dev:app';

  onMount(() => {
    setTimeout(() => visible = true, 100);
  });

  function copyCommand() {
    navigator.clipboard.writeText(installCmd);
    copied = true;
    setTimeout(() => copied = false, 2000);
  }
</script>

<section class="relative pt-32 pb-20 px-6 overflow-hidden">
  <div class="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-gray-50 blur-[120px] rounded-full pointer-events-none opacity-50"></div>

  <div class="max-w-6xl mx-auto text-center relative z-10">
    <div class={`transition-all duration-1000 transform ${visible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
      <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-sm text-amber-700 mb-8 font-medium">
        <span class="relative flex h-2 w-2">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          <span class="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
        </span>
        Open Source
      </div>

      <h1 class="text-6xl md:text-8xl font-bold tracking-tight mb-8 text-gray-900">
        Already on it.
      </h1>

      <p class="text-xl text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">
        The capable local AI coding assistant that handles your digital chaos. <br>
        Clone it. Run it. Navi lives on your machine.
      </p>

      <!-- Install command -->
      <div class="max-w-2xl mx-auto mb-6">
        <div class="bg-gray-950 rounded-2xl overflow-hidden shadow-2xl shadow-gray-300 ring-1 ring-gray-800">
          <div class="flex items-center justify-between px-4 py-2.5 border-b border-gray-800">
            <div class="flex gap-1.5">
              <div class="w-3 h-3 rounded-full bg-red-500/80"></div>
              <div class="w-3 h-3 rounded-full bg-yellow-500/80"></div>
              <div class="w-3 h-3 rounded-full bg-green-500/80"></div>
            </div>
            <span class="text-xs font-medium text-gray-500">terminal</span>
            <button
              onclick={copyCommand}
              class="text-xs text-gray-500 hover:text-white transition-colors px-2 py-0.5 rounded border border-gray-700 hover:border-gray-500"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <div class="p-5 font-mono text-sm text-left overflow-x-auto">
            <div class="flex items-start gap-2">
              <span class="text-emerald-400 select-none shrink-0">$</span>
              <span class="text-gray-300">git clone https://github.com/brunoqgalvao/navi.git</span>
            </div>
            <div class="flex items-start gap-2 mt-1">
              <span class="text-emerald-400 select-none shrink-0">$</span>
              <span class="text-gray-300">cd navi && bun install</span>
            </div>
            <div class="flex items-start gap-2 mt-1">
              <span class="text-emerald-400 select-none shrink-0">$</span>
              <span class="text-gray-300">bun run dev:app</span>
            </div>
            <div class="mt-3 text-gray-600 text-xs">
              # opens at http://localhost:1420
            </div>
          </div>
        </div>
      </div>

      <!-- Prerequisites -->
      <p class="text-sm text-gray-400 mb-8">
        Requires <a href="https://bun.sh" target="_blank" rel="noopener noreferrer" class="underline hover:text-gray-600 transition-colors">Bun</a> and <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer" class="underline hover:text-gray-600 transition-colors">Node.js</a>.
        You'll also need a <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" class="underline hover:text-gray-600 transition-colors">Claude API key</a>.
      </p>

      <div class="flex flex-col sm:flex-row items-center justify-center gap-4">
        <a
          href="https://github.com/brunoqgalvao/navi"
          target="_blank"
          rel="noopener noreferrer"
          class="px-8 py-4 bg-gray-900 text-white font-medium rounded-xl hover:bg-gray-800 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-gray-200"
        >
          View on GitHub
        </a>
        <a
          href="https://github.com/brunoqgalvao/navi#readme"
          target="_blank"
          rel="noopener noreferrer"
          class="px-8 py-4 bg-white text-gray-700 font-medium rounded-xl border border-gray-200 hover:bg-gray-50 transition-all"
        >
          Read the Docs
        </a>
      </div>
    </div>

    <div class={`mt-24 relative transition-all duration-1000 delay-300 transform ${visible ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0'}`}>
      <div class="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent z-20 h-full w-full pointer-events-none"></div>

      <div class="bg-white rounded-2xl border border-gray-200 shadow-2xl overflow-hidden max-w-5xl mx-auto aspect-[16/10] relative group ring-1 ring-gray-900/5">
        <div class="h-12 bg-gray-50/80 backdrop-blur border-b border-gray-100 flex items-center px-4 gap-2 justify-between">
          <div class="flex gap-2">
            <div class="w-3 h-3 rounded-full bg-gray-300"></div>
            <div class="w-3 h-3 rounded-full bg-gray-300"></div>
            <div class="w-3 h-3 rounded-full bg-gray-300"></div>
          </div>
          <div class="text-xs font-medium text-gray-400">localhost:1420</div>
          <div class="w-10"></div>
        </div>

        <div class="flex h-full">
          <div class="w-64 bg-gray-50 border-r border-gray-100 hidden md:flex flex-col p-4 gap-6">
             <div class="space-y-1">
                <div class="px-2 py-1 text-xs font-bold text-gray-400 uppercase tracking-widest">Workspaces</div>
                <div class="px-3 py-2 bg-white rounded-lg shadow-sm border border-gray-200 text-sm font-semibold text-gray-900 flex items-center gap-2">
                   <div class="w-2 h-2 rounded-full bg-emerald-500"></div>
                   Website Redesign
                </div>
                <div class="px-3 py-2 text-sm text-gray-500 font-medium hover:text-gray-900 cursor-pointer">Q4 Planning</div>
                <div class="px-3 py-2 text-sm text-gray-500 font-medium hover:text-gray-900 cursor-pointer">Personal Blog</div>
             </div>

             <div class="space-y-1">
                <div class="px-2 py-1 text-xs font-bold text-gray-400 uppercase tracking-widest">Recent Threads</div>
                <div class="px-3 py-2 text-sm text-gray-600 truncate">Fixing nav bar z-index</div>
                <div class="px-3 py-2 text-sm text-gray-600 truncate">Drafting about page</div>
             </div>
          </div>

          <div class="flex-1 p-8 flex flex-col bg-white relative">
             <div class="flex-1 space-y-8">
                <div class="flex justify-end">
                   <div class="bg-gray-900 px-5 py-3 rounded-2xl rounded-tr-sm text-white text-[15px] max-w-[80%] shadow-lg shadow-gray-200 font-medium">
                      Navi, refactor the header component. It's looking cluttered on mobile.
                   </div>
                </div>

                <div class="flex gap-4 max-w-[85%]">
                   <div class="w-10 h-10 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center font-bold text-sm text-gray-900 shadow-sm shrink-0">N</div>
                   <div class="space-y-4 flex-1 pt-1">
                      <p class="text-[15px] text-gray-800 leading-relaxed font-medium">On it. I'll simplify the navigation links and implement a hamburger menu for mobile viewports.</p>

                      <div class="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
                         <div class="px-4 py-2 border-b border-gray-200 bg-gray-100/50 flex items-center gap-2">
                            <div class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                            <span class="text-xs font-bold text-gray-500 uppercase tracking-wide">Task in Progress</span>
                         </div>
                         <div class="p-4 font-mono text-xs text-gray-600 space-y-2">
                            <div class="flex items-center gap-2">
                               <svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                               <span class="text-gray-900">read_file</span> <span class="text-gray-500">src/lib/Header.svelte</span>
                            </div>
                            <div class="flex items-center gap-2">
                               <svg class="w-4 h-4 text-gray-400 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                               <span class="text-gray-900">write_file</span> <span class="text-gray-500">src/lib/MobileMenu.svelte...</span>
                            </div>
                         </div>
                      </div>
                   </div>
                </div>
             </div>

             <div class="mt-auto relative group">
                <div class="absolute -inset-0.5 bg-gradient-to-r from-gray-200 to-gray-100 rounded-2xl opacity-50 blur group-hover:opacity-100 transition duration-200"></div>
                <div class="relative bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4 shadow-sm">
                   <div class="flex-1 text-gray-400 text-sm font-medium">Reply to Navi...</div>
                   <div class="p-2 bg-gray-100 rounded-lg text-gray-400">
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
                   </div>
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>
