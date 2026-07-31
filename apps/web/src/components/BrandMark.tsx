type BrandMarkProps = {
  size?: 'hero' | 'nav';
  className?: string;
};

/** JobRadar wordmark with sector-arc mark (Signal Log §9.7). */
export function BrandMark({ size = 'nav', className = '' }: BrandMarkProps) {
  const isHero = size === 'hero';
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-brand font-bold tracking-[-0.02em] text-ink ${
        isHero ? 'text-5xl sm:text-6xl' : 'text-[1.25rem]'
      } ${className}`}
    >
      <span>JobRadar</span>
      <SectorArc className={isHero ? 'h-8 w-8' : 'h-4 w-4'} />
    </span>
  );
}

function SectorArc({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="1.25" opacity="0.35" />
      <path
        d="M16 16 L16 3 A13 13 0 0 1 29 16 Z"
        fill="var(--signal)"
        opacity="0.9"
      />
      <circle cx="16" cy="16" r="2" fill="var(--ink)" />
    </svg>
  );
}
