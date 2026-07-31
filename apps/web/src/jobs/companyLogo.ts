/** Known board tokens / ids whose public site is not `{token}.com`. */
const DOMAIN_OVERRIDES: Record<string, string> = {
  ashby: 'ashbyhq.com',
  openai: 'openai.com',
  anthropic: 'anthropic.com',
  stripe: 'stripe.com',
  notion: 'notion.so',
  fig: 'figma.com',
  figma: 'figma.com',
  vercel: 'vercel.com',
  linear: 'linear.app',
  ramp: 'ramp.com',
  rippling: 'rippling.com',
  databricks: 'databricks.com',
  snowflake: 'snowflake.com',
  palantir: 'palantir.com',
  scaleai: 'scale.com',
  scale: 'scale.com',
  huggingface: 'huggingface.co',
  'hugging-face': 'huggingface.co',
};

export type CompanyLogoSource = {
  id: string;
  name?: string;
  boardToken?: string;
  careersUrl?: string | null;
  logoUrl?: string | null;
};

/** Extract registrable-ish hostname from a careers URL. */
export function domainFromUrl(url: string | undefined | null): string | undefined {
  if (!url?.trim()) return undefined;
  try {
    const withProto = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const host = new URL(withProto).hostname.toLowerCase();
    return host.replace(/^www\./, '') || undefined;
  } catch {
    return undefined;
  }
}

/** Best-effort public domain for logo lookup. */
export function resolveCompanyDomain(company: CompanyLogoSource): string | undefined {
  const fromCareers = domainFromUrl(company.careersUrl);
  if (fromCareers) return fromCareers;

  const key = (company.id || company.boardToken || '').toLowerCase().trim();
  if (key && DOMAIN_OVERRIDES[key]) return DOMAIN_OVERRIDES[key];

  const token = (company.boardToken || company.id || '').toLowerCase().trim();
  if (!token || !/^[a-z0-9][a-z0-9-]*$/i.test(token)) return undefined;
  return `${token}.com`;
}

/**
 * Logo image candidates (brand logo CDN first, favicon fallback).
 * Prefer an explicit company.logoUrl when set.
 */
export function companyLogoCandidates(company: CompanyLogoSource): string[] {
  if (company.logoUrl?.trim()) return [company.logoUrl.trim()];
  const domain = resolveCompanyDomain(company);
  if (!domain) return [];
  return [
    `https://logos.hunter.io/${encodeURIComponent(domain)}`,
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`,
  ];
}
