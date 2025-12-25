<script>
  const features = [
    {
      title: "Context Aware",
      desc: "Navi doesn't start blank. It knows your workspace, reads your files, and understands your project structure instantly.",
      icon: "🧠"
    },
    {
      title: "Local & Private",
      desc: "Your data stays on your machine. Navi runs locally, ensuring your private work stays private.",
      icon: "🔒"
    },
    {
      title: "Action Oriented",
      desc: "Navi doesn't just chat. It creates files, runs commands, and executes tasks so you can focus on the big picture.",
      icon: "⚡"
    }
  ];
</script>

<section class="py-24 bg-white relative border-t border-gray-100">
  <div class="max-w-6xl mx-auto px-6">
    <div class="grid md:grid-cols-3 gap-8">
      {#each features as feature}
        <div class="p-8 rounded-3xl bg-gray-50 border border-gray-100 hover:border-gray-300 hover:shadow-lg transition-all group">
          <div class="text-4xl mb-6 grayscale opacity-80 group-hover:scale-110 transition-transform duration-300">{feature.icon}</div>
          <h3 class="text-xl font-bold text-gray-900 mb-3">{feature.title}</h3>
          <p class="text-gray-500 leading-relaxed text-sm font-medium">{feature.desc}</p>
        </div>
      {/each}
    </div>
  </div>
</section>
