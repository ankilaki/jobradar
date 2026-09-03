import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getDb } from './firebaseAdmin.js';
import { runWithConcurrencyLimit } from './http.js';
import {
  selectLinkedInCompaniesForRun,
  type CompanyWithSyncMeta,
} from './linkedinSchedule.js';
import { notifySubscribersOfNewJobs } from './notify.js';
import {
  ASHBY_CONCURRENCY,
  GREENHOUSE_CONCURRENCY,
  LEVER_CONCURRENCY,
  LINKEDIN_CONCURRENCY,
  selectCompaniesByAts,
} from './syncSchedule.js';
import { syncOneCompany } from './syncOneCompany.js';
import type { CompanyRecord } from './types.js';

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

async function getActiveCompanies(): Promise<CompanyWithSyncMeta[]> {
  const snap = await getDb()
    .collection('companies')
    .where('active', '==', true)
    .get();

  return snap.docs.map((d) => {
    const data = d.data();
    const status = data.lastSyncStatus;
    return {
      id: d.id,
      name: String(data.name ?? d.id),
      ats: data.ats as CompanyRecord['ats'],
      boardToken: String(data.boardToken ?? ''),
      careersUrl: data.careersUrl,
      active: data.active !== false,
      lastSyncedAt: toDate(data.lastSyncedAt),
      lastSyncStatus:
        status === 'ok' || status === 'error' ? status : null,
      lastSyncError:
        typeof data.lastSyncError === 'string' ? data.lastSyncError : null,
      activeJobIds: Array.isArray(data.activeJobIds)
        ? data.activeJobIds.map((id: unknown) => String(id))
        : undefined,
    };
  });
}

async function runSyncJobBoards(): Promise<{
  companies: number;
  selected: number;
  greenhouse: number;
  ashby: number;
  lever: number;
  linkedinDue: number;
  linkedinSynced: number;
  newJobs: number;
  upserted: number;
  closed: number;
  skipped: number;
  notified: number;
  errors: string[];
}> {
  const companies = await getActiveCompanies();
  // Public ATS: every company every hourly tick (concurrency handles rate limits).
  const greenhouseCompanies = selectCompaniesByAts(companies, 'greenhouse');
  const ashbyCompanies = selectCompaniesByAts(companies, 'ashby');
  const leverCompanies = selectCompaniesByAts(companies, 'lever');
  // LinkedIn: ~once/day, spread across the 24 hourly ticks.
  const linkedinDue = selectLinkedInCompaniesForRun(companies);

  const [ghResults, ashbyResults, leverResults, linkedinResults] =
    await Promise.all([
      runWithConcurrencyLimit(
        greenhouseCompanies,
        GREENHOUSE_CONCURRENCY,
        syncOneCompany,
      ),
      runWithConcurrencyLimit(
        ashbyCompanies,
        ASHBY_CONCURRENCY,
        syncOneCompany,
      ),
      runWithConcurrencyLimit(
        leverCompanies,
        LEVER_CONCURRENCY,
        syncOneCompany,
      ),
      runWithConcurrencyLimit(
        linkedinDue,
        LINKEDIN_CONCURRENCY,
        syncOneCompany,
      ),
    ]);

  const results = [
    ...ghResults,
    ...ashbyResults,
    ...leverResults,
    ...linkedinResults,
  ];
  const newJobs = results.flatMap((r) => r.newJobs);
  const upserted = results.reduce((n, r) => n + r.upserted, 0);
  const closed = results.reduce((n, r) => n + r.closed, 0);
  const skipped = results.reduce((n, r) => n + r.skipped, 0);
  const errors = results
    .filter((r) => !r.ok)
    .map((r) => `${r.companyId}: ${r.error ?? 'unknown'}`);

  let notified = 0;
  if (newJobs.length > 0) {
    const notifyResult = await notifySubscribersOfNewJobs(newJobs);
    notified = notifyResult.sent;
  }

  return {
    companies: companies.length,
    selected: results.length,
    greenhouse: greenhouseCompanies.length,
    ashby: ashbyCompanies.length,
    lever: leverCompanies.length,
    linkedinDue: linkedinDue.length,
    linkedinSynced: linkedinResults.length,
    newJobs: newJobs.length,
    upserted,
    closed,
    skipped,
    notified,
    errors,
  };
}

export const syncJobBoards = onSchedule(
  {
    schedule: 'every 1 hours',
    timeoutSeconds: 540,
    // Full board HTML for many companies OOM'd at 512MiB.
    memory: '1GiB',
  },
  async () => {
    const summary = await runSyncJobBoards();
    console.log('syncJobBoards complete', summary);
  },
);

/** Manual trigger for testing (protect or remove before wide deploy). */
export const syncJobBoardsManual = onRequest(
  { timeoutSeconds: 540, memory: '1GiB' },
  async (_req, res) => {
    try {
      const summary = await runSyncJobBoards();
      res.status(200).json({ ok: true, ...summary });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  },
);
