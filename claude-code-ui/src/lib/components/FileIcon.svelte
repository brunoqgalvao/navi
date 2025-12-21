<script lang="ts">
  interface Props {
    filename: string;
    size?: "sm" | "md" | "lg";
  }

  let { filename, size = "md" }: Props = $props();

  const ext = $derived(filename.split(".").pop()?.toLowerCase() || "");

  const sizeClasses = {
    sm: "w-3 h-3",
    md: "w-4 h-4",
    lg: "w-5 h-5",
  };

  const iconSize = $derived(sizeClasses[size]);

  type IconConfig = { color: string; icon: "code" | "image" | "doc" | "data" | "config" | "pdf" | "audio" | "video" | "archive" | "font" | "default" };
  
  const fileTypes: Record<string, IconConfig> = {
    ts: { color: "text-blue-600", icon: "code" },
    tsx: { color: "text-blue-600", icon: "code" },
    js: { color: "text-yellow-500", icon: "code" },
    jsx: { color: "text-yellow-500", icon: "code" },
    mjs: { color: "text-yellow-500", icon: "code" },
    cjs: { color: "text-yellow-500", icon: "code" },
    svelte: { color: "text-orange-500", icon: "code" },
    vue: { color: "text-green-500", icon: "code" },
    py: { color: "text-blue-400", icon: "code" },
    rs: { color: "text-orange-600", icon: "code" },
    go: { color: "text-cyan-500", icon: "code" },
    java: { color: "text-red-500", icon: "code" },
    kt: { color: "text-purple-500", icon: "code" },
    swift: { color: "text-orange-500", icon: "code" },
    c: { color: "text-blue-600", icon: "code" },
    cpp: { color: "text-blue-700", icon: "code" },
    h: { color: "text-purple-600", icon: "code" },
    hpp: { color: "text-purple-700", icon: "code" },
    cs: { color: "text-green-600", icon: "code" },
    rb: { color: "text-red-600", icon: "code" },
    php: { color: "text-indigo-500", icon: "code" },
    sh: { color: "text-green-500", icon: "code" },
    bash: { color: "text-green-500", icon: "code" },
    zsh: { color: "text-green-500", icon: "code" },
    sql: { color: "text-orange-400", icon: "code" },
    graphql: { color: "text-pink-500", icon: "code" },
    prisma: { color: "text-teal-500", icon: "code" },
    
    json: { color: "text-yellow-600", icon: "data" },
    yaml: { color: "text-red-400", icon: "data" },
    yml: { color: "text-red-400", icon: "data" },
    toml: { color: "text-gray-600", icon: "data" },
    xml: { color: "text-orange-500", icon: "data" },
    csv: { color: "text-green-600", icon: "data" },
    
    md: { color: "text-gray-600", icon: "doc" },
    mdx: { color: "text-yellow-600", icon: "doc" },
    txt: { color: "text-gray-500", icon: "doc" },
    rtf: { color: "text-blue-500", icon: "doc" },
    doc: { color: "text-blue-600", icon: "doc" },
    docx: { color: "text-blue-600", icon: "doc" },
    
    css: { color: "text-blue-500", icon: "code" },
    scss: { color: "text-pink-500", icon: "code" },
    sass: { color: "text-pink-400", icon: "code" },
    less: { color: "text-indigo-500", icon: "code" },
    html: { color: "text-orange-500", icon: "code" },
    htm: { color: "text-orange-500", icon: "code" },
    
    png: { color: "text-purple-500", icon: "image" },
    jpg: { color: "text-green-500", icon: "image" },
    jpeg: { color: "text-green-500", icon: "image" },
    gif: { color: "text-pink-500", icon: "image" },
    webp: { color: "text-blue-500", icon: "image" },
    svg: { color: "text-orange-500", icon: "image" },
    ico: { color: "text-yellow-500", icon: "image" },
    bmp: { color: "text-cyan-500", icon: "image" },
    
    pdf: { color: "text-red-500", icon: "pdf" },
    
    mp3: { color: "text-pink-500", icon: "audio" },
    wav: { color: "text-blue-500", icon: "audio" },
    ogg: { color: "text-orange-500", icon: "audio" },
    flac: { color: "text-yellow-500", icon: "audio" },
    aac: { color: "text-purple-500", icon: "audio" },
    
    mp4: { color: "text-red-500", icon: "video" },
    webm: { color: "text-blue-500", icon: "video" },
    mov: { color: "text-purple-500", icon: "video" },
    avi: { color: "text-orange-500", icon: "video" },
    mkv: { color: "text-green-500", icon: "video" },
    
    zip: { color: "text-yellow-600", icon: "archive" },
    tar: { color: "text-orange-600", icon: "archive" },
    gz: { color: "text-red-500", icon: "archive" },
    rar: { color: "text-purple-500", icon: "archive" },
    "7z": { color: "text-green-600", icon: "archive" },
    
    ttf: { color: "text-gray-600", icon: "font" },
    otf: { color: "text-gray-600", icon: "font" },
    woff: { color: "text-gray-600", icon: "font" },
    woff2: { color: "text-gray-600", icon: "font" },
    
    gitignore: { color: "text-orange-500", icon: "config" },
    env: { color: "text-yellow-500", icon: "config" },
    eslintrc: { color: "text-purple-500", icon: "config" },
    prettierrc: { color: "text-pink-500", icon: "config" },
    editorconfig: { color: "text-gray-500", icon: "config" },
    dockerignore: { color: "text-blue-500", icon: "config" },
    
    lock: { color: "text-gray-500", icon: "config" },
    log: { color: "text-gray-400", icon: "doc" },
  };

  const config = $derived(fileTypes[ext] || { color: "text-gray-400", icon: "default" as const });
</script>

{#if config.icon === "code"}
  <svg class="{iconSize} {config.color}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path>
  </svg>
{:else if config.icon === "image"}
  <svg class="{iconSize} {config.color}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
  </svg>
{:else if config.icon === "pdf"}
  <svg class="{iconSize} {config.color}" viewBox="0 0 24 24" fill="currentColor">
    <path d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path>
    <text x="7" y="17" font-size="6" font-weight="bold" fill="white">PDF</text>
  </svg>
{:else if config.icon === "doc"}
  <svg class="{iconSize} {config.color}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
  </svg>
{:else if config.icon === "data"}
  <svg class="{iconSize} {config.color}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"></path>
  </svg>
{:else if config.icon === "audio"}
  <svg class="{iconSize} {config.color}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path>
  </svg>
{:else if config.icon === "video"}
  <svg class="{iconSize} {config.color}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
  </svg>
{:else if config.icon === "archive"}
  <svg class="{iconSize} {config.color}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"></path>
  </svg>
{:else if config.icon === "font"}
  <svg class="{iconSize} {config.color}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 6h16M4 12h16M4 18h7"></path>
  </svg>
{:else if config.icon === "config"}
  <svg class="{iconSize} {config.color}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
  </svg>
{:else}
  <svg class="{iconSize} {config.color}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
  </svg>
{/if}
