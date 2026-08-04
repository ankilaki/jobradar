import { describe, expect, it } from 'vitest';
import {
  matchesFilter,
  parseKeywordList,
  sanitizeJobFilter,
  type FilterableJob,
} from './jobFilter.js';

const baseJob: FilterableJob = {
  title: 'Software Engineer',
  descriptionPlain: 'Build backend systems in New York',
  companyId: 'stripe',
  location: {
    city: 'New York',
    state: 'NY',
    country: 'USA',
    isRemote: false,
  },
};

describe('matchesFilter', () => {
  it('matches everything when filter is empty', () => {
    expect(matchesFilter(baseJob, {})).toBe(true);
  });

  it('matches keyword in title', () => {
    expect(matchesFilter(baseJob, { keyword: 'software' })).toBe(true);
    expect(matchesFilter(baseJob, { keyword: 'designer' })).toBe(false);
  });

  it('matches keyword in description', () => {
    expect(matchesFilter(baseJob, { keyword: 'backend' })).toBe(true);
  });

  it('respects remoteOnly', () => {
    expect(matchesFilter(baseJob, { remoteOnly: true })).toBe(false);
    expect(
      matchesFilter(
        { ...baseJob, location: { ...baseJob.location, isRemote: true } },
        { remoteOnly: true },
      ),
    ).toBe(true);
  });

  it('filters by city/state/country', () => {
    expect(matchesFilter(baseJob, { city: 'New York' })).toBe(true);
    expect(matchesFilter(baseJob, { city: 'Austin' })).toBe(false);
    expect(matchesFilter(baseJob, { state: 'NY' })).toBe(true);
    expect(matchesFilter(baseJob, { state: 'New York' })).toBe(true);
    expect(matchesFilter(baseJob, { country: 'USA' })).toBe(true);
  });

  it('matches state when city implies that state (e.g. New York → NY)', () => {
    const nycOnly = {
      ...baseJob,
      location: {
        city: 'New York',
        isRemote: false,
      },
    };
    expect(matchesFilter(nycOnly, { state: 'NY' })).toBe(true);
    expect(matchesFilter(nycOnly, { state: 'New York' })).toBe(true);
    expect(matchesFilter(nycOnly, { state: 'CA' })).toBe(false);
    expect(matchesFilter(nycOnly, { state: 'California' })).toBe(false);
  });

  it('filters by companyIds', () => {
    expect(matchesFilter(baseJob, { companyIds: ['stripe'] })).toBe(true);
    expect(matchesFilter(baseJob, { companyIds: ['notion'] })).toBe(false);
  });

  it('matches city against allCities for multi-location jobs', () => {
    const multi = {
      ...baseJob,
      location: {
        city: 'San Francisco',
        state: 'CA',
        country: 'USA',
        isRemote: false,
        allCities: ['San Francisco', 'New York City', 'Seattle'],
        allStates: ['CA', 'NY', 'WA'],
        allCountries: ['USA'],
      },
    };
    expect(matchesFilter(multi, { city: 'Seattle' })).toBe(true);
    expect(matchesFilter(multi, { city: 'Austin' })).toBe(false);
    expect(matchesFilter(multi, { state: 'WA' })).toBe(true);
  });

  it('matches any of several keywords (OR)', () => {
    expect(
      matchesFilter(baseJob, { keywords: ['designer', 'software'] }),
    ).toBe(true);
    expect(
      matchesFilter(baseJob, { keywords: ['designer', 'product'] }),
    ).toBe(false);
  });

  it('rejects when any exclude keyword matches title or description', () => {
    expect(matchesFilter(baseJob, { excludeKeyword: 'intern' })).toBe(true);
    expect(matchesFilter(baseJob, { excludeKeyword: 'software' })).toBe(false);
    expect(matchesFilter(baseJob, { excludeKeyword: 'backend' })).toBe(false);
    expect(
      matchesFilter(baseJob, {
        keywords: ['software'],
        excludeKeywords: ['intern', 'backend'],
      }),
    ).toBe(false);
    expect(
      matchesFilter(baseJob, {
        keywords: ['software'],
        excludeKeywords: ['intern', 'manager'],
      }),
    ).toBe(true);
  });
});

describe('parseKeywordList / sanitizeJobFilter', () => {
  it('parses lines and commas', () => {
    expect(parseKeywordList('software engineer\nPM, staff')).toEqual([
      'software engineer',
      'PM',
      'staff',
    ]);
  });

  it('omits undefined remoteOnly and empty keywords for Firestore', () => {
    expect(
      sanitizeJobFilter({
        keywords: [],
        keyword: '',
        excludeKeywords: [],
        excludeKeyword: '',
        remoteOnly: undefined,
      }),
    ).toEqual({});
    expect(sanitizeJobFilter({ remoteOnly: false })).toEqual({});
    expect(sanitizeJobFilter({ remoteOnly: true, keywords: ['SWE'] })).toEqual({
      keyword: 'SWE',
      remoteOnly: true,
    });
    expect(
      sanitizeJobFilter({ keywords: ['a', 'b'], remoteOnly: true }),
    ).toEqual({
      keywords: ['a', 'b'],
      remoteOnly: true,
    });
    expect(
      sanitizeJobFilter({
        keywords: ['engineer'],
        excludeKeywords: ['intern'],
      }),
    ).toEqual({
      keyword: 'engineer',
      excludeKeyword: 'intern',
    });
    expect(
      sanitizeJobFilter({
        excludeKeywords: ['intern', 'junior'],
      }),
    ).toEqual({
      excludeKeywords: ['intern', 'junior'],
    });
  });
});
