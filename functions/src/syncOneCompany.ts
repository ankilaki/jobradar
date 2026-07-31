import {
  FieldValue,
  type DocumentReference,
  type Firestore,
  type UpdateData,
  type DocumentData,
  type SetOptions,
  type WriteBatch,
} from 'firebase-admin/firestore';
import { getDb } from './firebaseAdmin.js';
import { fetchAshbyBoard, normalizeAshbyJobs } from './sources/ashby.js';
import {
  fetchGreenhouseBoard,
  normalizeGreenhouseJobs,
} from './sources/greenhouse.js';
import { fetchLeverBoard, normalizeLeverJobs } from './sources/lever.js';
import {
  fetchLinkedInCompanyJobs,
  normalizeLinkedInJobs,
} from './sources/linkedin.js';
import { planSyncPrecise } from './syncPlan.js';
import type { CompanyRecord, NormalizedJob } from './types.js';

export interface SyncOneResult {
  companyId: string;
  ok: boolean;
  error?: string;
  newJobs: NormalizedJob[];
  upserted: number;
  closed: number;
}

const MAX_BATCH_OPS = 450;

async function fetchNormalizedJobs(
  company: CompanyRecord,
  deps?: {
    fetchAshby?: typeof fetchAshbyBoard;
    fetchGreenhouse?: typeof fetchGreenhouseBoard;
    fetchLever?: typeof fetchLeverBoard;
    fetchLinkedIn?: typeof fetchLinkedInCompanyJobs;
  },
): Promise<NormalizedJob[]> {
  const fetchAshby = deps?.fetchAshby ?? fetchAshbyBoard;
  const fetchGreenhouse = deps?.fetchGreenhouse ?? fetchGreenhouseBoard;
  const fetchLever = deps?.fetchLever ?? fetchLeverBoard;
  const fetchLinkedIn = deps?.fetchLinkedIn ?? fetchLinkedInCompanyJobs;

  switch (company.ats) {
    case 'ashby':
      return normalizeAshbyJobs(
        company,
        await fetchAshby(company.boardToken),
      );
    case 'greenhouse':
      return normalizeGreenhouseJobs(
        company,
        await fetchGreenhouse(company.boardToken),
      );
    case 'lever':
      return normalizeLeverJobs(
        company,
        await fetchLever(company.boardToken),
      );
    case 'linkedin':
      return normalizeLinkedInJobs(
        company,
        await fetchLinkedIn(company.boardToken),
      );
    default: {
      const _exhaustive: never = company.ats;
      throw new Error(`Unknown ats: ${_exhaustive}`);
    }
  }
}

export async function syncOneCompany(
  company: CompanyRecord,
  deps?: {
    fetchAshby?: typeof fetchAshbyBoard;
    fetchGreenhouse?: typeof fetchGreenhouseBoard;
    fetchLever?: typeof fetchLeverBoard;
    fetchLinkedIn?: typeof fetchLinkedInCompanyJobs;
    db?: Firestore;
  },
): Promise<SyncOneResult> {
  const db = deps?.db ?? getDb();

  try {
    const fetchedJobs = await fetchNormalizedJobs(company, deps);

    const existingSnap = await db
      .collection('jobs')
      .where('companyId', '==', company.id)
      .get();

    const existingIds = new Set(existingSnap.docs.map((d) => d.id));
    const previouslyActiveIds = new Set(
      existingSnap.docs
        .filter((d) => d.data().isActive === true)
        .map((d) => d.id),
    );

    const plan = planSyncPrecise({
      existingIds,
      previouslyActiveIds,
      fetchedJobs,
    });

    const writer = new BatchWriter(db);

    for (const action of plan.upserts) {
      const ref = db.collection('jobs').doc(action.job.id);
      const base = serializeJob(action.job);
      if (action.type === 'create') {
        writer.set(ref, {
          ...base,
          firstSeenAt: FieldValue.serverTimestamp(),
          lastSeenAt: FieldValue.serverTimestamp(),
          isActive: true,
          closedAt: null,
        });
      } else {
        writer.set(
          ref,
          {
            ...base,
            lastSeenAt: FieldValue.serverTimestamp(),
            isActive: true,
            closedAt: null,
          },
          { merge: true },
        );
      }
    }

    for (const id of plan.toClose) {
      writer.update(db.collection('jobs').doc(id), {
        isActive: false,
        closedAt: FieldValue.serverTimestamp(),
      });
    }

    writer.set(
      db.collection('companies').doc(company.id),
      {
        lastSyncedAt: FieldValue.serverTimestamp(),
        lastSyncStatus: 'ok',
        lastSyncError: FieldValue.delete(),
      },
      { merge: true },
    );

    await writer.commit();

    return {
      companyId: company.id,
      ok: true,
      newJobs: plan.newJobs,
      upserted: plan.upserts.length,
      closed: plan.toClose.length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await db.collection('companies').doc(company.id).set(
        {
          lastSyncedAt: FieldValue.serverTimestamp(),
          lastSyncStatus: 'error',
          lastSyncError: message.slice(0, 500),
        },
        { merge: true },
      );
    } catch {
      // ignore secondary failure
    }
    return {
      companyId: company.id,
      ok: false,
      error: message,
      newJobs: [],
      upserted: 0,
      closed: 0,
    };
  }
}

class BatchWriter {
  private batch: WriteBatch;
  private ops = 0;
  private readonly pending: WriteBatch[] = [];

  constructor(private readonly db: Firestore) {
    this.batch = db.batch();
  }

  set(
    ref: DocumentReference,
    data: DocumentData,
    options?: SetOptions,
  ): void {
    if (options) this.batch.set(ref, data, options);
    else this.batch.set(ref, data);
    this.bump();
  }

  update(ref: DocumentReference, data: UpdateData<DocumentData>): void {
    this.batch.update(ref, data);
    this.bump();
  }

  private bump(): void {
    this.ops += 1;
    if (this.ops >= MAX_BATCH_OPS) {
      this.pending.push(this.batch);
      this.batch = this.db.batch();
      this.ops = 0;
    }
  }

  async commit(): Promise<void> {
    for (const b of this.pending) await b.commit();
    if (this.ops > 0) await this.batch.commit();
  }
}

function serializeJob(job: NormalizedJob): Record<string, unknown> {
  return {
    id: job.id,
    companyId: job.companyId,
    companyName: job.companyName,
    ats: job.ats,
    externalId: job.externalId,
    title: job.title,
    descriptionHtml: job.descriptionHtml,
    descriptionPlain: job.descriptionPlain,
    department: job.department ?? null,
    team: job.team ?? null,
    employmentType: job.employmentType ?? null,
    location: scrubUndefined(job.location as unknown as Record<string, unknown>),
    secondaryLocations: job.secondaryLocations ?? [],
    salary: job.salary
      ? scrubUndefined(job.salary as unknown as Record<string, unknown>)
      : null,
    applyUrl: job.applyUrl,
    jobPageUrl: job.jobPageUrl,
    postedAt: job.postedAt,
  };
}

function scrubUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = v === undefined ? null : v;
  }
  return out;
}
