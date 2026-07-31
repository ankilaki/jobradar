import { describe, expect, it } from 'vitest';
import type { CompanyWithSyncMeta } from '../linkedinSchedule.js';
import {
  selectCompaniesByAts,
  sortByOldestSyncFirst,
} from '../syncSchedule.js';

function co(
  partial: Partial<CompanyWithSyncMeta> &
    Pick<CompanyWithSyncMeta, 'id' | 'ats'>,
): CompanyWithSyncMeta {
  return {
    name: partial.id,
    boardToken: partial.id,
    active: true,
    ...partial,
  };
}

describe('syncSchedule', () => {
  const now = new Date('2026-07-28T18:00:00.000Z');

  it('sorts never-synced before oldest timestamps', () => {
    const sorted = sortByOldestSyncFirst([
      co({
        id: 'b',
        ats: 'greenhouse',
        lastSyncedAt: new Date(now.getTime() - 60_000),
      }),
      co({ id: 'a', ats: 'greenhouse', lastSyncedAt: null }),
      co({
        id: 'c',
        ats: 'greenhouse',
        lastSyncedAt: new Date(now.getTime() - 3600_000),
      }),
    ]);
    expect(sorted.map((c) => c.id)).toEqual(['a', 'c', 'b']);
  });

  it('selects every company for a public ATS (hourly full pass)', () => {
    const selected = selectCompaniesByAts(
      [
        co({ id: 'gh-never', ats: 'greenhouse', lastSyncedAt: null }),
        co({
          id: 'gh-old',
          ats: 'greenhouse',
          lastSyncedAt: new Date(now.getTime() - 7200_000),
        }),
        co({
          id: 'gh-fresh',
          ats: 'greenhouse',
          lastSyncedAt: new Date(now.getTime() - 60_000),
        }),
        co({ id: 'ashby-never', ats: 'ashby', lastSyncedAt: null }),
        co({ id: 'lever-never', ats: 'lever', lastSyncedAt: null }),
      ],
      'greenhouse',
    );
    expect(selected.map((c) => c.id)).toEqual([
      'gh-never',
      'gh-old',
      'gh-fresh',
    ]);
  });
});
