export default function BrandLogo({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      viewBox="0 0 120 90"
      className={className}
      fill="none"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <path
        d="M6 74V14C20 8 33 8 50 12C57 14 63 22 60 31C57 22 51 15 43 12C31 8 20 9 6 14"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M114 74V14C100 8 87 8 70 12C63 14 57 22 60 31C63 22 69 15 77 12C89 8 100 9 114 14"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 74C22 70 38 70 60 77C82 70 98 70 114 74"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M60 31V77"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="60" cy="22" r="5" fill="#f4cf38" />
    </svg>
  );
}

