import { describe, expect, it } from 'vitest';
import {
  isFilterCity,
  isFilterCountry,
  isFilterState,
  parseLocation,
} from './location.js';

describe('parseLocation', () => {
  it('parses City, ST', () => {
    expect(parseLocation('San Francisco, CA')).toMatchObject({
      city: 'San Francisco',
      state: 'CA',
      country: 'USA',
      isRemote: false,
    });
  });

  it('parses Remote - US as country only', () => {
    const p = parseLocation('Remote - US');
    expect(p).toMatchObject({ isRemote: true, country: 'USA' });
    expect(p.city).toBeUndefined();
    expect(p.allCountries).toContain('USA');
  });

  it('parses bare country names', () => {
    expect(parseLocation('United Kingdom')).toMatchObject({
      country: 'United Kingdom',
    });
    expect(parseLocation('Singapore', { isRemote: true })).toMatchObject({
      country: 'Singapore',
      isRemote: true,
    });
  });

  it('parses London, UK', () => {
    expect(parseLocation('London, UK')).toMatchObject({
      city: 'London',
      country: 'United Kingdom',
    });
  });

  it('parses Ontario as province not city', () => {
    const p = parseLocation('Ontario, CAN');
    expect(p.city).toBeUndefined();
    expect(p.state).toBe('ON');
    expect(p.country).toBe('Canada');
  });

  it('splits pipe-separated multi-city postings', () => {
    const p = parseLocation(
      'San Francisco, CA | New York City, NY | Seattle, WA',
    );
    expect(p.city).toBe('San Francisco');
    expect(p.state).toBe('CA');
    expect(p.allCities).toEqual(
      expect.arrayContaining(['San Francisco', 'New York', 'Seattle']),
    );
    expect(p.allCities).not.toContain('New York City');
    expect(p.allStates).toEqual(expect.arrayContaining(['CA', 'NY', 'WA']));
    expect(p.allCountries).toContain('USA');
  });

  it('handles Remote-Friendly multi-location junk', () => {
    const p = parseLocation(
      'Remote-Friendly (Travel-Required) | San Francisco, CA | Seattle, WA | New York City, NY',
    );
    expect(p.isRemote).toBe(true);
    expect(p.allCities).toEqual(
      expect.arrayContaining(['San Francisco', 'Seattle', 'New York']),
    );
    expect(p.country).toBe('USA');
    expect(p.allCountries.every((c) => !c.includes('Friendly'))).toBe(true);
  });

  it('splits comma-paired multi cities', () => {
    const p = parseLocation('San Francisco, CA, New York City, NY, Seattle, WA');
    expect(p.allCities.length).toBeGreaterThanOrEqual(3);
    expect(p.allStates).toEqual(expect.arrayContaining(['CA', 'NY', 'WA']));
  });

  it('parses New York, NY even though New York is also a state name', () => {
    expect(parseLocation('New York, NY')).toMatchObject({
      city: 'New York',
      state: 'NY',
      country: 'USA',
    });
  });

  it('does not invent fake countries from Remote - Seattle', () => {
    const p = parseLocation('Remote - Seattle');
    expect(p.city).toBe('Seattle');
    expect(p.isRemote).toBe(true);
    // Seattle implies WA / USA — that's intentional for filters
    expect(p.state).toBe('WA');
    expect(p.country).toBe('USA');
  });

  it('infers NY state for bare New York / NYC so state filters work', () => {
    expect(parseLocation('New York')).toMatchObject({
      city: 'New York',
      state: 'NY',
      country: 'USA',
    });
    expect(parseLocation('NYC').allStates).toContain('NY');
    expect(parseLocation('new york/san francisco').allStates).toEqual(
      expect.arrayContaining(['NY', 'CA']),
    );
  });

  it('classifies Croatia as country not city', () => {
    const p = parseLocation('Croatia');
    expect(p.country).toBe('Croatia');
    expect(p.city).toBeUndefined();
    expect(isFilterCity('Croatia')).toBe(false);
    expect(isFilterCountry('Croatia')).toBe(true);
  });

  it('canonicalizes NYC / SF aliases and splits slash/or compounds', () => {
    expect(parseLocation('new-york').city).toBe('New York');
    expect(parseLocation('New York City').city).toBe('New York');
    expect(parseLocation('NYC').city).toBe('New York');
    expect(parseLocation('SF').city).toBe('San Francisco');

    const slash = parseLocation('new york/san francisco');
    expect(slash.allCities).toEqual(
      expect.arrayContaining(['New York', 'San Francisco']),
    );
    expect(slash.allCities).toHaveLength(2);

    const orLoc = parseLocation('san francisco or new york');
    expect(orLoc.allCities).toEqual(
      expect.arrayContaining(['New York', 'San Francisco']),
    );
    expect(orLoc.allCities).toHaveLength(2);

    // Compounds must never appear as a single city or country option
    expect(isFilterCity('new york/san francisco')).toBe(false);
    expect(isFilterCountry('San Francisco')).toBe(false);
    expect(isFilterCountry('New York')).toBe(false);
  });
});

describe('filter validators', () => {
  it('rejects countries and states as cities', () => {
    expect(isFilterCity('Canada')).toBe(false);
    expect(isFilterCity('CA')).toBe(false);
    expect(isFilterCity('Ontario')).toBe(false);
    expect(isFilterCity('San Francisco')).toBe(true);
    expect(isFilterCity('New York City')).toBe(false); // prefer canonical New York
    expect(isFilterCity('New York')).toBe(true);
    expect(isFilterCity('new-york')).toBe(false);
  });

  it('accepts only real states', () => {
    expect(isFilterState('CA')).toBe(true);
    expect(isFilterState('New York City')).toBe(false);
    expect(isFilterState('Seattle')).toBe(false);
  });

  it('rejects garbage country strings', () => {
    expect(isFilterCountry('USA')).toBe(true);
    expect(isFilterCountry('Friendly (Travel-Required) | San Francisco, CA')).toBe(
      false,
    );
    expect(isFilterCountry('NY')).toBe(false);
    expect(isFilterCountry('Seattle')).toBe(false);
  });
});

describe('filter option catalogs', () => {
  it('lists all US states including TX and NY', async () => {
    const { filterStateOptions, filterCountryOptions, filterCityOptions } =
      await import('./location.js');
    const states = filterStateOptions();
    expect(states).toContain('Texas');
    expect(states).toContain('New York');
    expect(states).toContain('California');
    expect(states).toContain('Ontario');
    expect(states).toContain('District of Columbia');
    expect(states).not.toContain('NY');
    expect(filterCountryOptions()).toContain('USA');
    expect(filterCityOptions([])).toContain('New York');
    expect(filterCityOptions(['Austin'])).toEqual(
      expect.arrayContaining(['Austin', 'New York']),
    );
  });
});
