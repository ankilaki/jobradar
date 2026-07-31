import { decodeHtmlEntities, htmlToPlain } from '../html.js';
import { fetchWithRetry } from '../http.js';
import { parseLocation } from '../location.js';
import { extractSalaryFromGreenhouse } from '../salary.js';
import { jobDocId, type CompanyRecord, type NormalizedJob } from '../types.js';

export interface GreenhouseJobRaw {
  id: number | string;
  title: string;
  updated_at?: string;
  absolute_url?: string;
  location?: { name?: string };
  content?: string;
  departments?: Array<{ name?: string }>;
  offices?: Array<{ name?: string }>;
  metadata?: Array<{ name?: string; value?: unknown }>;
}

export interface GreenhouseBoardResponse {
  jobs?: GreenhouseJobRaw[];
}

export async function fetchGreenhouseBoard(
  boardToken: string,
): Promise<GreenhouseJobRaw[]> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs?content=true`;
  const res = await fetchWithRetry(url);
  if (!res.ok) {
    throw new Error(`Greenhouse ${res.status} for board "${boardToken}"`);
  }
  const data = (await res.json()) as GreenhouseBoardResponse;
  return data.jobs ?? [];
}

export function normalizeGreenhouseJobs(
  company: CompanyRecord,
  rawJobs: GreenhouseJobRaw[],
): NormalizedJob[] {
  return rawJobs.map((j) => normalizeGreenhouseJob(company, j));
}

export function normalizeGreenhouseJob(
  company: CompanyRecord,
  raw: GreenhouseJobRaw,
): NormalizedJob {
  const externalId = String(raw.id);
  const encoded = raw.content ?? '';
  const descriptionHtml = decodeHtmlEntities(encoded);
  const descriptionPlain = htmlToPlain(descriptionHtml);
  const locRaw = raw.location?.name?.trim() || 'Unknown';
  const parsed = parseLocation(locRaw);
  const pageUrl = raw.absolute_url || '';

  return {
    id: jobDocId('greenhouse', company.id, externalId),
    companyId: company.id,
    companyName: company.name,
    ats: 'greenhouse',
    externalId,
    title: raw.title,
    descriptionHtml,
    descriptionPlain,
    department: raw.departments?.[0]?.name,
    employmentType: undefined,
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
    secondaryLocations:
      parsed.secondaryLocations ??
      (raw.offices ?? [])
        .map((o) => o.name)
        .filter((n): n is string => Boolean(n) && n !== locRaw),
    salary: extractSalaryFromGreenhouse({
      metadata: raw.metadata,
      contentHtml: descriptionHtml,
    }),
    applyUrl: pageUrl,
    jobPageUrl: pageUrl,
    postedAt: raw.updated_at ? new Date(raw.updated_at) : new Date(),
  };
}

export function summarizeGreenhouseBoard(rawJobs: GreenhouseJobRaw[]): {
  jobCount: number;
  sampleTitles: string[];
} {
  return {
    jobCount: rawJobs.length,
    sampleTitles: rawJobs.slice(0, 5).map((j) => j.title),
  };
}
