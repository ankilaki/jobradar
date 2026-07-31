import { decodeHtmlEntities, htmlToPlain } from '../html.js';
import { fetchWithRetry } from '../http.js';
import { parseLocation } from '../location.js';
import { parseSalaryRaw } from '../salary.js';
import { jobDocId, type CompanyRecord, type NormalizedJob } from '../types.js';

export interface AshbyJobRaw {
  id: string;
  title: string;
  location?: string;
  secondaryLocations?: Array<{ location?: string }>;
  department?: string;
  team?: string;
  isListed?: boolean;
  isRemote?: boolean;
  workplaceType?: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
  publishedAt?: string;
  employmentType?: string;
  jobUrl?: string;
  applyUrl?: string;
  compensation?: {
    compensationTierSummary?: string;
    scrapeableCompensationSalarySummary?: string;
  };
  address?: {
    postalAddress?: {
      addressLocality?: string;
      addressRegion?: string;
      addressCountry?: string;
    };
  };
}

export interface AshbyBoardResponse {
  apiVersion?: string;
  jobs?: AshbyJobRaw[];
}

export async function fetchAshbyBoard(boardToken: string): Promise<AshbyJobRaw[]> {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(boardToken)}?includeCompensation=true`;
  const res = await fetchWithRetry(url);
  if (!res.ok) {
    throw new Error(`Ashby ${res.status} for board "${boardToken}"`);
  }
  const data = (await res.json()) as AshbyBoardResponse;
  return data.jobs ?? [];
}

export function normalizeAshbyJobs(
  company: CompanyRecord,
  rawJobs: AshbyJobRaw[],
): NormalizedJob[] {
  return rawJobs
    .filter((j) => j.isListed !== false)
    .map((j) => normalizeAshbyJob(company, j));
}

export function normalizeAshbyJob(
  company: CompanyRecord,
  raw: AshbyJobRaw,
): NormalizedJob {
  const externalId = String(raw.id);
  const html = raw.descriptionHtml ?? '';
  const plain = raw.descriptionPlain?.trim()
    ? raw.descriptionPlain
    : htmlToPlain(html);

  const primaryLoc =
    raw.location?.trim() ||
    [raw.address?.postalAddress?.addressLocality, raw.address?.postalAddress?.addressRegion]
      .filter(Boolean)
      .join(', ') ||
    '';
  const ashbySecondaries = (raw.secondaryLocations ?? [])
    .map((s) => s.location?.trim())
    .filter((x): x is string => Boolean(x));
  const locRaw =
    [primaryLoc, ...ashbySecondaries].filter(Boolean).join(' | ') || 'Unknown';

  const parsed = parseLocation(locRaw, {
    isRemote: raw.isRemote,
    workplaceType: raw.workplaceType,
  });

  // Prefer structured address country when parser didn't get one
  if (!parsed.country && raw.address?.postalAddress?.addressCountry) {
    const c = raw.address.postalAddress.addressCountry;
    parsed.country = /united states/i.test(c) ? 'USA' : c;
    if (parsed.country && !parsed.allCountries.includes(parsed.country)) {
      parsed.allCountries = [...parsed.allCountries, parsed.country];
    }
  }

  const salaryRaw =
    raw.compensation?.scrapeableCompensationSalarySummary ||
    raw.compensation?.compensationTierSummary ||
    null;

  return {
    id: jobDocId('ashby', company.id, externalId),
    companyId: company.id,
    companyName: company.name,
    ats: 'ashby',
    externalId,
    title: raw.title,
    descriptionHtml: html,
    descriptionPlain: plain,
    department: raw.department,
    team: raw.team,
    employmentType: raw.employmentType,
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
    salary: parseSalaryRaw(salaryRaw),
    applyUrl: raw.applyUrl || raw.jobUrl || '',
    jobPageUrl: raw.jobUrl || raw.applyUrl || '',
    postedAt: raw.publishedAt ? new Date(raw.publishedAt) : new Date(),
  };
}

/** Used by admin "test connection" — decode sample titles without full sync. */
export function summarizeAshbyBoard(rawJobs: AshbyJobRaw[]): {
  jobCount: number;
  sampleTitles: string[];
} {
  const listed = rawJobs.filter((j) => j.isListed !== false);
  return {
    jobCount: listed.length,
    sampleTitles: listed.slice(0, 5).map((j) => j.title),
  };
}

export { decodeHtmlEntities };
