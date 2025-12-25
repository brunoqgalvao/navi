<script>
  const cases = [
    {
      role: "Developer",
      action: "Refactor this legacy code",
      result: "Navi analyzes the directory, suggests a plan, and implements it file by file.",
      bg: "bg-blue-50 text-blue-700 border-blue-100"
    },
    {
      role: "Writer",
      action: "Help me plot my novel",
      result: "Navi remembers your characters, outlines chapters, and checks for plot holes.",
      bg: "bg-amber-50 text-amber-700 border-amber-100"
    },
    {
      role: "Planner",
      action: "Plan my trip to Japan",
      result: "Navi pulls flight data, checks your calendar, and finds hotels within budget.",
      bg: "bg-emerald-50 text-emerald-700 border-emerald-100"
    }
  ];
</script>

<section class="py-24 bg-gray-50 border-t border-gray-100">
  <div class="max-w-6xl mx-auto px-6">
    <div class="text-center mb-16">
      <h2 class="text-3xl font-bold text-gray-900 mb-4">Navi adapts to you.</h2>
      <p class="text-gray-500 font-medium">From code to content, it's the capable assistant you've been waiting for.</p>
    </div>
    
    <div class="space-y-4">
      {#each cases as useCase}
        <div class="group bg-white rounded-2xl border border-gray-200 p-8 transition-all hover:shadow-md hover:border-gray-300">
          <div class="flex flex-col md:flex-row gap-8 items-start md:items-center">
            <div class="md:w-1/4">
              <span class={`text-xs font-bold font-mono uppercase tracking-wider mb-2 block w-fit px-2 py-1 rounded border ${useCase.bg}`}>{useCase.role}</span>
              <div class="font-bold text-gray-900 text-lg">"{useCase.action}"</div>
            </div>
            
            <div class="hidden md:block text-gray-300 group-hover:text-gray-400 transition-colors">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path></svg>
            </div>
            
            <div class="flex-1 text-gray-500 text-sm leading-relaxed font-medium">
              {useCase.result}
            </div>
          </div>
        </div>
      {/each}
    </div>
  </div>
</section>
