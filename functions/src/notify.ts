import { resolveFilterKeywords, matchesFilter, type JobFilter } from '@jobradar/shared';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from './firebaseAdmin.js';
import type { JobLocation, NormalizedJob } from './types.js';

interface SubDoc {
  id: string;
  refPath: string;
  discordWebhookUrl: string;
  filter: JobFilter;
  active: boolean;
}

export async function notifySubscribersOfNewJobs(
  newJobs: NormalizedJob[],
): Promise<{ sent: number; deactivated: number }> {
  if (newJobs.length === 0) return { sent: 0, deactivated: 0 };

  const db = getDb();
  const snap = await db
    .collectionGroup('notificationSubscriptions')
    .where('active', '==', true)
    .get();

  const subs: SubDoc[] = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      refPath: d.ref.path,
      discordWebhookUrl: String(data.discordWebhookUrl ?? ''),
      filter: (data.filter ?? {}) as JobFilter,
      active: data.active !== false,
    };
  });

  let sent = 0;
  let deactivated = 0;

  for (const sub of subs) {
    const matched = newJobs.filter((j) =>
      matchesFilter(
        {
          title: j.title,
          descriptionPlain: j.descriptionPlain,
          companyId: j.companyId,
          location: j.location,
        },
        sub.filter,
      ),
    );
    if (matched.length === 0) continue;

    const content = formatDiscordMessage(matched, sub.filter);
    const result = await postDiscordWebhook(sub.discordWebhookUrl, content);
    if (result === 'gone') {
      await db.doc(sub.refPath).set({ active: false }, { merge: true });
      deactivated += 1;
      continue;
    }
    if (result === 'ok') {
      await db.doc(sub.refPath).set(
        { lastNotifiedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
      sent += 1;
    }
  }

  return { sent, deactivated };
}

export function formatDiscordMessage(
  jobs: NormalizedJob[],
  filter: JobFilter,
): string {
  const keywords = resolveFilterKeywords(filter);
  const label =
    keywords.length === 0
      ? 'matching your alert'
      : keywords.length === 1
        ? `for "${keywords[0]}"`
        : `for ${keywords.map((k) => `"${k}"`).join(' / ')}`;
  const shown = jobs.slice(0, 10);
  const lines = shown.map(
    (j) => `• **${j.companyName}** — ${j.title} — ${formatJobLocation(j.location)}`,
  );
  const more =
    jobs.length > shown.length ? `\n_+${jobs.length - shown.length} more_` : '';
  return [
    `**JobRadar — ${jobs.length} new match${jobs.length === 1 ? '' : 'es'}** ${label}`,
    ...lines,
    more,
  ]
    .filter(Boolean)
    .join('\n');
}

/** Human-readable location for Discord lines (mirrors web feed formatting). */
export function formatJobLocation(loc: JobLocation): string {
  const cities = loc.allCities?.length
    ? loc.allCities
    : loc.city
      ? [loc.city]
      : [];

  if (cities.length > 1) {
    const shown = cities.slice(0, 3).join(' · ');
    const more = cities.length > 3 ? ` +${cities.length - 3}` : '';
    return loc.isRemote ? `Remote · ${shown}${more}` : `${shown}${more}`;
  }

  if (loc.isRemote && !cities.length) {
    return loc.country ? `Remote · ${loc.country}` : 'Remote';
  }
  if (loc.city && loc.state) return `${loc.city}, ${loc.state}`;
  if (loc.city && loc.country) return `${loc.city}, ${loc.country}`;
  if (loc.city) return loc.city;
  if (loc.isRemote && loc.country) return `Remote · ${loc.country}`;
  if (loc.country) return loc.country;
  return loc.raw || 'Unknown';
}

export async function postDiscordWebhook(
  url: string,
  content: string,
): Promise<'ok' | 'gone' | 'retry' | 'error'> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (res.status === 204 || res.ok) return 'ok';
    if (res.status === 404 || res.status === 401) return 'gone';
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after') ?? '1');
      await new Promise((r) => setTimeout(r, Math.min(retryAfter, 5) * 1000));
      const retry = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (retry.status === 204 || retry.ok) return 'ok';
      return 'retry';
    }
    return 'error';
  } catch {
    return 'error';
  }
}
