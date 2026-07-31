import { useState } from 'react';

type CompanyMarkProps = {
  name: string;
  candidates?: string[];
  size?: number;
  className?: string;
};

/**
 * Tries brand logo CDN URLs in order; falls back to monogram initials.
 */
export function CompanyMark({
  name,
  candidates = [],
  size = 36,
  className = '',
}: CompanyMarkProps) {
  const [index, setIndex] = useState(0);
  const src = index < candidates.length ? candidates[index] : undefined;

  if (!src) {
    return <Monogram name={name} size={size} className={className} />;
  }

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setIndex((i) => i + 1)}
      className={`shrink-0 bg-paper object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

function Monogram({
  name,
  size,
  className,
}: {
  name: string;
  size: number;
  className: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');

  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center border border-rule-faint bg-paper font-mono font-semibold text-ink-muted ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.32) }}
      title={name}
    >
      {initials || '?'}
    </span>
  );
}
