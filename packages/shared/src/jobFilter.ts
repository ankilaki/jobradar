/** Shared types and pure helpers used by both web and Cloud Functions. */

import {
  canonicalizeCity,
  canonicalizeCountry,
  canonicalizeState,
  homeStateForCity,
} from './location.js';

export type Ats = 'ashby' | 'greenhouse' | 'lever' | 'linkedin';

export interface JobFilter {
  /** Single keyword (legacy / feed). Prefer `keywords` for multi-term alerts. */
  keyword?: string;
  /** OR-matched keywords (any term may match title or description). */
  keywords?: string[];
  /** Single exclude term (legacy). Prefer `excludeKeywords` for multi-term alerts. */
  excludeKeyword?: string;
  /** OR-matched exclude terms — job is rejected if any hit title or description. */
  excludeKeywords?: string[];
  city?: string;
  state?: string;
  country?: string;
  remoteOnly?: boolean;
  companyIds?: string[];
}

/** Minimal job shape for filter matching (feed + notifications). */
export interface FilterableJob {
  title: string;
  descriptionPlain: string;
  companyId: string;
  location: {
    city?: string;
    state?: string;
    country?: string;
    isRemote: boolean;
    /** Prefer these when present (multi-location postings). */
    allCities?: string[];
    allStates?: string[];
    allCountries?: string[];
  };
}

/** Split a free-text keyword field into unique trimmed terms. */
export function parseKeywordList(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\n,]+/)) {
    const t = part.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function resolveKeywordList(
  multi: string[] | undefined,
  single: string | undefined,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(t);
  };
  for (const k of multi ?? []) push(k);
  if (single) push(single);
  return out;
}

/** Resolve keyword + keywords into a deduped list (order preserved). */
export function resolveFilterKeywords(filter: JobFilter): string[] {
  return resolveKeywordList(filter.keywords, filter.keyword);
}

/** Resolve excludeKeyword + excludeKeywords into a deduped list (order preserved). */
export function resolveFilterExcludeKeywords(filter: JobFilter): string[] {
  return resolveKeywordList(filter.excludeKeywords, filter.excludeKeyword);
}

function textMatchesAnyKeyword(
  title: string,
  desc: string,
  terms: string[],
): boolean {
  return terms.some((k) => {
    const lk = k.toLowerCase();
    return title.includes(lk) || desc.includes(lk);
  });
}

/**
 * Strip undefined / empty fields so the result is safe to write to Firestore.
 * Multi-keyword filters store `keywords` / `excludeKeywords` only (not a
 * redundant singular field).
 */
export function sanitizeJobFilter(filter: JobFilter): JobFilter {
  const out: JobFilter = {};
  const keywords = resolveFilterKeywords(filter);
  if (keywords.length === 1) {
    out.keyword = keywords[0];
  } else if (keywords.length > 1) {
    out.keywords = keywords;
  }

  const excludeKeywords = resolveFilterExcludeKeywords(filter);
  if (excludeKeywords.length === 1) {
    out.excludeKeyword = excludeKeywords[0];
  } else if (excludeKeywords.length > 1) {
    out.excludeKeywords = excludeKeywords;
  }

  if (filter.city?.trim()) out.city = filter.city.trim();
  if (filter.state?.trim()) out.state = filter.state.trim();
  if (filter.country?.trim()) out.country = filter.country.trim();
  if (filter.remoteOnly === true) out.remoteOnly = true;
  if (filter.companyIds && filter.companyIds.length > 0) {
    out.companyIds = [...filter.companyIds];
  }
  return out;
}

/**
 * Shared predicate for feed filtering and Discord notification matching.
 * Empty / undefined filter fields mean "no constraint".
 * Keywords are OR-matched (any term may hit title or description).
 * Exclude keywords are OR-matched — any hit rejects the job.
 * City/state/country match if primary OR any all* entry matches (case-insensitive).
 * Cities are compared via canonicalizeCity so NYC / New York City / new-york match.
 * States are compared via canonicalizeState so "New York" / "NY" match.
 */
export function matchesFilter(job: FilterableJob, filter: JobFilter): boolean {
  const title = job.title.toLowerCase();
  const desc = job.descriptionPlain.toLowerCase();

  const keywords = resolveFilterKeywords(filter);
  if (keywords.length > 0 && !textMatchesAnyKeyword(title, desc, keywords)) {
    return false;
  }

  const excludeKeywords = resolveFilterExcludeKeywords(filter);
  if (
    excludeKeywords.length > 0 &&
    textMatchesAnyKeyword(title, desc, excludeKeywords)
  ) {
    return false;
  }

  if (filter.remoteOnly && !job.location.isRemote) return false;

  if (filter.city) {
    const want =
      canonicalizeCity(filter.city)?.toLowerCase() ??
      filter.city.toLowerCase().trim();
    const cities = collect(job.location.allCities, job.location.city).map(
      (c) => canonicalizeCity(c)?.toLowerCase() ?? c,
    );
    if (!cities.includes(want)) return false;
  }

  if (filter.state) {
    const want =
      canonicalizeState(filter.state)?.toLowerCase() ??
      filter.state.toLowerCase().trim();
    const states = collect(job.location.allStates, job.location.state).map(
      (s) => canonicalizeState(s)?.toLowerCase() ?? s,
    );
    const cities = collect(job.location.allCities, job.location.city);
    const impliedByCity = cities.some(
      (c) => homeStateForCity(c)?.toLowerCase() === want,
    );
    if (!states.includes(want) && !impliedByCity) return false;
  }

  if (filter.country) {
    const want =
      canonicalizeCountry(filter.country)?.toLowerCase() ??
      filter.country.toLowerCase().trim();
    const countries = collect(
      job.location.allCountries,
      job.location.country,
    ).map((c) => canonicalizeCountry(c)?.toLowerCase() ?? c);
    if (!countries.includes(want)) return false;
  }

  if (filter.companyIds && filter.companyIds.length > 0) {
    if (!filter.companyIds.includes(job.companyId)) return false;
  }

  return true;
}

function collect(
  list: string[] | undefined,
  primary: string | undefined,
): string[] {
  const out = new Set<string>();
  if (primary) out.add(primary.toLowerCase());
  for (const v of list ?? []) out.add(v.toLowerCase());
  return [...out];
}
