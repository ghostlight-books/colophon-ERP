export function HomeLineIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

export function BookshelfIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* Outer Cabinet Frame */}
      <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="1.8" />
      {/* Top Shelf Line */}
      <line x1="3" y1="12" x2="21" y2="12" strokeWidth="1.8" />
      {/* Books on Top Shelf */}
      <path d="M6 12V6h2v6M10 12V5h2.5v7M14 12V7h2v5" strokeWidth="1.6" />
      {/* Books on Bottom Shelf */}
      <path d="M6 21v-6h2.5v6M10.5 21v-7h2.5v7M15 21v-6h3v6" strokeWidth="1.6" />
    </svg>
  );
}
