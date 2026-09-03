import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseLocation } from '../location.js';
import { htmlToPlain, decodeHtmlEntities } from '../html.js';
import { parseSalaryRaw } from '../salary.js';
import { normalizeAshbyJobs } from '../sources/ashby.js';
import { normalizeGreenhouseJobs } from '../sources/greenhouse.js';
import { planSyncPrecise, diffActiveJobIds } from '../syncPlan.js';
import { shouldWriteCompanyDoc } from '../syncOneCompany.js';
import type { CompanyRecord, NormalizedJob } from '../types.js';

const here = dirname(fileURLToPath(import.meta.url));

function loadJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(here, '..', 'fixtures', name), 'utf8')) as T;
}

describe('parseLocation', () => {
  it('parses City, ST', () => {
    expect(parseLocation('New York, NY')).toMatchObject({
      city: 'New York',
      state: 'NY',
      country: 'USA',
      isRemote: false,
    });
  });

  it('parses Remote - US', () => {
    expect(parseLocation('Remote - US')).toMatchObject({
      isRemote: true,
      workplaceType: 'Remote',
      country: 'USA',
    });
  });

  it('parses London, UK', () => {
    expect(parseLocation('London, UK')).toMatchObject({
      city: 'London',
      country: 'United Kingdom',
    });
  });

  it('never throws on garbage', () => {
    expect(parseLocation('???')).toMatchObject({ raw: '???', isRemote: false });
  });
});

describe('html helpers', () => {
  it('decodes greenhouse entities and strips tags', () => {
    const encoded = '&lt;p&gt;Hello &amp; welcome&lt;/p&gt;';
    expect(decodeHtmlEntities(encoded)).toBe('<p>Hello & welcome</p>');
    expect(htmlToPlain(encoded)).toContain('Hello & welcome');
  });
});

describe('parseSalaryRaw', () => {
  it('parses $150K – $189K', () => {
    expect(parseSalaryRaw('$150K – $189K')).toMatchObject({
      min: 150000,
      max: 189000,
      currency: 'USD',
    });
  });
});

describe('normalizeAshbyJobs (fixture)', () => {
  const company: CompanyRecord = {
    id: 'ashby',
    name: 'Ashby',
    ats: 'ashby',
    boardToken: 'Ashby',
    active: true,
  };

  it('normalizes sample board jobs', () => {
    const raw = loadJson<{ jobs: unknown[] }>('ashby-sample.json');
    const jobs = normalizeAshbyJobs(company, raw.jobs as never);
    expect(jobs.length).toBeGreaterThan(0);
    const first = jobs[0]!;
    expect(first.id).toMatch(/^ashby_ashby_/);
    expect(first.title.length).toBeGreaterThan(0);
    expect(first.applyUrl).toMatch(/^https?:\/\//);
    expect(first.descriptionPlain.length).toBeGreaterThan(0);
    expect(first.location.raw.length).toBeGreaterThan(0);
  });
});

describe('normalizeGreenhouseJobs (fixture)', () => {
  const company: CompanyRecord = {
    id: 'anthropic',
    name: 'Anthropic',
    ats: 'greenhouse',
    boardToken: 'anthropic',
    active: true,
  };

  it('normalizes sample board jobs and decodes HTML', () => {
    const raw = loadJson<{ jobs: unknown[] }>('greenhouse-sample.json');
    const jobs = normalizeGreenhouseJobs(company, raw.jobs as never);
    expect(jobs.length).toBe(3);
    const first = jobs[0]!;
    expect(first.id).toMatch(/^greenhouse_anthropic_/);
    expect(first.descriptionHtml).toMatch(/<div|<h2|<p/i);
    expect(first.descriptionPlain.toLowerCase()).toContain('anthropic');
    expect(first.location.raw.length).toBeGreaterThan(0);
  });
});

describe('planSyncPrecise', () => {
  const job = (id: string, title: string): NormalizedJob => ({
    id,
    companyId: 'co',
    companyName: 'Co',
    ats: 'greenhouse',
    externalId: id,
    title,
    descriptionHtml: '',
    descriptionPlain: '',
    location: { raw: 'Remote', isRemote: true, workplaceType: 'Remote' },
    salary: null,
    applyUrl: 'https://example.com',
    jobPageUrl: 'https://example.com',
    postedAt: new Date(),
  });

  it('run1 A,B then run2 A,C → create C, update A, close B', () => {
    const a = job('a', 'A');
    const b = job('b', 'B');
    const c = job('c', 'C');

    const run1 = planSyncPrecise({
      existingIds: new Set(),
      previouslyActiveIds: new Set(),
      fetchedJobs: [a, b],
    });
    expect(run1.newJobs.map((j) => j.id).sort()).toEqual(['a', 'b']);
    expect(run1.toClose).toEqual([]);

    const run2 = planSyncPrecise({
      existingIds: new Set(['a', 'b']),
      previouslyActiveIds: new Set(['a', 'b']),
      fetchedJobs: [a, c],
    });
    expect(run2.newJobs.map((j) => j.id)).toEqual(['c']);
    expect(run2.toClose).toEqual(['b']);
    expect(run2.upserts.find((u) => u.job.id === 'a')?.type).toBe('update');
  });
});

describe('diffActiveJobIds', () => {
  it('opens C, closes B, ignores unchanged A', () => {
    const { toOpen, toClose } = diffActiveJobIds({
      activeJobIds: ['a', 'b'],
      fetchedIds: ['a', 'c'],
    });
    expect(toOpen).toEqual(['c']);
    expect(toClose).toEqual(['b']);
  });

  it('no-ops when the board is unchanged', () => {
    const { toOpen, toClose } = diffActiveJobIds({
      activeJobIds: ['a', 'b'],
      fetchedIds: ['b', 'a'],
    });
    expect(toOpen).toEqual([]);
    expect(toClose).toEqual([]);
  });

  it('treats the whole board as new when nothing is tracked yet', () => {
    const { toOpen, toClose } = diffActiveJobIds({
      activeJobIds: [],
      fetchedIds: ['a', 'b'],
    });
    expect(toOpen).toEqual(['a', 'b']);
    expect(toClose).toEqual([]);
  });
});

describe('shouldWriteCompanyDoc', () => {
  const base = {
    id: 'stripe',
    name: 'Stripe',
    ats: 'greenhouse' as const,
    boardToken: 'stripe',
    active: true,
    lastSyncStatus: 'ok' as const,
    lastSyncedAt: new Date(),
    activeJobIds: ['a'],
  };

  it('skips hourly heartbeat when a public ATS board is unchanged', () => {
    expect(shouldWriteCompanyDoc(base, 0, 0)).toBe(false);
  });

  it('writes when jobs opened or closed', () => {
    expect(shouldWriteCompanyDoc(base, 1, 0)).toBe(true);
    expect(shouldWriteCompanyDoc(base, 0, 1)).toBe(true);
  });

  it('always writes LinkedIn so due-time stays accurate', () => {
    expect(
      shouldWriteCompanyDoc({ ...base, ats: 'linkedin' }, 0, 0),
    ).toBe(true);
  });

  it('writes on first run before activeJobIds exist', () => {
    const { activeJobIds: _ignored, ...rest } = base;
    expect(shouldWriteCompanyDoc(rest, 0, 0)).toBe(true);
  });
});
