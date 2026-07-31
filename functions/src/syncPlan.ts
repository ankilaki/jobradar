import type { NormalizedJob } from './types.js';

export type UpsertAction =
  | { type: 'create'; job: NormalizedJob }
  | { type: 'update'; job: NormalizedJob; preserveFirstSeenAt: true };

export interface SyncPlan {
  upserts: UpsertAction[];
  toClose: string[];
  newJobs: NormalizedJob[];
}

/**
 * Precise sync planner:
 * - not in existingIds → create (counts as newJobs)
 * - in existingIds → update (preserve firstSeenAt at write time)
 * - previously active but missing from fetch → close
 */
export function planSyncPrecise(opts: {
  existingIds: Set<string>;
  previouslyActiveIds: Set<string>;
  fetchedJobs: NormalizedJob[];
}): SyncPlan {
  const upserts: UpsertAction[] = [];
  const newJobs: NormalizedJob[] = [];
  const seenIds = new Set<string>();

  for (const job of opts.fetchedJobs) {
    seenIds.add(job.id);
    if (opts.existingIds.has(job.id)) {
      upserts.push({ type: 'update', job, preserveFirstSeenAt: true });
    } else {
      upserts.push({ type: 'create', job });
      newJobs.push(job);
    }
  }

  const toClose = [...opts.previouslyActiveIds].filter((id) => !seenIds.has(id));
  return { upserts, toClose, newJobs };
}
