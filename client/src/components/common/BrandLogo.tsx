export type BrandLogoVariant = "library" | "bookstore";

const PALETTES: Record<BrandLogoVariant, {
  bg: [string, string, string];
  book: [string, string, string];
  accent: [string, string];
  glow: [string, string];
  ring: string;
  base: string;
  baseShadow: string;
  centerLine: string;
  roof: string;
  scanner: string;
  scannerCore: string;
}> = {
  library: {
    bg: ["#1e1b4b", "#312e81", "#0f172a"],
    book: ["#6366f1", "#818cf8", "#4f46e5"],
    accent: ["#38bdf8", "#818cf8"],
    glow: ["#e0e7ff", "#c7d2fe"],
    ring: "#818cf8",
    base: "#a5b4fc",
    baseShadow: "#818cf8",
    centerLine: "#4f46e5",
    roof: "#e0e7ff",
    scanner: "#4f46e5",
    scannerCore: "#38bdf8",
  },
  bookstore: {
    bg: ["#451a03", "#92400e", "#1c0a00"],
    book: ["#f59e0b", "#fbbf24", "#d97706"],
    accent: ["#fb923c", "#fbbf24"],
    glow: ["#fef3c7", "#fde68a"],
    ring: "#fbbf24",
    base: "#fcd34d",
    baseShadow: "#fbbf24",
    centerLine: "#d97706",
    roof: "#fef3c7",
    scanner: "#d97706",
    scannerCore: "#fb923c",
  },
};

export default function BrandLogo({ className, variant = "library" }: { className?: string; variant?: BrandLogoVariant }): JSX.Element {
  const palette = PALETTES[variant];
  const uid = variant;

  return (
    <svg
      viewBox="0 0 512 512"
      className={className || "h-8 w-8 shrink-0"}
      fill="none"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={`brandBgGrad-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={palette.bg[0]} />
          <stop offset="50%" stopColor={palette.bg[1]} />
          <stop offset="100%" stopColor={palette.bg[2]} />
        </linearGradient>
        <linearGradient id={`brandBookGrad-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={palette.book[0]} />
          <stop offset="50%" stopColor={palette.book[1]} />
          <stop offset="100%" stopColor={palette.book[2]} />
        </linearGradient>
        <linearGradient id={`brandAccentGrad-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={palette.accent[0]} />
          <stop offset="100%" stopColor={palette.accent[1]} />
        </linearGradient>
        <linearGradient id={`brandGlowGrad-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={palette.glow[0]} stopOpacity="0.9" />
          <stop offset="100%" stopColor={palette.glow[1]} stopOpacity="0.3" />
        </linearGradient>
        <filter id={`brandShadow-${uid}`} x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#000000" floodOpacity="0.4" />
        </filter>
      </defs>

      {/* Rounded Tile Container */}
      <rect width="512" height="512" rx="115" fill={`url(#brandBgGrad-${uid})`} />
      <rect width="504" height="504" x="4" y="4" rx="111" fill="none" stroke={palette.ring} strokeOpacity="0.4" strokeWidth="6" />

      {/* Library Emblem */}
      <g filter={`url(#brandShadow-${uid})`}>
        {/* Foundation Base */}
        <rect x="96" y="380" width="320" height="24" rx="8" fill={palette.base} />
        <rect x="76" y="404" width="360" height="20" rx="6" fill={palette.baseShadow} />

        {/* Pillars / Columns */}
        <rect x="120" y="190" width="36" height="190" rx="6" fill={`url(#brandBookGrad-${uid})`} />
        <rect x="190" y="190" width="36" height="190" rx="6" fill={`url(#brandBookGrad-${uid})`} />
        <rect x="286" y="190" width="36" height="190" rx="6" fill={`url(#brandBookGrad-${uid})`} />
        <rect x="356" y="190" width="36" height="190" rx="6" fill={`url(#brandBookGrad-${uid})`} />

        {/* Glowing Open Book Center */}
        <path
          d="M 256 160 Q 200 130 140 145 L 140 330 Q 200 315 256 345 Q 312 315 372 330 L 372 145 Q 312 130 256 160 Z"
          fill={`url(#brandGlowGrad-${uid})`}
          stroke="#ffffff"
          strokeWidth="5"
        />
        <line x1="256" y1="160" x2="256" y2="345" stroke={palette.centerLine} strokeWidth="6" strokeLinecap="round" />

        {/* Pediment Roof */}
        <polygon points="256,76 80,166 432,166" fill={palette.roof} />
        <polygon points="256,92 104,166 408,166" fill={`url(#brandAccentGrad-${uid})`} opacity="0.45" />

        {/* Optical Scanner Laser Emblem */}
        <circle cx="256" cy="130" r="18" fill={palette.scanner} stroke="#ffffff" strokeWidth="3.5" />
        <circle cx="256" cy="130" r="8" fill={palette.scannerCore} />
      </g>
    </svg>
  );
}

