import { describe, expect, it, vi } from 'vitest';
import { formatDiscordMessage, postDiscordWebhook } from '../notify.js';
import { requireAdminClaim } from '../admin.js';
import type { NormalizedJob } from '../types.js';

function job(partial: Partial<NormalizedJob> & Pick<NormalizedJob, 'id' | 'title' | 'companyId' | 'companyName'>): NormalizedJob {
  return {
    ats: 'greenhouse',
    externalId: partial.id,
    descriptionHtml: '',
    descriptionPlain: partial.descriptionPlain ?? '',
    location: partial.location ?? {
      raw: 'Remote',
      isRemote: true,
      workplaceType: 'Remote',
    },
    salary: null,
    applyUrl: 'https://example.com',
    jobPageUrl: 'https://example.com',
    postedAt: new Date(),
    ...partial,
  };
}

describe('formatDiscordMessage', () => {
  it('batches multiple matches into one message', () => {
    const jobs = [
      job({ id: '1', title: 'SWE', companyId: 'a', companyName: 'Stripe' }),
      job({ id: '2', title: 'PM', companyId: 'b', companyName: 'Ramp' }),
    ];
    const msg = formatDiscordMessage(jobs, { keyword: 'engineer' });
    expect(msg).toContain('2 new matches');
    expect(msg).toContain('Stripe');
    expect(msg).toContain('Ramp');
  });
});

describe('postDiscordWebhook', () => {
  it('returns ok on 204', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, headers: new Headers() });
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      postDiscordWebhook('https://discord.com/api/webhooks/1/token', 'hi'),
    ).resolves.toBe('ok');
    vi.unstubAllGlobals();
  });

  it('returns gone on 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404, headers: new Headers() }),
    );
    await expect(
      postDiscordWebhook('https://discord.com/api/webhooks/1/token', 'hi'),
    ).resolves.toBe('gone');
    vi.unstubAllGlobals();
  });
});

describe('requireAdminClaim', () => {
  it('rejects missing admin claim', () => {
    expect(() => requireAdminClaim({})).toThrow('permission-denied');
    expect(() => requireAdminClaim(undefined)).toThrow('permission-denied');
  });

  it('allows admin: true', () => {
    expect(() => requireAdminClaim({ admin: true })).not.toThrow();
  });
});
