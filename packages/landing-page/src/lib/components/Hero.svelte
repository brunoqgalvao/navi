<script lang="ts">
  import { onMount } from 'svelte';
  
  let visible = $state(false);
  let showEmailModal = $state(false);
  let email = $state('');
  let submitting = $state(false);
  let submitted = $state(false);
  
  onMount(() => {
    setTimeout(() => visible = true, 100);
  });

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!email.trim()) return;
    
    submitting = true;
    
    try {
      const response = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      
      if (response.ok) {
        submitted = true;
      }
    } catch (err) {
      submitted = true;
    }
    
    submitting = false;
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
        Early Access Alpha
      </div>
      
      <h1 class="text-6xl md:text-8xl font-bold tracking-tight mb-8 text-gray-900">
        Already on it.
      </h1>
      
      <p class="text-xl text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">
        The capable local assistant that handles your digital chaos. <br>
        Navi lives on your desktop, knows your files, and gets work done.
      </p>
      
      <div class="flex flex-col sm:flex-row items-center justify-center gap-4">
        <button 
          onclick={() => showEmailModal = true}
          class="px-8 py-4 bg-gray-900 text-white font-medium rounded-xl hover:bg-gray-800 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-gray-200"
        >
          Get Early Access
        </button>
        <button class="px-8 py-4 bg-white text-gray-700 font-medium rounded-xl border border-gray-200 hover:bg-gray-50 transition-all">
          View on GitHub
        </button>
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
          <div class="text-xs font-medium text-gray-400">navi-local</div>
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

{#if showEmailModal}
  <div 
    class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    onclick={() => showEmailModal = false}
    onkeydown={(e) => e.key === 'Escape' && (showEmailModal = false)}
    role="dialog"
    tabindex="-1"
  >
    <div 
      class="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 relative"
      onclick={(e) => e.stopPropagation()}
      role="document"
    >
      <button 
        onclick={() => showEmailModal = false}
        class="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        aria-label="Close"
      >
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {#if submitted}
        <div class="text-center py-4">
          <div class="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg class="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 class="text-xl font-bold text-gray-900 mb-2">You're on the list!</h3>
          <p class="text-gray-500 mb-6">Thanks for your interest. Download Navi below.</p>
          <a 
            href="/downloads/Navi_0.2.1_aarch64.dmg" 
            download
            class="inline-flex items-center gap-2 px-6 py-3 bg-gray-900 text-white font-medium rounded-xl hover:bg-gray-800 transition-all"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download for macOS (Apple Silicon)
          </a>
          <p class="text-xs text-gray-400 mt-4">v0.2.1 Alpha • macOS 12+</p>
          <div class="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-left">
            <p class="text-xs text-amber-800 font-medium mb-1">Alpha Build Notice</p>
            <p class="text-xs text-amber-700">macOS may show "app is damaged" for unsigned builds. To open, run in Terminal:</p>
            <code class="block mt-1.5 text-xs bg-amber-100 px-2 py-1 rounded text-amber-900 font-mono">xattr -cr /Applications/Navi.app</code>
          </div>
        </div>
      {:else}
        <div class="text-center mb-6">
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-sm text-amber-700 mb-4 font-medium">
            Early Access Alpha
          </div>
          <h3 class="text-2xl font-bold text-gray-900 mb-2">Get Early Access</h3>
          <p class="text-gray-500">Enter your email to download the alpha version and receive updates.</p>
        </div>

        <form onsubmit={handleSubmit} class="space-y-4">
          <div>
            <input
              type="email"
              bind:value={email}
              placeholder="you@example.com"
              required
              class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            class="w-full px-6 py-3 bg-gray-900 text-white font-medium rounded-xl hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Submitting...' : 'Continue to Download'}
          </button>
        </form>

        <p class="text-xs text-gray-400 text-center mt-4">
          We'll only email you about important updates. No spam.
        </p>
      {/if}
    </div>
  </div>
{/if}
