import { useState, type FormEvent } from 'react';
import {
  parseKeywordList,
  resolveFilterExcludeKeywords,
  resolveFilterKeywords,
  type JobFilter,
} from '@jobradar/shared';
import { useAuth } from '../auth/AuthContext';
import {
  useNotificationSubscriptions,
  type NotificationSubscription,
} from './useNotificationSubscriptions';
import { maskWebhook } from './maskWebhook';

const WEBHOOK_RE =
  /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/i;

export function NotificationsPage() {
  const { user } = useAuth();
  const { subs, loading, error, save, remove, setActive } =
    useNotificationSubscriptions(user?.uid);

  return (
    <div>
      <h1 className="mb-2 font-brand text-2xl font-bold tracking-[-0.02em]">
        Discord alerts
      </h1>
      <p className="mb-6 max-w-xl text-sm text-ink-muted">
        Paste an Incoming Webhook URL from Discord (Channel → Integrations →
        Webhooks). Matching new jobs post to that channel.
      </p>

      <SubscriptionForm
        onSave={async (input) => {
          await save(input);
        }}
      />

      {loading ? (
        <p className="mt-6 font-mono text-sm text-ink-muted">Loading…</p>
      ) : null}
      {error ? <p className="mt-6 font-mono text-sm text-fault">{error}</p> : null}

      <div className="mt-8 border-t border-rule">
        {subs.length === 0 && !loading ? (
          <p className="py-6 font-mono text-sm text-ink-muted">
            No alert subscriptions yet.
          </p>
        ) : null}
        {subs.map((sub) => (
          <SubscriptionRow
            key={sub.id}
            sub={sub}
            onToggle={() => void setActive(sub.id, !sub.active)}
            onDelete={() => void remove(sub.id)}
          />
        ))}
      </div>
    </div>
  );
}

function SubscriptionForm({
  onSave,
}: {
  onSave: (input: {
    discordWebhookUrl: string;
    filter: JobFilter;
    active: boolean;
  }) => Promise<void>;
}) {
  const [webhook, setWebhook] = useState('');
  const [keywordsText, setKeywordsText] = useState('');
  const [excludeKeywordsText, setExcludeKeywordsText] = useState('');
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  async function testWebhook() {
    setTestMsg(null);
    setError(null);
    if (!WEBHOOK_RE.test(webhook.trim())) {
      setError('Webhook URL looks invalid');
      return;
    }
    try {
      const res = await fetch(webhook.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'JobRadar test — webhook connected ✅',
        }),
      });
      if (!res.ok && res.status !== 204) {
        throw new Error(`Discord returned ${res.status}`);
      }
      setTestMsg('Test message sent — check your Discord channel.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test failed');
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!WEBHOOK_RE.test(webhook.trim())) {
      setError('Webhook URL looks invalid');
      return;
    }
    setBusy(true);
    try {
      const keywords = parseKeywordList(keywordsText);
      const excludeKeywords = parseKeywordList(excludeKeywordsText);
      await onSave({
        discordWebhookUrl: webhook.trim(),
        filter: {
          keywords: keywords.length > 0 ? keywords : undefined,
          excludeKeywords:
            excludeKeywords.length > 0 ? excludeKeywords : undefined,
          remoteOnly: remoteOnly ? true : undefined,
        },
        active: true,
      });
      setWebhook('');
      setKeywordsText('');
      setExcludeKeywordsText('');
      setRemoteOnly(false);
      setTestMsg('Subscription saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      className="space-y-4 border border-rule-faint bg-paper-2 p-4"
    >
      <label className="block">
        <span className="font-mono text-[10px] uppercase text-ink-muted">
          Discord webhook URL
        </span>
        <input
          value={webhook}
          onChange={(e) => setWebhook(e.target.value)}
          required
          placeholder="https://discord.com/api/webhooks/…"
          className="mt-1 w-full border-0 border-b border-rule bg-transparent px-0 py-2 font-mono text-xs outline-none focus:border-signal"
        />
      </label>
      <label className="block">
        <span className="font-mono text-[10px] uppercase text-ink-muted">
          Keywords (optional)
        </span>
        <textarea
          value={keywordsText}
          onChange={(e) => setKeywordsText(e.target.value)}
          rows={3}
          placeholder={'software engineer\nproduct manager\nstaff'}
          className="mt-1 w-full resize-y border-0 border-b border-rule bg-transparent px-0 py-2 text-sm outline-none focus:border-signal"
        />
        <span className="mt-1 block font-mono text-[10px] text-ink-muted">
          One per line or comma-separated. Alerts when any keyword matches.
        </span>
      </label>
      <label className="block">
        <span className="font-mono text-[10px] uppercase text-ink-muted">
          Exclude keywords (optional)
        </span>
        <textarea
          value={excludeKeywordsText}
          onChange={(e) => setExcludeKeywordsText(e.target.value)}
          rows={2}
          placeholder={'intern\njunior\ncontract'}
          className="mt-1 w-full resize-y border-0 border-b border-rule bg-transparent px-0 py-2 text-sm outline-none focus:border-signal"
        />
        <span className="mt-1 block font-mono text-[10px] text-ink-muted">
          One per line or comma-separated. Skip jobs that match any of these.
        </span>
      </label>
      <button
        type="button"
        onClick={() => setRemoteOnly((v) => !v)}
        className={`font-mono text-xs ${
          remoteOnly ? 'border-b border-signal text-ink' : 'text-ink-muted'
        }`}
      >
        {remoteOnly ? '✓ ' : ''}Remote only
      </button>
      {error ? <p className="font-mono text-xs text-fault">{error}</p> : null}
      {testMsg ? <p className="font-mono text-xs text-sea">{testMsg}</p> : null}
      <div className="flex flex-wrap gap-4 pt-2">
        <button
          type="button"
          onClick={() => void testWebhook()}
          className="font-mono text-xs text-ink-muted underline-offset-2 hover:underline"
        >
          Test webhook
        </button>
        <button
          type="submit"
          disabled={busy}
          className="bg-signal px-4 py-2 text-sm font-medium text-signal-ink disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Save subscription'}
        </button>
      </div>
    </form>
  );
}

function filterSummary(filter: JobFilter): string {
  const keywords = resolveFilterKeywords(filter);
  const excludes = resolveFilterExcludeKeywords(filter);
  const includePart =
    keywords.length === 0
      ? 'All keywords'
      : keywords.length === 1
        ? `Keyword: ${keywords[0]}`
        : `Keywords: ${keywords.join(' · ')}`;
  if (excludes.length === 0) return includePart;
  const excludePart =
    excludes.length === 1
      ? `Exclude: ${excludes[0]}`
      : `Exclude: ${excludes.join(' · ')}`;
  return `${includePart} · ${excludePart}`;
}

function SubscriptionRow({
  sub,
  onToggle,
  onDelete,
}: {
  sub: NotificationSubscription;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-rule-faint py-3">
      <div>
        <p className="font-mono text-xs text-ink">
          {maskWebhook(sub.discordWebhookUrl)}
        </p>
        <p className="mt-1 text-sm text-ink-muted">
          {filterSummary(sub.filter)}
          {sub.filter.remoteOnly ? ' · Remote only' : ''}
          {' · '}
          {sub.active ? 'Active' : 'Paused'}
        </p>
      </div>
      <div className="flex gap-3 font-mono text-xs">
        <button type="button" onClick={onToggle} className="text-ink-muted hover:text-ink">
          {sub.active ? 'Pause' : 'Resume'}
        </button>
        <button type="button" onClick={onDelete} className="text-fault">
          Delete
        </button>
      </div>
    </div>
  );
}
