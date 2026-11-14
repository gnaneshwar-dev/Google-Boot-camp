export function PingyHeroIcon({ className = 'w-12 h-12' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Coffee-cup antenna */}
      <path d="M32 16 C35 12, 34 10, 32 8" stroke="#00dfc1" strokeWidth="2.2" strokeLinecap="round" />
      <rect x="25" y="2" width="13" height="9" rx="2" fill="#dfe2f1" />
      <path d="M38 4 C42 4, 42 9, 38 9" stroke="#dfe2f1" strokeWidth="1.8" />
      <rect x="27" y="3.5" width="9" height="2" fill="#7e5800" />
      {/* Server cube body */}
      <rect x="14" y="16" width="36" height="32" rx="6" fill="#182138" stroke="#00F5D4" strokeWidth="2.5" />
      {/* Visor shades */}
      <rect x="18" y="22" width="28" height="12" rx="3" fill="#070b14" stroke="#00F5D4" strokeWidth="1.6" />
      <rect x="23" y="26" width="5" height="4" rx="1" fill="#00F5D4" />
      <rect x="36" y="26" width="5" height="4" rx="1" fill="#00F5D4" />
      {/* Vent lines */}
      <rect x="21" y="39" width="22" height="2.5" rx="1" fill="#2b3654" />
      <rect x="21" y="43" width="14" height="2.5" rx="1" fill="#2b3654" />
      {/* Neon sneakers */}
      <rect x="17" y="49" width="11" height="8" rx="3" fill="#FF2A85" />
      <rect x="17" y="55" width="11" height="2" fill="#00F5D4" />
      <rect x="36" y="49" width="11" height="8" rx="3" fill="#FF2A85" />
      <rect x="36" y="55" width="11" height="2" fill="#00F5D4" />
    </svg>
  );
}
