import {
  filterCityOptions,
  filterCountryOptions,
  filterStateOptions,
  matchesFilter,
  normalizeStoredLocation,
} from '@jobradar/shared';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { companyLogoCandidates } from './companyLogo';
import { JobFilters, type FeedFilters } from './JobFilters';
import { JobRow } from './JobRow';
import { relevanceScore } from './relevance';
import { useCompaniesMap } from './useCompaniesMap';
import { useJobStatus } from './useJobStatus';
import { useJobsQuery } from './useJobsQuery';
import type { Job } from './types';
import { toMillis } from './types';

const PAGE_SIZE = 24;

const ALL_STATES = filterStateOptions();
const ALL_COUNTRIES = filterCountryOptions();

export function JobFeedPage() {
  const { jobs, loading, error } = useJobsQuery();
  const { logoUrlsByCompanyId, byId: companiesById } = useCompaniesMap();
  const { user } = useAuth();
  const { statusMap, toggleApplied } = useJobStatus(user?.uid);
  const [filters, setFilters] = useState<FeedFilters>({
    sort: 'newest',
    hideApplied: true,
  });
  const [page, setPage] = useState(1);

  /** Re-parse locations from raw so legacy bad city/state/country values are corrected. */
  const normalizedJobs = useMemo(
    () => jobs.map((job) => withNormalizedLocation(job)),
    [jobs],
  );

  const cities = useMemo(
    () =>
      filterCityOptions(
        normalizedJobs.flatMap((j) => j.location.allCities ?? []),
      ),
    [normalizedJobs],
  );
  const states = ALL_STATES;
  const countries = ALL_COUNTRIES;

  const visible = useMemo(() => {
    let list = normalizedJobs.filter((j) =>
      matchesFilter(j, {
        keyword: filters.keyword,
        city: filters.city,
        state: filters.state,
        country: filters.country,
        remoteOnly: filters.remoteOnly,
        companyIds: filters.companyIds,
      }),
    );
    if (filters.hideApplied) {
      list = list.filter((j) => statusMap.get(j.id) !== 'applied');
    }
    if (filters.sort === 'relevant' && filters.keyword?.trim()) {
      const k = filters.keyword.trim();
      list = [...list].sort(
        (a, b) => relevanceScore(b, k) - relevanceScore(a, k),
      );
    } else {
      list = [...list].sort(
        (a, b) => toMillis(b.firstSeenAt) - toMillis(a.firstSeenAt),
      );
    }
    return list;
  }, [normalizedJobs, filters, statusMap]);

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageJobs = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return visible.slice(start, start + PAGE_SIZE);
  }, [visible, safePage]);

  useEffect(() => {
    setPage(1);
  }, [
    filters.keyword,
    filters.city,
    filters.state,
    filters.country,
    filters.remoteOnly,
    filters.hideApplied,
    filters.sort,
    filters.companyIds,
  ]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function logosFor(job: Job): string[] {
    const fromMap = logoUrlsByCompanyId.get(job.companyId);
    if (fromMap?.length) return fromMap;
    const company = companiesById.get(job.companyId);
    return companyLogoCandidates(
      company ?? {
        id: job.companyId,
        name: job.companyName,
        boardToken: job.companyId,
      },
    );
  }

  function onFiltersChange(next: FeedFilters) {
    setFilters(next);
  }

  return (
    <div>
      <h1 className="mb-4 font-brand text-2xl font-bold tracking-[-0.02em]">
        Signal log
      </h1>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <aside className="w-full shrink-0 lg:sticky lg:top-4 lg:w-56 xl:w-64">
          <JobFilters
            value={filters}
            onChange={onFiltersChange}
            cities={cities}
            states={states}
            countries={countries}
          />
        </aside>

        <div className="min-w-0 flex-1">
          {loading ? (
            <p className="font-mono text-sm text-ink-muted">Listening for jobs…</p>
          ) : null}
          {error ? (
            <p className="font-mono text-sm text-fault">{error}</p>
          ) : null}
          {!loading && !error && visible.length === 0 ? (
            <p className="border border-rule-faint bg-paper-2 px-4 py-8 font-mono text-sm text-ink-muted">
              No active signals match these layers.
            </p>
          ) : null}

          {!loading && visible.length > 0 ? (
            <p className="mb-3 font-mono text-[11px] text-ink-muted">
              {visible.length} signal{visible.length === 1 ? '' : 's'}
              {totalPages > 1
                ? ` · page ${safePage} of ${totalPages}`
                : null}
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {pageJobs.map((job) => (
              <JobRow
                key={job.id}
                job={job}
                variant="card"
                logoCandidates={logosFor(job)}
                applied={statusMap.get(job.id) === 'applied'}
                onToggleApplied={() => void toggleApplied(job.id)}
              />
            ))}
          </div>

          {totalPages > 1 ? (
            <nav
              className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-rule-faint pt-4"
              aria-label="Pagination"
            >
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="font-mono text-xs text-ink-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-40 disabled:no-underline"
              >
                ← Previous
              </button>
              <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-ink-muted">
                {pageNumbers(safePage, totalPages).map((n, i) =>
                  n === '…' ? (
                    <span key={`e-${i}`}>…</span>
                  ) : (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPage(n)}
                      className={
                        n === safePage
                          ? 'border-b border-signal text-ink'
                          : 'hover:text-ink'
                      }
                      aria-current={n === safePage ? 'page' : undefined}
                    >
                      {n}
                    </button>
                  ),
                )}
              </div>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="font-mono text-xs text-ink-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-40 disabled:no-underline"
              >
                Next →
              </button>
            </nav>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function withNormalizedLocation(job: Job): Job {
  const parsed = normalizeStoredLocation(job.location);
  return {
    ...job,
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
    secondaryLocations: parsed.secondaryLocations ?? job.secondaryLocations,
  };
}

/** Compact page list: 1 … 4 5 6 … 20 */
function pageNumbers(
  current: number,
  total: number,
): Array<number | '…'> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages = new Set<number>([1, total, current]);
  for (let d = 1; d <= 1; d++) {
    if (current - d >= 1) pages.add(current - d);
    if (current + d <= total) pages.add(current + d);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const out: Array<number | '…'> = [];
  let prev = 0;
  for (const n of sorted) {
    if (prev && n - prev > 1) out.push('…');
    out.push(n);
    prev = n;
  }
  return out;
}
