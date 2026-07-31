export type WorkplaceType = 'Remote' | 'Hybrid' | 'InOffice' | 'Unknown';

export interface Job {
  id: string;
  companyId: string;
  companyName: string;
  ats: 'ashby' | 'greenhouse' | 'lever' | 'linkedin';
  externalId: string;
  title: string;
  descriptionHtml: string;
  descriptionPlain: string;
  department?: string | null;
  team?: string | null;
  employmentType?: string | null;
  location: {
    raw: string;
    city?: string;
    state?: string;
    country?: string;
    isRemote: boolean;
    workplaceType?: WorkplaceType;
    allCities?: string[];
    allStates?: string[];
    allCountries?: string[];
  };
  secondaryLocations?: string[];
  salary: {
    min?: number;
    max?: number;
    currency?: string;
    interval?: 'year' | 'hour';
    raw?: string;
  } | null;
  applyUrl: string;
  jobPageUrl: string;
  postedAt: { toMillis: () => number } | Date | string;
  firstSeenAt: { toMillis: () => number } | Date | string;
  lastSeenAt?: { toMillis: () => number } | Date | string;
  isActive: boolean;
  closedAt?: unknown;
}

export function toMillis(
  value: { toMillis: () => number } | Date | string | undefined,
): number {
  if (!value) return 0;
  if (typeof value === 'string') return new Date(value).getTime();
  if (value instanceof Date) return value.getTime();
  if (typeof value.toMillis === 'function') return value.toMillis();
  return 0;
}
