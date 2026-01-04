interface FileIconProps {
  filename: string;
  isDirectory?: boolean;
  className?: string;
}

const extensionIcons: Record<string, { icon: string; color: string }> = {
  // JavaScript/TypeScript
  js: { icon: "JS", color: "text-yellow-400" },
  jsx: { icon: "JSX", color: "text-yellow-400" },
  ts: { icon: "TS", color: "text-blue-400" },
  tsx: { icon: "TSX", color: "text-blue-400" },
  mjs: { icon: "MJS", color: "text-yellow-400" },
  cjs: { icon: "CJS", color: "text-yellow-400" },

  // Web
  html: { icon: "HTML", color: "text-orange-400" },
  css: { icon: "CSS", color: "text-blue-400" },
  scss: { icon: "SCSS", color: "text-pink-400" },
  less: { icon: "LESS", color: "text-blue-300" },
  svg: { icon: "SVG", color: "text-yellow-500" },

  // Data
  json: { icon: "JSON", color: "text-yellow-300" },
  yaml: { icon: "YAML", color: "text-red-400" },
  yml: { icon: "YML", color: "text-red-400" },
  xml: { icon: "XML", color: "text-orange-300" },
  csv: { icon: "CSV", color: "text-green-400" },
  toml: { icon: "TOML", color: "text-gray-400" },

  // Documents
  md: { icon: "MD", color: "text-blue-300" },
  mdx: { icon: "MDX", color: "text-yellow-400" },
  txt: { icon: "TXT", color: "text-gray-400" },
  pdf: { icon: "PDF", color: "text-red-500" },

  // Languages
  py: { icon: "PY", color: "text-yellow-400" },
  rb: { icon: "RB", color: "text-red-500" },
  go: { icon: "GO", color: "text-cyan-400" },
  rs: { icon: "RS", color: "text-orange-500" },
  java: { icon: "JAVA", color: "text-red-400" },
  kt: { icon: "KT", color: "text-purple-400" },
  swift: { icon: "SWIFT", color: "text-orange-400" },
  c: { icon: "C", color: "text-blue-500" },
  cpp: { icon: "C++", color: "text-blue-400" },
  h: { icon: "H", color: "text-purple-400" },
  php: { icon: "PHP", color: "text-indigo-400" },

  // Shell
  sh: { icon: "SH", color: "text-green-400" },
  bash: { icon: "BASH", color: "text-green-400" },
  zsh: { icon: "ZSH", color: "text-green-400" },
  fish: { icon: "FISH", color: "text-green-400" },

  // Config
  env: { icon: "ENV", color: "text-yellow-500" },
  gitignore: { icon: "GIT", color: "text-orange-400" },
  dockerignore: { icon: "DOCK", color: "text-blue-400" },
  dockerfile: { icon: "DOCK", color: "text-blue-400" },

  // Images
  png: { icon: "PNG", color: "text-purple-400" },
  jpg: { icon: "JPG", color: "text-purple-400" },
  jpeg: { icon: "JPEG", color: "text-purple-400" },
  gif: { icon: "GIF", color: "text-purple-400" },
  webp: { icon: "WEBP", color: "text-purple-400" },
  ico: { icon: "ICO", color: "text-purple-400" },

  // Lock files
  lock: { icon: "LOCK", color: "text-zinc-500" },
};

export function FileIcon({
  filename,
  isDirectory = false,
  className = "",
}: FileIconProps) {
  if (isDirectory) {
    return (
      <span className={`text-yellow-400 ${className}`} title="Directory">
        <svg
          className="h-4 w-4"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
        </svg>
      </span>
    );
  }

  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const iconInfo = extensionIcons[ext] || { icon: "FILE", color: "text-zinc-400" };

  return (
    <span
      className={`font-mono text-[10px] font-bold ${iconInfo.color} ${className}`}
      title={filename}
    >
      {iconInfo.icon}
    </span>
  );
}
