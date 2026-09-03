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

/**
 * Hourly sync only needs to know which job IDs appeared or disappeared.
 * Unchanged IDs are left untouched — no Firestore read or write per job.
 */
export function diffActiveJobIds(opts: {
  activeJobIds: Iterable<string>;
  fetchedIds: Iterable<string>;
}): { toOpen: string[]; toClose: string[] } {
  const active = new Set(opts.activeJobIds);
  const fetched: string[] = [];
  const fetchedSet = new Set<string>();
  for (const id of opts.fetchedIds) {
    if (fetchedSet.has(id)) continue;
    fetchedSet.add(id);
    fetched.push(id);
  }
  const toOpen = fetched.filter((id) => !active.has(id));
  const toClose = [...active].filter((id) => !fetchedSet.has(id));
  return { toOpen, toClose };
}
