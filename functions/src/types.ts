import type { Ats } from '@jobradar/shared';

export type { Ats };
export type WorkplaceType = 'Remote' | 'Hybrid' | 'InOffice' | 'Unknown';

export interface JobLocation {
  raw: string;
  city?: string;
  state?: string;
  country?: string;
  isRemote: boolean;
  workplaceType?: WorkplaceType;
  /** All cities/states/countries extracted from multi-location raw strings */
  allCities?: string[];
  allStates?: string[];
  allCountries?: string[];
}

export interface JobSalary {
  min?: number;
  max?: number;
  currency?: string;
  interval?: 'year' | 'hour';
  raw?: string;
}

/** Normalized job ready to write to Firestore (timestamps as Date | string for tests). */
export interface NormalizedJob {
  id: string;
  companyId: string;
  companyName: string;
  ats: Ats;
  externalId: string;
  title: string;
  descriptionHtml: string;
  descriptionPlain: string;
  department?: string;
  team?: string;
  employmentType?: string;
  location: JobLocation;
  secondaryLocations?: string[];
  salary: JobSalary | null;
  applyUrl: string;
  jobPageUrl: string;
  postedAt: Date;
}

export interface CompanyRecord {
  id: string;
  name: string;
  ats: Ats;
  boardToken: string;
  careersUrl?: string;
  active: boolean;
  lastSyncedAt?: Date | null;
  lastSyncStatus?: 'ok' | 'error' | null;
  lastSyncError?: string | null;
  /**
   * IDs of jobs currently considered open for this company.
   * Used so hourly sync can create/close without re-reading every job doc.
   * `undefined` means the field has never been written (bootstrap on next sync).
   */
  activeJobIds?: string[];
}

export function jobDocId(ats: Ats, companyId: string, externalId: string): string {
  return `${ats}_${companyId}_${externalId}`;
}
