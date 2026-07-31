import { htmlToPlain } from '../html.js';
import { parseLocation } from '../location.js';
import { jobDocId, type CompanyRecord, type NormalizedJob } from '../types.js';

/** Guest search typically hard-stops around start≈1000. */
const DEFAULT_MAX_LINKEDIN_JOBS = 1000;
const PAGE_STEP = 25;
const MAX_START = 975;
const PAGE_DELAY_MS = 550;
const TYPEAHEAD_VERIFY_LIMIT = 5;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export type LinkedInJobRaw = {
  externalId: string;
  title: string;
  location?: string;
  listedAt?: Date;
  jobUrl: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
};

export type LinkedInTypeaheadCompany = {
  id: string;
  displayName: string;
};

export type FetchLinkedInOptions = {
  /** Cap for sync/test; default pulls up to the guest API ceiling. */
  maxJobs?: number;
};

/** Parse li:slug, bare slug/id, or linkedin.com/company/slug URL → company slug or numeric id. */
export function parseLinkedInCompanyToken(raw: string): string | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const liPrefix = /^li[:/]\s*/i.exec(t);
  if (liPrefix) {
    const rest = t.slice(liPrefix[0].length).trim();
    return rest.split(/[/?#]/)[0]?.toLowerCase() || undefined;
  }
  const urlMatch = t.match(
    /linkedin\.com\/company\/([^/?#]+)/i,
  );
  if (urlMatch?.[1]) return decodeURIComponent(urlMatch[1]).toLowerCase();
  // Bare slug or numeric org id for single-form when ats=linkedin
  if (/^\d+$/.test(t)) return t;
  if (/^[a-z0-9][a-z0-9_-]*$/i.test(t) && !t.includes('.')) {
    return t.toLowerCase();
  }
  return undefined;
}

/** True when bulk token is an explicit LinkedIn company reference. */
export function isExplicitLinkedInToken(raw: string): boolean {
  const t = raw.trim();
  return /^li[:/]/i.test(t) || /linkedin\.com\/company\//i.test(t);
}

/** Extract numeric LinkedIn organization id from HTML (company page / search). */
export function extractLinkedInCompanyId(html: string): string | undefined {
  const patterns = [
    /urn:li:organization:(\d+)/,
    /"companyId"\s*:\s*(\d+)/,
    /"orgId"\s*:\s*(\d+)/,
    /company\/(\d+)\//,
    /currentCompany=%5B%22(\d+)%22%5D/,
    /f_C=(\d+)/,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1];
  }
  return undefined;
}

/** Normalize names/slugs for loose equality (openai ≈ OpenAI ≈ open-ai). */
export function normalizeLinkedInName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** True when guest search HTML includes cards for this company slug. */
export function guestHtmlMatchesCompanySlug(
  html: string,
  slug: string,
): boolean {
  const needle = slug.toLowerCase();
  const re = /linkedin\.com\/company\/([^"?#/]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[1] && decodeURIComponent(m[1]).toLowerCase() === needle) {
      return true;
    }
  }
  return false;
}

/** Parse guest typeahead COMPANY hits. */
export function parseLinkedInTypeaheadCompanies(
  body: string,
): LinkedInTypeaheadCompany[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: LinkedInTypeaheadCompany[] = [];
  for (const row of parsed) {
    if (!row || typeof row !== 'object') continue;
    const rec = row as Record<string, unknown>;
    const id = typeof rec.id === 'string' || typeof rec.id === 'number'
      ? String(rec.id)
      : '';
    const displayName =
      typeof rec.displayName === 'string' ? rec.displayName.trim() : '';
    if (/^\d+$/.test(id) && displayName) {
      out.push({ id, displayName });
    }
  }
  return out;
}

/**
 * Resolve LinkedIn numeric org id for f_C filtering.
 * Prefer guest typeahead + job-card slug verification — company pages often
 * return LinkedIn's custom 999 block from cloud / datacenter IPs.
 */
export async function resolveLinkedInCompanyId(
  slug: string,
): Promise<string> {
  if (/^\d+$/.test(slug)) return slug;

  const candidates = await fetchLinkedInTypeaheadCompanies(slug);
  const slugKey = normalizeLinkedInName(slug);

  // Prefer displayName matches first so we probe the right org sooner.
  const ordered = [...candidates].sort((a, b) => {
    const aExact = normalizeLinkedInName(a.displayName) === slugKey ? 0 : 1;
    const bExact = normalizeLinkedInName(b.displayName) === slugKey ? 0 : 1;
    return aExact - bExact;
  });

  for (const candidate of ordered.slice(0, TYPEAHEAD_VERIFY_LIMIT)) {
    const html = await fetchGuestHtml(guestSearchUrl(candidate.id, 0));
    if (guestHtmlMatchesCompanySlug(html, slug)) {
      return candidate.id;
    }
    // Empty boards can't prove the slug via cards — trust exact name match.
    const page = parseLinkedInGuestJobCards(html);
    if (
      page.length === 0 &&
      normalizeLinkedInName(candidate.displayName) === slugKey
    ) {
      return candidate.id;
    }
    await sleep(PAGE_DELAY_MS);
  }

  const nameMatch = ordered.find(
    (c) => normalizeLinkedInName(c.displayName) === slugKey,
  );
  if (nameMatch) return nameMatch.id;

  // Last resort: company jobs page (often 999; kept for rare residential success).
  try {
    const url = `https://www.linkedin.com/company/${encodeURIComponent(slug)}/jobs/`;
    const html = await fetchGuestHtml(url);
    const id = extractLinkedInCompanyId(html);
    if (id) return id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('rate limited') && !msg.includes('999')) throw err;
  }

  throw new Error(
    `LinkedIn could not resolve company id for "${slug}"`,
  );
}

function guestSearchUrl(companyId: string, start: number): string {
  return (
    `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search` +
    `?f_C=${encodeURIComponent(companyId)}&start=${start}`
  );
}

async function fetchLinkedInTypeaheadCompanies(
  query: string,
): Promise<LinkedInTypeaheadCompany[]> {
  const url =
    `https://www.linkedin.com/jobs-guest/api/typeaheadHits` +
    `?typeaheadType=COMPANY&query=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json, text/plain, */*',
      'User-Agent': USER_AGENT,
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: 'https://www.linkedin.com/jobs/search',
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 429 || res.status === 999) {
    throw new Error(`LinkedIn rate limited (${res.status})`);
  }
  if (!res.ok) {
    throw new Error(`LinkedIn typeahead ${res.status} for "${query}"`);
  }
  return parseLinkedInTypeaheadCompanies(await res.text());
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchGuestHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'User-Agent': USER_AGENT,
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: 'https://www.linkedin.com/jobs/search',
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 429 || res.status === 999) {
    throw new Error(`LinkedIn rate limited (${res.status})`);
  }
  if (!res.ok) {
    throw new Error(`LinkedIn ${res.status} for ${url}`);
  }
  return res.text();
}

function parseJobChunk(chunk: string, fallbackId?: string): LinkedInJobRaw | null {
  const idMatch =
    chunk.match(/urn:li:jobPosting:(\d+)/) ||
    chunk.match(/data-entity-urn="urn:li:jobPosting:(\d+)"/) ||
    (fallbackId ? [fallbackId, fallbackId] : null) ||
    chunk.match(/^(\d+)/) ||
    chunk.match(/currentJobId=(\d+)/);
  const titleMatch =
    chunk.match(
      /class="[^"]*base-search-card__title[^"]*"[^>]*>\s*([^<]+)/i,
    ) ||
    chunk.match(/class="[^"]*base-card__title[^"]*"[^>]*>\s*([^<]+)/i) ||
    chunk.match(/<h3[^>]*>\s*([^<]+)/i);
  const locMatch =
    chunk.match(
      /class="[^"]*job-search-card__location[^"]*"[^>]*>\s*([^<]+)/i,
    ) ||
    chunk.match(
      /class="[^"]*base-search-card__metadata[^"]*"[^>]*>\s*([^<]+)/i,
    );
  const hrefMatch =
    chunk.match(/href="(https:\/\/www\.linkedin\.com\/jobs\/view\/[^"?]+)/i) ||
    chunk.match(/href="(\/jobs\/view\/[^"?]+)/i);
  const timeMatch = chunk.match(/datetime="([^"]+)"/);

  if (!idMatch?.[1] || !titleMatch?.[1]) return null;
  const externalId = idMatch[1];
  let jobUrl = hrefMatch?.[1] ?? '';
  if (jobUrl.startsWith('/')) {
    jobUrl = `https://www.linkedin.com${jobUrl}`;
  }
  if (!jobUrl) {
    jobUrl = `https://www.linkedin.com/jobs/view/${externalId}`;
  }

  return {
    externalId,
    title: decodeBasicEntities(titleMatch[1].trim()),
    location: locMatch?.[1]
      ? decodeBasicEntities(locMatch[1].trim())
      : undefined,
    listedAt: timeMatch?.[1] ? new Date(timeMatch[1]) : undefined,
    jobUrl,
  };
}

