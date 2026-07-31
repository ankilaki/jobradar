import type { JobSalary } from './types.js';

const RANGE_RE =
  /\$\s*([\d,]+(?:\.\d+)?)\s*([KkMm])?\s*[-–—]\s*\$?\s*([\d,]+(?:\.\d+)?)\s*([KkMm])?/;

/** Parse a free-text compensation string into structured salary when possible. */
export function parseSalaryRaw(raw: string | null | undefined): JobSalary | null {
  if (!raw?.trim()) return null;
  const text = raw.trim();
  const m = text.match(RANGE_RE);
  if (!m) {
    return { raw: text, currency: 'USD' };
  }
  const min = scaleNumber(m[1]!, m[2]);
  const max = scaleNumber(m[3]!, m[4] ?? m[2]);
  return {
    raw: text,
    currency: 'USD',
    interval: 'year',
    min,
    max,
  };
}

function scaleNumber(num: string, suffix?: string): number {
  const n = Number(num.replace(/,/g, ''));
  if (!suffix) return n;
  const s = suffix.toUpperCase();
  if (s === 'K') return Math.round(n * 1000);
  if (s === 'M') return Math.round(n * 1_000_000);
  return n;
}

export function extractSalaryFromGreenhouse(opts: {
  metadata?: Array<{ name?: string; value?: unknown }>;
  contentHtml?: string;
}): JobSalary | null {
  const meta = opts.metadata ?? [];
  for (const entry of meta) {
    const name = entry.name ?? '';
    if (!/pay|salary|compensation/i.test(name)) continue;
    const value = entry.value;
    if (typeof value === 'string' && value.trim()) {
      return parseSalaryRaw(value);
    }
  }
  if (opts.contentHtml) {
    const plain = opts.contentHtml.replace(/<[^>]+>/g, ' ');
    const m = plain.match(RANGE_RE);
    if (m) return parseSalaryRaw(m[0]);
  }
  return null;
}
