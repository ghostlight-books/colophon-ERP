export default function BrandLogo({ className }: { className?: string }): JSX.Element {
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
        <linearGradient id="brandBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1e1b4b" />
          <stop offset="50%" stopColor="#312e81" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
        <linearGradient id="brandBookGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="50%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#4f46e5" />
        </linearGradient>
        <linearGradient id="brandAccentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#818cf8" />
        </linearGradient>
        <linearGradient id="brandGlowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e0e7ff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#c7d2fe" stopOpacity="0.3" />
        </linearGradient>
        <filter id="brandShadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#000000" floodOpacity="0.4" />
        </filter>
      </defs>

      {/* Rounded Tile Container */}
      <rect width="512" height="512" rx="115" fill="url(#brandBgGrad)" />
      <rect width="504" height="504" x="4" y="4" rx="111" fill="none" stroke="#818cf8" strokeOpacity="0.4" strokeWidth="6" />

      {/* Library Emblem */}
      <g filter="url(#brandShadow)">
        {/* Foundation Base */}
        <rect x="96" y="380" width="320" height="24" rx="8" fill="#a5b4fc" />
        <rect x="76" y="404" width="360" height="20" rx="6" fill="#818cf8" />

        {/* Pillars / Columns */}
        <rect x="120" y="190" width="36" height="190" rx="6" fill="url(#brandBookGrad)" />
        <rect x="190" y="190" width="36" height="190" rx="6" fill="url(#brandBookGrad)" />
        <rect x="286" y="190" width="36" height="190" rx="6" fill="url(#brandBookGrad)" />
        <rect x="356" y="190" width="36" height="190" rx="6" fill="url(#brandBookGrad)" />

        {/* Glowing Open Book Center */}
        <path
          d="M 256 160 Q 200 130 140 145 L 140 330 Q 200 315 256 345 Q 312 315 372 330 L 372 145 Q 312 130 256 160 Z"
          fill="url(#brandGlowGrad)"
          stroke="#ffffff"
          strokeWidth="5"
        />
        <line x1="256" y1="160" x2="256" y2="345" stroke="#4f46e5" strokeWidth="6" strokeLinecap="round" />

        {/* Pediment Roof */}
        <polygon points="256,76 80,166 432,166" fill="#e0e7ff" />
        <polygon points="256,92 104,166 408,166" fill="url(#brandAccentGrad)" opacity="0.45" />

        {/* Optical Scanner Laser Emblem */}
        <circle cx="256" cy="130" r="18" fill="#4f46e5" stroke="#ffffff" strokeWidth="3.5" />
        <circle cx="256" cy="130" r="8" fill="#38bdf8" />
      </g>
    </svg>
  );
}

