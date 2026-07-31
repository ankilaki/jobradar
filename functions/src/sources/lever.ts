import { htmlToPlain } from '../html.js';
import { fetchWithRetry } from '../http.js';
import { parseLocation } from '../location.js';
import { parseSalaryRaw } from '../salary.js';
import { jobDocId, type CompanyRecord, type NormalizedJob } from '../types.js';

export interface LeverJobRaw {
  id: string;
  text: string;
  categories?: {
    location?: string;
    team?: string;
    department?: string;
    commitment?: string;
    allLocations?: string[];
  };
  createdAt?: number;
  description?: string;
  descriptionPlain?: string;
  descriptionBody?: string;
  descriptionBodyPlain?: string;
  hostedUrl?: string;
  applyUrl?: string;
  country?: string;
  workplaceType?: string;
  salaryRange?: {
    min?: number;
    max?: number;
    currency?: string;
    interval?: string;
  } | null;
  salaryDescriptionPlain?: string;
}

export async function fetchLeverBoard(
  boardToken: string,
): Promise<LeverJobRaw[]> {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(boardToken)}?mode=json`;
  const res = await fetchWithRetry(url);
  if (!res.ok) {
    throw new Error(`Lever ${res.status} for board "${boardToken}"`);
  }
  const data = (await res.json()) as LeverJobRaw[];
  if (!Array.isArray(data)) {
    throw new Error(`Lever unexpected response for board "${boardToken}"`);
  }
  return data;
}

export function normalizeLeverJobs(
  company: CompanyRecord,
  rawJobs: LeverJobRaw[],
): NormalizedJob[] {
  return rawJobs.map((j) => normalizeLeverJob(company, j));
}

export function normalizeLeverJob(
  company: CompanyRecord,
  raw: LeverJobRaw,
): NormalizedJob {
  const externalId = String(raw.id);
  const html =
    raw.descriptionBody || raw.description || raw.descriptionPlain || '';
  const plain =
    raw.descriptionBodyPlain?.trim() ||
    raw.descriptionPlain?.trim() ||
    htmlToPlain(html);

  const locs = [
    raw.categories?.location,
    ...(raw.categories?.allLocations ?? []),
  ]
    .filter((x): x is string => Boolean(x?.trim()))
    .filter((v, i, a) => a.indexOf(v) === i);
  const locRaw = locs.join(' | ') || 'Unknown';
  const parsed = parseLocation(locRaw, {
    workplaceType: raw.workplaceType,
  });

  if (!parsed.country && raw.country) {
    const c = /^(US|USA)$/i.test(raw.country)
      ? 'USA'
      : raw.country.length === 2
        ? raw.country.toUpperCase()
        : raw.country;
    parsed.country = c;
    if (!parsed.allCountries.includes(c)) {
      parsed.allCountries = [...parsed.allCountries, c];
    }
  }

  let salary = null;
  if (raw.salaryRange?.min != null || raw.salaryRange?.max != null) {
    salary = {
      min: raw.salaryRange.min,
      max: raw.salaryRange.max,
      currency: raw.salaryRange.currency ?? 'USD',
      interval:
        raw.salaryRange.interval === 'per-hour-salary' ? 'hour' as const : 'year' as const,
      raw: raw.salaryDescriptionPlain,
    };
  } else if (raw.salaryDescriptionPlain) {
    salary = parseSalaryRaw(raw.salaryDescriptionPlain);
  }

  const pageUrl = raw.hostedUrl || raw.applyUrl || '';
  const applyUrl = raw.applyUrl || raw.hostedUrl || '';

  return {
    id: jobDocId('lever', company.id, externalId),
    companyId: company.id,
    companyName: company.name,
    ats: 'lever',
    externalId,
    title: raw.text,
    descriptionHtml: html,
    descriptionPlain: plain,
    department: raw.categories?.team || raw.categories?.department,
    employmentType: raw.categories?.commitment,
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
    secondaryLocations: parsed.secondaryLocations,
    salary,
    applyUrl,
    jobPageUrl: pageUrl,
    postedAt: raw.createdAt ? new Date(raw.createdAt) : new Date(),
  };
}

export function summarizeLeverBoard(rawJobs: LeverJobRaw[]): {
  jobCount: number;
  sampleTitles: string[];
} {
  return {
    jobCount: rawJobs.length,
    sampleTitles: rawJobs.slice(0, 5).map((j) => j.text),
  };
}
