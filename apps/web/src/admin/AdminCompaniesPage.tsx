import type { Ats } from '@jobradar/shared';
import { httpsCallable } from 'firebase/functions';
import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { getFirebase, isFirebaseConfigured } from '../lib/firebase';
import { relativeTime } from '../jobs/format';
import { CompanyForm } from './CompanyForm';

export interface CompanyRow {
  id: string;
  name: string;
  ats: Ats;
  boardToken: string;
  careersUrl?: string | null;
  active: boolean;
  lastSyncedAt?: { toMillis?: () => number; seconds?: number } | null;
  lastSyncStatus?: 'ok' | 'error' | null;
  lastSyncError?: string | null;
}

type SortMode = 'latest' | 'name';
type StatusFilter = 'all' | 'errors' | 'ok' | 'never';

function syncMillis(c: CompanyRow): number {
  const ts = c.lastSyncedAt;
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  return 0;
}

function formatSyncAbsolute(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function statusLabel(c: CompanyRow): { text: string; className: string } {
  if (!c.lastSyncStatus) {
    return { text: 'Never synced', className: 'text-ink-muted' };
  }
  if (c.lastSyncStatus === 'ok') {
    return { text: 'OK', className: 'text-sea' };
  }
  return { text: 'Error', className: 'text-fault' };
}

export function AdminCompaniesPage() {
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('latest');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    const { db } = getFirebase();
    const q = query(collection(db, 'companies'), orderBy('name'));
    return onSnapshot(
      q,
      (snap) => {
        setCompanies(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CompanyRow),
        );
        setError(null);
      },
      (err) => setError(err.message),
    );
  }, []);

  const displayed = useMemo(() => {
    let list = companies;
    if (statusFilter === 'errors') {
      list = list.filter((c) => c.lastSyncStatus === 'error');
    } else if (statusFilter === 'ok') {
      list = list.filter((c) => c.lastSyncStatus === 'ok');
    } else if (statusFilter === 'never') {
      list = list.filter((c) => !c.lastSyncStatus);
    }

    const sorted = [...list];
    if (sortMode === 'latest') {
      sorted.sort((a, b) => syncMillis(b) - syncMillis(a) || a.name.localeCompare(b.name));
    } else {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    }
    return sorted;
  }, [companies, sortMode, statusFilter]);

  const errorCount = useMemo(
    () => companies.filter((c) => c.lastSyncStatus === 'error').length,
    [companies],
  );

  async function setActive(id: string, active: boolean) {
    const { functions } = getFirebase();
    const fn = httpsCallable(functions, 'adminSetCompanyActive');
    await fn({ id, active });
  }

  async function remove(id: string) {
    if (!confirm(`Delete company "${id}" from the master list?`)) return;
    const { functions } = getFirebase();
    const fn = httpsCallable(functions, 'adminDeleteCompany');
    await fn({ id });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-brand text-2xl font-bold tracking-[-0.02em]">
          Companies
        </h1>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="bg-signal px-3 py-2 text-sm font-medium text-signal-ink"
        >
          {showForm ? 'Close form' : 'Add companies'}
        </button>
      </div>

      {showForm ? (
        <div className="mb-6">
          <CompanyForm onSaved={() => setShowForm(false)} />
        </div>
      ) : null}

      {error ? <p className="font-mono text-sm text-fault">{error}</p> : null}

      <div className="mb-3 flex flex-wrap items-center gap-3 font-mono text-[11px]">
        <label className="flex items-center gap-1.5 text-ink-muted">
          Sort
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="border-0 border-b border-rule bg-transparent py-1 text-ink outline-none focus:border-signal"
          >
            <option value="latest">Latest sync</option>
            <option value="name">Name</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-ink-muted">
          Status
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="border-0 border-b border-rule bg-transparent py-1 text-ink outline-none focus:border-signal"
          >
            <option value="all">All ({companies.length})</option>
            <option value="errors">Errors ({errorCount})</option>
            <option value="ok">OK</option>
            <option value="never">Never synced</option>
          </select>
        </label>
        {statusFilter !== 'all' || sortMode !== 'latest' ? (
          <button
            type="button"
            className="text-ink-muted hover:text-ink"
            onClick={() => {
              setSortMode('latest');
              setStatusFilter('all');
            }}
          >
            Reset
          </button>
        ) : null}
      </div>

      <div className="border-t border-rule">
        {displayed.length === 0 ? (
          <p className="py-6 font-mono text-xs text-ink-muted">
            No companies match this filter.
          </p>
        ) : null}
        {displayed.map((c) => {
          const ms = syncMillis(c);
          const status = statusLabel(c);
          return (
            <div
              key={c.id}
              className="flex flex-wrap items-start justify-between gap-3 border-b border-rule-faint py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {c.name}{' '}
                  <span className="font-mono text-xs font-normal text-ink-muted">
                    {c.ats} · {c.boardToken}
                  </span>
                </p>
                <p className="mt-1 font-mono text-[11px] text-ink-muted">
                  {c.active ? 'Active' : 'Paused'}
                  {' · '}
                  <span className={status.className}>{status.text}</span>
                  {ms > 0 ? (
                    <>
                      {' · '}
                      <span title={formatSyncAbsolute(ms)}>
                        {relativeTime(ms)}
                      </span>
                      <span className="text-ink-muted">
                        {' '}
                        ({formatSyncAbsolute(ms)})
                      </span>
                    </>
                  ) : null}
                </p>
                {c.lastSyncStatus === 'error' && c.lastSyncError ? (
                  <p className="mt-1 max-w-2xl font-mono text-[11px] text-fault">
                    {c.lastSyncError}
                  </p>
                ) : null}
              </div>
              <div className="flex gap-3 font-mono text-xs">
                <button
                  type="button"
                  className="text-ink-muted hover:text-ink"
                  onClick={() => void setActive(c.id, !c.active)}
                >
                  {c.active ? 'Pause' : 'Resume'}
                </button>
                <button
                  type="button"
                  className="text-fault"
                  onClick={() => void remove(c.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
