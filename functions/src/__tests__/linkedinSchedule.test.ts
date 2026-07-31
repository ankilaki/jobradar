import { describe, expect, it } from 'vitest';
import {
  isLinkedInDue,
  isLinkedInRateLimitError,
  LINKEDIN_ERROR_BACKOFF_MS,
  LINKEDIN_HOURLY_TICKS_PER_DAY,
  LINKEDIN_RATE_LIMIT_BACKOFF_MS,
  LINKEDIN_SYNC_INTERVAL_MS,
  linkedInQuotaForHourlyRun,
  selectLinkedInCompaniesForRun,
  type CompanyWithSyncMeta,
} from '../linkedinSchedule.js';

function li(
  partial: Partial<CompanyWithSyncMeta> & { id: string },
): CompanyWithSyncMeta {
  return {
    name: partial.id,
    ats: 'linkedin',
    boardToken: partial.id,
    active: true,
    ...partial,
  };
}

describe('linkedinSchedule', () => {
  const now = new Date('2026-07-26T18:00:00.000Z');

  it('detects rate-limit error messages', () => {
    expect(isLinkedInRateLimitError('LinkedIn rate limited (429)')).toBe(true);
    expect(isLinkedInRateLimitError('LinkedIn 999 for url')).toBe(false);
    expect(isLinkedInRateLimitError('LinkedIn rate limited (999)')).toBe(true);
    expect(isLinkedInRateLimitError('timeout')).toBe(false);
  });

  it('treats never-synced companies as due', () => {
    expect(isLinkedInDue(li({ id: 'a', lastSyncedAt: null }), now)).toBe(true);
  });

  it('skips successful syncs newer than 24h', () => {
    expect(
      isLinkedInDue(
        li({
          id: 'a',
          lastSyncedAt: new Date(now.getTime() - LINKEDIN_SYNC_INTERVAL_MS + 60_000),
          lastSyncStatus: 'ok',
        }),
        now,
      ),
    ).toBe(false);
    expect(
      isLinkedInDue(
        li({
          id: 'b',
          lastSyncedAt: new Date(now.getTime() - LINKEDIN_SYNC_INTERVAL_MS - 1),
          lastSyncStatus: 'ok',
        }),
        now,
      ),
    ).toBe(true);
  });

  it('applies shorter backoff for errors and longer for rate limits', () => {
    expect(
      isLinkedInDue(
        li({
          id: 'err',
          lastSyncedAt: new Date(
            now.getTime() - LINKEDIN_ERROR_BACKOFF_MS + 30_000,
          ),
          lastSyncStatus: 'error',
          lastSyncError: 'timeout',
        }),
        now,
      ),
    ).toBe(false);
    expect(
      isLinkedInDue(
        li({
          id: 'err2',
          lastSyncedAt: new Date(
            now.getTime() - LINKEDIN_ERROR_BACKOFF_MS - 1,
          ),
          lastSyncStatus: 'error',
          lastSyncError: 'timeout',
        }),
        now,
      ),
    ).toBe(true);
    expect(
      isLinkedInDue(
        li({
          id: 'rl',
          lastSyncedAt: new Date(
            now.getTime() - LINKEDIN_RATE_LIMIT_BACKOFF_MS + 60_000,
          ),
          lastSyncStatus: 'error',
          lastSyncError: 'LinkedIn rate limited (429)',
        }),
        now,
      ),
    ).toBe(false);
  });

  it('spreads LinkedIn quota evenly across hourly ticks', () => {
    expect(linkedInQuotaForHourlyRun(0)).toBe(0);
    expect(linkedInQuotaForHourlyRun(1)).toBe(1);
    expect(linkedInQuotaForHourlyRun(24)).toBe(1);
    expect(linkedInQuotaForHourlyRun(25)).toBe(2);
    expect(linkedInQuotaForHourlyRun(100)).toBe(
      Math.ceil(100 / LINKEDIN_HOURLY_TICKS_PER_DAY),
    );
  });

  it('selects oldest due companies first using day-spread quota', () => {
    const roster = [
      li({
        id: 'fresh',
        lastSyncedAt: new Date(now.getTime() - 60_000),
        lastSyncStatus: 'ok',
      }),
      li({
        id: 'old',
        lastSyncedAt: new Date(now.getTime() - LINKEDIN_SYNC_INTERVAL_MS * 2),
        lastSyncStatus: 'ok',
      }),
      li({ id: 'never', lastSyncedAt: null }),
      li({
        id: 'mid',
        lastSyncedAt: new Date(now.getTime() - LINKEDIN_SYNC_INTERVAL_MS - 1000),
        lastSyncStatus: 'ok',
      }),
      { id: 'gh', name: 'GH', ats: 'greenhouse' as const, boardToken: 'x', active: true },
    ];
    // 4 LinkedIn → quota ceil(4/24)=1
    const selected = selectLinkedInCompaniesForRun(roster, { now });
    expect(selected.map((c) => c.id)).toEqual(['never']);

    const selected2 = selectLinkedInCompaniesForRun(roster, {
      now,
      maxPerRun: 2,
    });
    expect(selected2.map((c) => c.id)).toEqual(['never', 'old']);
  });
});
