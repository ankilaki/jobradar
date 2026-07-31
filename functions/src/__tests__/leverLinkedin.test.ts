import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeLeverJobs } from '../sources/lever.js';
import {
  extractLinkedInCompanyId,
  guestHtmlMatchesCompanySlug,
  isExplicitLinkedInToken,
  normalizeLinkedInJobs,
  normalizeLinkedInName,
  parseLinkedInCompanyToken,
  parseLinkedInGuestJobCards,
  parseLinkedInTypeaheadCompanies,
} from '../sources/linkedin.js';
import type { CompanyRecord } from '../types.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('normalizeLeverJobs (fixture)', () => {
  const company: CompanyRecord = {
    id: 'activecampaign',
    name: 'ActiveCampaign',
    ats: 'lever',
    boardToken: 'activecampaign',
    active: true,
  };

  it('normalizes Lever postings', () => {
    const raw = JSON.parse(
      readFileSync(join(here, '..', 'fixtures', 'lever-sample.json'), 'utf8'),
    );
    const jobs = normalizeLeverJobs(company, raw);
    expect(jobs.length).toBe(2);
    expect(jobs[0]!.id).toMatch(/^lever_activecampaign_/);
    expect(jobs[0]!.title.length).toBeGreaterThan(0);
    expect(jobs[0]!.applyUrl).toMatch(/^https?:\/\//);
    expect(jobs[0]!.ats).toBe('lever');
  });
});

describe('LinkedIn token helpers', () => {
  it('parses li: prefix and company URLs', () => {
    expect(parseLinkedInCompanyToken('li:openai')).toBe('openai');
    expect(parseLinkedInCompanyToken('li/openai')).toBe('openai');
    expect(
      parseLinkedInCompanyToken(
        'https://www.linkedin.com/company/openai/jobs/',
      ),
    ).toBe('openai');
    expect(parseLinkedInCompanyToken('OpenAI')).toBe('openai');
    expect(parseLinkedInCompanyToken('li:11130470')).toBe('11130470');
    expect(parseLinkedInCompanyToken('11130470')).toBe('11130470');
  });

  it('detects explicit LinkedIn bulk tokens', () => {
    expect(isExplicitLinkedInToken('li:openai')).toBe(true);
    expect(isExplicitLinkedInToken('https://linkedin.com/company/x')).toBe(
      true,
    );
    expect(isExplicitLinkedInToken('openai')).toBe(false);
    expect(isExplicitLinkedInToken('stripe')).toBe(false);
  });

  it('extracts org id from HTML', () => {
    expect(
      extractLinkedInCompanyId(
        '<html>urn:li:organization:1441 and stuff</html>',
      ),
    ).toBe('1441');
    expect(
      extractLinkedInCompanyId('{"companyId":999888}'),
    ).toBe('999888');
  });

  it('parses typeahead companies and matches guest card slugs', () => {
    expect(
      parseLinkedInTypeaheadCompanies(
        JSON.stringify([
          { id: '11130470', type: 'COMPANY', displayName: 'OpenAI' },
          { id: 'bad', type: 'COMPANY', displayName: 'Nope' },
        ]),
      ),
    ).toEqual([{ id: '11130470', displayName: 'OpenAI' }]);
    expect(normalizeLinkedInName('Open AI')).toBe('openai');
    expect(
      guestHtmlMatchesCompanySlug(
        '<a href="https://www.linkedin.com/company/openai?trk=x">OpenAI</a>',
        'openai',
      ),
    ).toBe(true);
    expect(
      guestHtmlMatchesCompanySlug(
        '<a href="https://www.linkedin.com/company/lenovo">Lenovo</a>',
        'openai',
      ),
    ).toBe(false);
  });

  it('parses guest job cards', () => {
    const html = `
      <div class="base-card relative" data-entity-urn="urn:li:jobPosting:12345">
        <a href="https://www.linkedin.com/jobs/view/12345/?refId=x"></a>
        <h3 class="base-search-card__title"> Staff Engineer </h3>
        <span class="job-search-card__location"> San Francisco, CA </span>
        <time datetime="2024-01-15T00:00:00.000Z"></time>
      </div>
      <div class="base-card relative" data-entity-urn="urn:li:jobPosting:67890">
        <a href="https://www.linkedin.com/jobs/view/67890"></a>
        <h3 class="base-search-card__title"> Product Manager </h3>
        <span class="job-search-card__location"> Remote </span>
      </div>
    `;
    const jobs = parseLinkedInGuestJobCards(html);
    expect(jobs.length).toBe(2);
    expect(jobs[0]).toMatchObject({
      externalId: '12345',
      title: 'Staff Engineer',
    });
    expect(jobs[1]).toMatchObject({
      externalId: '67890',
      title: 'Product Manager',
    });
  });

  it('normalizes LinkedIn jobs', () => {
    const company: CompanyRecord = {
      id: 'openai',
      name: 'OpenAI',
      ats: 'linkedin',
      boardToken: 'openai',
      active: true,
    };
    const jobs = normalizeLinkedInJobs(company, [
      {
        externalId: '1',
        title: 'Engineer',
        location: 'San Francisco, CA',
        jobUrl: 'https://www.linkedin.com/jobs/view/1',
      },
    ]);
    expect(jobs[0]!.id).toBe('linkedin_openai_1');
    expect(jobs[0]!.ats).toBe('linkedin');
    expect(jobs[0]!.location.city).toBe('San Francisco');
  });
});
