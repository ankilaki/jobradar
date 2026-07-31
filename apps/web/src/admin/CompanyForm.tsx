import { useState, type FormEvent } from 'react';
import { httpsCallable } from 'firebase/functions';
import type { Ats } from '@jobradar/shared';
import { getFirebase } from '../lib/firebase';

type CompanyFormProps = {
  onSaved?: () => void;
};

type Mode = 'single' | 'bulk';

export function CompanyForm({ onSaved }: CompanyFormProps) {
  const [mode, setMode] = useState<Mode>('bulk');
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [ats, setAts] = useState<Ats>('greenhouse');
  const [boardToken, setBoardToken] = useState('');
  const [careersUrl, setCareersUrl] = useState('');
  const [bulkTokens, setBulkTokens] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testedOk, setTestedOk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function testConnection() {
    setError(null);
    setTestResult(null);
    setTestedOk(false);
    const { functions } = getFirebase();
    const fn = httpsCallable(functions, 'adminTestCompanyBoard');
    try {
      const res = await fn({ ats, boardToken });
      const data = res.data as
        | { ok: true; jobCount: number; sampleTitles: string[] }
        | { ok: false; error: string };
      if (data.ok === false) {
        setError(data.error);
        return;
      }
      setTestedOk(true);
      setTestResult(
        `Found ${data.jobCount} open roles, e.g. ${data.sampleTitles
          .slice(0, 3)
          .map((t) => `'${t}'`)
          .join(', ')}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test failed');
    }
  }

  async function onSubmitSingle(e: FormEvent) {
    e.preventDefault();
    if (!testedOk) {
      setError('Test the connection before saving');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { functions } = getFirebase();
      const fn = httpsCallable(functions, 'adminUpsertCompany');
      await fn({
        id: id.trim(),
        name: name.trim(),
        ats,
        boardToken: boardToken.trim(),
        careersUrl: careersUrl.trim() || undefined,
        active: true,
      });
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function onSubmitBulk(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setTestResult(null);
    try {
      const { functions } = getFirebase();
      const fn = httpsCallable(functions, 'adminBulkUpsertCompanies', {
        timeout: 540_000,
      });
      const res = await fn({
        ats: 'auto',
        tokens: bulkTokens,
      });
      const data = res.data as {
        ok: true;
        added: string[];
        addedDetailed?: Array<{ id: string; ats: string }>;
        failed: Array<{ token: string; error: string }>;
      };

      const lines: string[] = [];
      if (data.addedDetailed?.length) {
        lines.push(`Added ${data.addedDetailed.length}:`);
        for (const a of data.addedDetailed) {
          lines.push(`  ✓ ${a.id} (${a.ats})`);
        }
      } else if (data.added.length) {
        lines.push(`Added ${data.added.length}: ${data.added.join(', ')}`);
      }
      if (data.failed.length) {
        if (lines.length) lines.push('');
        lines.push(`Skipped ${data.failed.length}:`);
        for (const f of data.failed) {
          lines.push(`  ✗ ${f.token} — ${f.error}`);
        }
      }
      setTestResult(lines.join('\n') || 'Nothing to add');

      // Keep only failed tokens in the box so you can fix/retry them
      if (data.failed.length) {
        setBulkTokens(data.failed.map((f) => f.token).join(', '));
      } else if (data.added.length) {
        setBulkTokens('');
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk add failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 border border-rule-faint bg-paper-2 p-4">
      <div className="flex gap-4 border-b border-rule-faint pb-3 font-mono text-xs">
        <button
          type="button"
          onClick={() => {
            setMode('bulk');
            setError(null);
            setTestResult(null);
          }}
          className={
            mode === 'bulk'
              ? 'border-b border-signal text-ink'
              : 'text-ink-muted'
          }
        >
          Bulk add
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('single');
            setError(null);
            setTestResult(null);
          }}
          className={
            mode === 'single'
              ? 'border-b border-signal text-ink'
              : 'text-ink-muted'
          }
        >
          Single company
        </button>
      </div>

      {mode === 'bulk' ? (
        <form onSubmit={(e) => void onSubmitBulk(e)} className="space-y-3">
          <label className="block">
            <span className="font-mono text-[10px] uppercase text-ink-muted">
              Board tokens (comma-separated)
            </span>
            <textarea
              value={bulkTokens}
              required
              rows={4}
              placeholder="stripe, activecampaign, li:openai"
              onChange={(e) => setBulkTokens(e.target.value)}
              className="mt-1 w-full resize-y border-0 border-b border-rule bg-transparent px-0 py-2 font-mono text-sm outline-none focus:border-signal"
            />
            <span className="mt-1 block font-mono text-[10px] text-ink-muted">
              Auto-detects Greenhouse, Ashby, or Lever, then falls back to
              LinkedIn. You can also force LinkedIn with li:company-slug or a
              linkedin.com/company/… URL. Large lists can take a few minutes.
            </span>
          </label>

          {error ? <p className="font-mono text-xs text-fault">{error}</p> : null}
          {testResult ? (
            <p className="font-mono text-xs text-sea whitespace-pre-wrap">
              {testResult}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy || !bulkTokens.trim()}
            className="bg-signal px-4 py-2 text-sm font-medium text-signal-ink disabled:opacity-50"
          >
            {busy ? 'Detecting & adding…' : 'Add companies'}
          </button>
        </form>
      ) : (
        <form
          onSubmit={(e) => void onSubmitSingle(e)}
          className="space-y-3"
        >
          <Field label="Id (slug)" value={id} onChange={setId} required />
          <Field label="Name" value={name} onChange={setName} required />
          <label className="block">
            <span className="font-mono text-[10px] uppercase text-ink-muted">
              ATS
            </span>
            <select
              value={ats}
              onChange={(e) => {
                setAts(e.target.value as Ats);
                setTestedOk(false);
              }}
              className="mt-1 w-full border-0 border-b border-rule bg-transparent py-2 text-sm outline-none focus:border-signal"
            >
              <option value="greenhouse">Greenhouse</option>
              <option value="ashby">Ashby</option>
              <option value="lever">Lever</option>
              <option value="linkedin">LinkedIn</option>
            </select>
          </label>
          <Field
            label={
              ats === 'linkedin'
                ? 'Company slug or LinkedIn URL'
                : 'Board token'
            }
            value={boardToken}
            onChange={(v) => {
              setBoardToken(v);
              setTestedOk(false);
            }}
            required
          />
          {ats === 'linkedin' ? (
            <p className="font-mono text-[10px] text-ink-muted">
              Example: openai, li:openai, or a linkedin.com/company/… URL.
              Numeric org ids (li:11130470) also work. Guest scrape — may fail
              if LinkedIn blocks cloud IPs.
            </p>
          ) : null}
          <Field
            label="Careers URL (optional)"
            value={careersUrl}
            onChange={setCareersUrl}
          />

          {error ? <p className="font-mono text-xs text-fault">{error}</p> : null}
          {testResult ? (
            <p className="font-mono text-xs text-sea">{testResult}</p>
          ) : null}

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={() => void testConnection()}
              className="font-mono text-xs text-ink-muted underline-offset-2 hover:underline"
            >
              Test connection
            </button>
            <button
              type="submit"
              disabled={busy || !testedOk}
              className="bg-signal px-4 py-2 text-sm font-medium text-signal-ink disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save company'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] uppercase text-ink-muted">
        {label}
      </span>
      <input
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border-0 border-b border-rule bg-transparent px-0 py-2 text-sm outline-none focus:border-signal"
      />
    </label>
  );
}
