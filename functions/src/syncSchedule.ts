import type { Ats } from './types.js';
import type { CompanyWithSyncMeta } from './linkedinSchedule.js';

/** Conservative concurrency so board HTML + ATS rate limits stay healthy. */
export const GREENHOUSE_CONCURRENCY = 3;
export const ASHBY_CONCURRENCY = 2;
export const LEVER_CONCURRENCY = 3;
export const LINKEDIN_CONCURRENCY = 1;

/** Never-synced (null) sorts first, then oldest lastSyncedAt, then id. */
export function sortByOldestSyncFirst<
  T extends { id: string; lastSyncedAt?: Date | null },
>(companies: T[]): T[] {
  return [...companies].sort((a, b) => {
    const aMs = a.lastSyncedAt?.getTime() ?? 0;
    const bMs = b.lastSyncedAt?.getTime() ?? 0;
    if (aMs !== bMs) return aMs - bMs;
    return a.id.localeCompare(b.id);
  });
}

/** All active companies for a public ATS (synced every hourly tick). */
export function selectCompaniesByAts(
  companies: CompanyWithSyncMeta[],
  ats: Ats,
): CompanyWithSyncMeta[] {
  return sortByOldestSyncFirst(companies.filter((c) => c.ats === ats));
}
