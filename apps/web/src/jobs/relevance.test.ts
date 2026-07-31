import { describe, expect, it } from 'vitest';
import { relevanceScore } from './relevance';
import type { Job } from './types';
import { maskWebhook } from '../notifications/maskWebhook';

function job(title: string, desc = ''): Job {
  return {
    id: '1',
    companyId: 'c',
    companyName: 'Co',
    ats: 'greenhouse',
    externalId: '1',
    title,
    descriptionHtml: '',
    descriptionPlain: desc,
    location: { raw: 'Remote', isRemote: true },
    salary: null,
    applyUrl: 'https://x',
    jobPageUrl: 'https://x',
    postedAt: new Date(),
    firstSeenAt: new Date(),
    isActive: true,
  };
}

describe('relevanceScore', () => {
  it('scores exact title highest', () => {
    const exact = relevanceScore(job('engineer'), 'engineer');
    const partial = relevanceScore(job('Software Engineer'), 'engineer');
    expect(exact).toBeGreaterThan(partial);
  });
});

describe('maskWebhook', () => {
  it('masks token', () => {
    const masked = maskWebhook(
      'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz',
    );
    expect(masked).toContain('webhooks/123456');
    expect(masked).toContain('••••');
    expect(masked).not.toContain('abcdefgh');
  });
});
