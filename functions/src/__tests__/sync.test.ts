import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseLocation } from '../location.js';
import { htmlToPlain, decodeHtmlEntities } from '../html.js';
import { parseSalaryRaw } from '../salary.js';
import { normalizeAshbyJobs } from '../sources/ashby.js';
import { normalizeGreenhouseJobs } from '../sources/greenhouse.js';
import { planSyncPrecise } from '../syncPlan.js';
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
