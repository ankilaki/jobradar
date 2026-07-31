import type { CompanyRecord } from './types.js';
import { sortByOldestSyncFirst } from './syncSchedule.js';

/** Successful LinkedIn syncs at most once per day. */
export const LINKEDIN_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** Non-rate-limit errors: retry after 1 hour (next scheduled tick). */
export const LINKEDIN_ERROR_BACKOFF_MS = 60 * 60 * 1000;
/** Rate-limit / 429 / 999: cool down 6 hours. */
export const LINKEDIN_RATE_LIMIT_BACKOFF_MS = 6 * 60 * 60 * 1000;
/** Hourly scheduler ticks in a day — used to spread LinkedIn load. */
export const LINKEDIN_HOURLY_TICKS_PER_DAY = 24;

export type CompanyWithSyncMeta = CompanyRecord & {
  lastSyncedAt?: Date | null;
  lastSyncStatus?: 'ok' | 'error' | null;
  lastSyncError?: string | null;
};

export function isLinkedInRateLimitError(message: string | null | undefined): boolean {
  const m = (message ?? '').toLowerCase();
  return (
    m.includes('rate limited') ||
    m.includes('(429)') ||
    m.includes('(999)') ||
    m.includes('status 429') ||
    m.includes('status 999')
  );
}

/**
 * How many LinkedIn companies to touch this hour so the full set spreads
 * across the day (~once each per 24h). Serial sync + backoff handle rate limits.
 */
export function linkedInQuotaForHourlyRun(totalLinkedInCount: number): number {
  if (totalLinkedInCount <= 0) return 0;
  return Math.max(
    1,
    Math.ceil(totalLinkedInCount / LINKEDIN_HOURLY_TICKS_PER_DAY),
  );
}

/** Whether this LinkedIn company should be synced in the current tick. */
export function isLinkedInDue(
  company: CompanyWithSyncMeta,
  now: Date = new Date(),
): boolean {
  if (!company.lastSyncedAt) return true;
  const ageMs = now.getTime() - company.lastSyncedAt.getTime();
  if (Number.isNaN(ageMs) || ageMs < 0) return true;

  if (company.lastSyncStatus === 'error') {
    const backoff = isLinkedInRateLimitError(company.lastSyncError)
      ? LINKEDIN_RATE_LIMIT_BACKOFF_MS
      : LINKEDIN_ERROR_BACKOFF_MS;
    return ageMs >= backoff;
  }

  return ageMs >= LINKEDIN_SYNC_INTERVAL_MS;
}

/**
 * Pick LinkedIn companies due for sync, oldest/never-synced first.
 * Quota defaults to a day-spread slice of the full LinkedIn roster.
 */
export function selectLinkedInCompaniesForRun(
  companies: CompanyWithSyncMeta[],
  options?: { now?: Date; maxPerRun?: number },
): CompanyWithSyncMeta[] {
  const now = options?.now ?? new Date();
  const linkedIn = companies.filter((c) => c.ats === 'linkedin');
  const maxPerRun =
    options?.maxPerRun ?? linkedInQuotaForHourlyRun(linkedIn.length);

  return sortByOldestSyncFirst(
    linkedIn.filter((c) => isLinkedInDue(c, now)),
  ).slice(0, Math.max(0, maxPerRun));
}
