import {
  FieldValue,
  type DocumentReference,
  type DocumentSnapshot,
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
import { diffActiveJobIds } from './syncPlan.js';
import type { CompanyRecord, NormalizedJob } from './types.js';

export interface SyncOneResult {
  companyId: string;
  ok: boolean;
  error?: string;
  newJobs: NormalizedJob[];
  upserted: number;
  closed: number;
  skipped: number;
}

const MAX_BATCH_OPS = 450;
const GET_ALL_CHUNK = 100;
/** Public ATS: don't rewrite lastSyncedAt every hour if the board didn't change. */
const COMPANY_HEARTBEAT_MS = 20 * 60 * 60 * 1000;

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
    const fetchedById = new Map(fetchedJobs.map((j) => [j.id, j]));
    const fetchedIds = fetchedJobs.map((j) => j.id);

    const trackedIds = Array.isArray(company.activeJobIds)
      ? company.activeJobIds
      : await loadActiveJobIds(db, company.id);

    const { toOpen, toClose } = diffActiveJobIds({
      activeJobIds: trackedIds,
      fetchedIds,
    });

    const existingOpenSnaps = await getJobSnaps(db, toOpen);
    const writer = new BatchWriter(db);
    const newJobs: NormalizedJob[] = [];
    let upserted = 0;

    for (const id of toOpen) {
      const job = fetchedById.get(id);
      if (!job) continue;
      const ref = db.collection('jobs').doc(id);
      const existing = existingOpenSnaps.get(id);
      const base = serializeJob(job);

      if (!existing?.exists) {
        writer.set(ref, {
          ...base,
          firstSeenAt: FieldValue.serverTimestamp(),
          lastSeenAt: FieldValue.serverTimestamp(),
          isActive: true,
          closedAt: null,
        });
        newJobs.push(job);
        upserted += 1;
        continue;
      }

      const wasActive = existing.data()?.isActive === true;
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
      upserted += 1;
      if (!wasActive) newJobs.push(job);
    }

    for (const id of toClose) {
      writer.set(
        db.collection('jobs').doc(id),
        {
          isActive: false,
          closedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }

    if (shouldWriteCompanyDoc(company, toOpen.length, toClose.length)) {
      writer.set(
        db.collection('companies').doc(company.id),
        {
          activeJobIds: fetchedIds,
          lastSyncedAt: FieldValue.serverTimestamp(),
          lastSyncStatus: 'ok',
          lastSyncError: FieldValue.delete(),
        },
        { merge: true },
      );
    }

    await writer.commit();

    return {
      companyId: company.id,
      ok: true,
      newJobs,
      upserted,
      closed: toClose.length,
      skipped: Math.max(0, fetchedJobs.length - toOpen.length),
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
      skipped: 0,
    };
  }
}

/** True when the company doc needs a write (IDs / status / LinkedIn due-time). */
export function shouldWriteCompanyDoc(
  company: CompanyRecord,
  opened: number,
  closed: number,
): boolean {
  if (opened > 0 || closed > 0) return true;
  if (!Array.isArray(company.activeJobIds)) return true;
  if (company.lastSyncStatus !== 'ok') return true;
  if (company.ats === 'linkedin') return true;
  if (!company.lastSyncedAt) return true;
  const ageMs = Date.now() - company.lastSyncedAt.getTime();
  return Number.isNaN(ageMs) || ageMs >= COMPANY_HEARTBEAT_MS;
}

async function loadActiveJobIds(
  db: Firestore,
  companyId: string,
): Promise<string[]> {
  const snap = await db
    .collection('jobs')
    .where('companyId', '==', companyId)
    .get();
  return snap.docs.filter((d) => d.data().isActive === true).map((d) => d.id);
}

async function getJobSnaps(
  db: Firestore,
  ids: string[],
): Promise<Map<string, DocumentSnapshot>> {
  const out = new Map<string, DocumentSnapshot>();
  if (ids.length === 0) return out;

  for (let i = 0; i < ids.length; i += GET_ALL_CHUNK) {
    const chunk = ids.slice(i, i + GET_ALL_CHUNK);
    const refs = chunk.map((id) => db.collection('jobs').doc(id));
    const snaps = await db.getAll(...refs);
    for (const snap of snaps) out.set(snap.id, snap);
  }
  return out;
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