/** Parse job cards from LinkedIn guest search HTML. */
export function parseLinkedInGuestJobCards(html: string): LinkedInJobRaw[] {
  const jobs: LinkedInJobRaw[] = [];
  const seen = new Set<string>();

  // Prefer entity-urn windows — more reliable than brittle card-div regexes.
  const entityRe = /data-entity-urn="urn:li:jobPosting:(\d+)"/gi;
  let entityMatch: RegExpExecArray | null;
  const entityIds: Array<{ id: string; index: number }> = [];
  while ((entityMatch = entityRe.exec(html)) !== null) {
    if (entityMatch[1]) {
      entityIds.push({ id: entityMatch[1], index: entityMatch.index });
    }
  }

  if (entityIds.length > 0) {
    for (let i = 0; i < entityIds.length; i++) {
      const { id, index } = entityIds[i]!;
      const end = entityIds[i + 1]?.index ?? Math.min(html.length, index + 2500);
      const chunk = html.slice(Math.max(0, index - 200), end);
      const job = parseJobChunk(chunk, id);
      if (!job || seen.has(job.externalId)) continue;
      seen.add(job.externalId);
      jobs.push(job);
    }
    return jobs;
  }

  const cardRe =
    /<div[^>]*class="[^"]*base-card[^"]*"[^>]*>[\s\S]*?<\/div>\s*(?=<div[^>]*class="[^"]*base-card|<\/li>|$)/gi;
  const cards = html.match(cardRe) ?? [];
  const chunks =
    cards.length > 0
      ? cards
      : html.split(/urn:li:jobPosting:/).slice(1);

  for (const chunk of chunks) {
    const job = parseJobChunk(chunk);
    if (!job || seen.has(job.externalId)) continue;
    seen.add(job.externalId);
    jobs.push(job);
  }

  return jobs;
}

function decodeBasicEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

export async function fetchLinkedInCompanyJobs(
  boardToken: string,
  options?: FetchLinkedInOptions,
): Promise<LinkedInJobRaw[]> {
  const slug = parseLinkedInCompanyToken(boardToken);
  if (!slug) {
    throw new Error(`Invalid LinkedIn company token "${boardToken}"`);
  }
  const maxJobs = Math.max(
    1,
    options?.maxJobs ?? DEFAULT_MAX_LINKEDIN_JOBS,
  );
  const companyId = await resolveLinkedInCompanyId(slug);
  const all: LinkedInJobRaw[] = [];
  const seen = new Set<string>();

  // Guest pages often return <25 cards; do NOT stop on short pages — only on
  // empty responses, duplicate-only pages, or the guest start ceiling.
  for (let start = 0; start <= MAX_START && all.length < maxJobs; start += PAGE_STEP) {
    const html = await fetchGuestHtml(guestSearchUrl(companyId, start));
    const page = parseLinkedInGuestJobCards(html);
    if (page.length === 0) break;

    let added = 0;
    for (const job of page) {
      if (seen.has(job.externalId)) continue;
      seen.add(job.externalId);
      all.push(job);
      added++;
      if (all.length >= maxJobs) break;
    }
    if (added === 0) break;
    if (all.length >= maxJobs) break;
    if (start + PAGE_STEP <= MAX_START) {
      await sleep(PAGE_DELAY_MS);
    }
  }

  return all;
}

export function normalizeLinkedInJobs(
  company: CompanyRecord,
  rawJobs: LinkedInJobRaw[],
): NormalizedJob[] {
  return rawJobs.map((j) => normalizeLinkedInJob(company, j));
}

export function normalizeLinkedInJob(
  company: CompanyRecord,
  raw: LinkedInJobRaw,
): NormalizedJob {
  const locRaw = raw.location?.trim() || 'Unknown';
  const parsed = parseLocation(locRaw);
  const html = raw.descriptionHtml ?? '';
  const plain =
    raw.descriptionPlain?.trim() ||
    (html ? htmlToPlain(html) : raw.title);

  return {
    id: jobDocId('linkedin', company.id, raw.externalId),
    companyId: company.id,
    companyName: company.name,
    ats: 'linkedin',
    externalId: raw.externalId,
    title: raw.title,
    descriptionHtml: html,
    descriptionPlain: plain,
    location: {
      raw: parsed.raw,
      city: parsed.city,
      state: parsed.state,
      country: parsed.country,
      isRemote: parsed.isRemote,
      workplaceType: parsed.workplaceType,
      allCities: parsed.allCities,
      allStates: parsed.allStates,
      allCountries: parsed.allCountries,
    },
    salary: null,
    applyUrl: raw.jobUrl,
    jobPageUrl: raw.jobUrl,
    postedAt: raw.listedAt ?? new Date(),
  };
}

export function summarizeLinkedInBoard(rawJobs: LinkedInJobRaw[]): {
  jobCount: number;
  sampleTitles: string[];
} {
  return {
    jobCount: rawJobs.length,
    sampleTitles: rawJobs.slice(0, 5).map((j) => j.title),
  };
}

/** Validate LinkedIn company has at least one listing (or resolvable id). */
export async function testLinkedInCompany(boardToken: string): Promise<{
  ok: true;
  jobCount: number;
  sampleTitles: string[];
  resolvedToken: string;
} | { ok: false; error: string }> {
  try {
    const slug = parseLinkedInCompanyToken(boardToken);
    if (!slug) {
      return { ok: false, error: 'Invalid LinkedIn company token' };
    }
    // Probe only — sync uses the full paginated fetch.
    const jobs = await fetchLinkedInCompanyJobs(slug, { maxJobs: 25 });
    // Allow empty board if company id resolved (company may have no open jobs)
    return {
      ok: true,
      jobCount: jobs.length,
      sampleTitles: jobs.slice(0, 5).map((j) => j.title),
      resolvedToken: slug,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
