import { normalizeStoredLocation } from '@jobradar/shared';
import { useMemo } from 'react';
import { useAuth } from '../auth/AuthContext';
import { companyLogoCandidates } from '../jobs/companyLogo';
import { JobRow } from '../jobs/JobRow';
import { useCompaniesMap } from '../jobs/useCompaniesMap';
import { useJobStatus } from '../jobs/useJobStatus';
import { useJobsQuery } from '../jobs/useJobsQuery';
import type { Job } from '../jobs/types';

export function AppliedJobsPage() {
  const { user } = useAuth();
  const { jobs, loading, error } = useJobsQuery();
  const { logoUrlsByCompanyId, byId: companiesById } = useCompaniesMap();
  const { statusMap, toggleApplied } = useJobStatus(user?.uid);

  const appliedJobs = useMemo(
    () =>
      jobs
        .filter((j) => statusMap.get(j.id) === 'applied')
        .map((j) => withNormalizedLocation(j)),
    [jobs, statusMap],
  );

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

  return (
    <div>
      <h1 className="mb-4 font-brand text-2xl font-bold tracking-[-0.02em]">
        Applied
      </h1>
      {loading ? (
        <p className="font-mono text-sm text-ink-muted">Loading…</p>
      ) : null}
      {error ? <p className="font-mono text-sm text-fault">{error}</p> : null}
      {!loading && appliedJobs.length === 0 ? (
        <p className="border-t border-rule-faint py-8 font-mono text-sm text-ink-muted">
          No filed applications yet.
        </p>
      ) : null}
      <div className="border-t border-rule">
        {appliedJobs.map((job) => (
          <JobRow
            key={job.id}
            job={job}
            applied
            logoCandidates={logosFor(job)}
            onToggleApplied={() => void toggleApplied(job.id)}
          />
        ))}
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
