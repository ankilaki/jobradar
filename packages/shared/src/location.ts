/** Shared location parsing for sync engine + feed filters. */

export type WorkplaceType = 'Remote' | 'Hybrid' | 'InOffice' | 'Unknown';

export interface ParsedLocation {
  raw: string;
  city?: string;
  state?: string;
  country?: string;
  isRemote: boolean;
  workplaceType?: WorkplaceType;
  /** Other place strings from multi-location postings */
  secondaryLocations?: string[];
  /** Every city extracted from the raw string (primary + others) — for filters */
  allCities: string[];
  allStates: string[];
  allCountries: string[];
}

const US_STATE_BY_CODE: Record<string, string> = {
  AL: 'AL', AK: 'AK', AZ: 'AZ', AR: 'AR', CA: 'CA', CO: 'CO', CT: 'CT', DE: 'DE',
  FL: 'FL', GA: 'GA', HI: 'HI', ID: 'ID', IL: 'IL', IN: 'IN', IA: 'IA', KS: 'KS',
  KY: 'KY', LA: 'LA', ME: 'ME', MD: 'MD', MA: 'MA', MI: 'MI', MN: 'MN', MS: 'MS',
  MO: 'MO', MT: 'MT', NE: 'NE', NV: 'NV', NH: 'NH', NJ: 'NJ', NM: 'NM', NY: 'NY',
  NC: 'NC', ND: 'ND', OH: 'OH', OK: 'OK', OR: 'OR', PA: 'PA', RI: 'RI', SC: 'SC',
  SD: 'SD', TN: 'TN', TX: 'TX', UT: 'UT', VT: 'VT', VA: 'VA', WA: 'WA', WV: 'WV',
  WI: 'WI', WY: 'WY', DC: 'DC',
};

const US_STATE_BY_NAME: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS',
  kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA',
  michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT',
  nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND',
  ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI',
  'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX',
  utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV',
  wisconsin: 'WI', wyoming: 'WY', 'district of columbia': 'DC',
};

const CA_PROVINCE_BY_CODE: Record<string, string> = {
  AB: 'AB', BC: 'BC', MB: 'MB', NB: 'NB', NL: 'NL', NS: 'NS', NT: 'NT', NU: 'NU',
  ON: 'ON', PE: 'PE', QC: 'QC', SK: 'SK', YT: 'YT',
};

const CA_PROVINCE_BY_NAME: Record<string, string> = {
  alberta: 'AB', 'british columbia': 'BC', manitoba: 'MB', 'new brunswick': 'NB',
  'newfoundland and labrador': 'NL', 'nova scotia': 'NS', ontario: 'ON',
  'prince edward island': 'PE', quebec: 'QC', saskatchewan: 'SK',
  'northwest territories': 'NT', nunavut: 'NU', yukon: 'YT',
};

/** Canonical country display name → aliases (lowercase). */
const COUNTRY_ALIASES: Record<string, string[]> = {
  USA: ['usa', 'us', 'u.s.', 'u.s.a.', 'united states', 'united states of america', 'america'],
  Canada: ['canada', 'can', 'ca'], // 'ca' only when clearly a country context — handled carefully
  'United Kingdom': ['united kingdom', 'uk', 'u.k.', 'great britain', 'britain', 'gb', 'england', 'scotland', 'wales'],
  Ireland: ['ireland', 'ie', 'republic of ireland'],
  Germany: ['germany', 'de', 'deutschland'],
  France: ['france', 'fr'],
  Australia: ['australia', 'au'],
  India: ['india', 'in'],
  Japan: ['japan', 'jp'],
  Singapore: ['singapore', 'sg'],
  'South Korea': ['south korea', 'korea', 'kr', 'republic of korea'],
  Portugal: ['portugal', 'pt'],
  Switzerland: ['switzerland', 'ch', 'swiss'],
  Netherlands: ['netherlands', 'nl', 'holland'],
  Spain: ['spain', 'es'],
  Italy: ['italy', 'it'],
  Brazil: ['brazil', 'br'],
  Mexico: ['mexico', 'mx'],
  Israel: ['israel', 'il'],
  Sweden: ['sweden', 'se'],
  Norway: ['norway', 'no'],
  Denmark: ['denmark', 'dk'],
  Finland: ['finland', 'fi'],
  Poland: ['poland', 'pl'],
  Austria: ['austria', 'at'],
  Belgium: ['belgium', 'be'],
  'New Zealand': ['new zealand', 'nz'],
  'European Union': ['european union', 'eu', 'europe'],
  Croatia: ['croatia', 'hr'],
  'Czech Republic': ['czech republic', 'czechia', 'cz'],
  Philippines: ['philippines', 'ph'],
  Romania: ['romania', 'ro'],
  Estonia: ['estonia', 'ee'],
  Hungary: ['hungary', 'hu'],
  Latvia: ['latvia', 'lv'],
  Lithuania: ['lithuania', 'lt'],
  Slovakia: ['slovakia', 'sk'],
  Slovenia: ['slovenia', 'si'],
  Greece: ['greece', 'gr'],
  Argentina: ['argentina', 'ar'],
  Chile: ['chile', 'cl'],
  Colombia: ['colombia'], // full name only — 'co' is Colorado
  Taiwan: ['taiwan', 'tw'],
  'Hong Kong': ['hong kong', 'hk'],
  UAE: ['uae', 'united arab emirates'],
  Nigeria: ['nigeria', 'ng'],
  'South Africa': ['south africa', 'za'],
};

const COUNTRY_LOOKUP = buildCountryLookup();

/** Canonical city display name → aliases (lowercase, hyphen/space normalized). */
const CITY_ALIASES: Record<string, string[]> = {
  'New York': [
    'new york',
    'new york city',
    'nyc',
    'new-york',
    'newyork',
    'ny city',
  ],
  'San Francisco': [
    'san francisco',
    'sf',
    'san fran',
    'san-francisco',
    'sf bay area',
    'bay area',
  ],
  'Los Angeles': ['los angeles', 'l.a.', 'los-angeles'],
  'Washington': ['washington dc', 'washington d.c.', 'washington, dc', 'dc'],
  'Bengaluru': ['bengaluru', 'bangalore'],
  Zürich: ['zürich', 'zurich'],
  'Mexico City': ['mexico city', 'cdmx'],
  'Hong Kong': ['hong kong'],
  'Salt Lake City': ['salt lake city', 'salt lake'],
};

const CITY_LOOKUP = buildCityLookup();

/**
 * Known city → US state / CA province when the posting omits ", ST".
 * Keys are normalizeCityKey() form.
 */
const CITY_HOME_STATE: Record<string, string> = {
  'new york': 'NY',
  brooklyn: 'NY',
  manhattan: 'NY',
  queens: 'NY',
  bronx: 'NY',
  'staten island': 'NY',
  'long island': 'NY',
  'san francisco': 'CA',
  'los angeles': 'CA',
  'san diego': 'CA',
  'san jose': 'CA',
  'palo alto': 'CA',
  'mountain view': 'CA',
  seattle: 'WA',
  bellevue: 'WA',
  chicago: 'IL',
  austin: 'TX',
  dallas: 'TX',
  houston: 'TX',
  boston: 'MA',
  cambridge: 'MA',
  denver: 'CO',
  boulder: 'CO',
  atlanta: 'GA',
  miami: 'FL',
  portland: 'OR',
  philadelphia: 'PA',
  washington: 'DC',
  'salt lake city': 'UT',
  toronto: 'ON',
  vancouver: 'BC',
  montreal: 'QC',
};

/** US state / CA province implied by a city name (e.g. New York → NY). */
export function homeStateForCity(
  city: string | undefined | null,
): string | undefined {
  if (!city) return undefined;
  const canonical = canonicalizeCity(city) ?? city;
  return CITY_HOME_STATE[normalizeCityKey(canonical)];
}

function enrichStatesFromCities(
  cities: string[],
  states: string[],
): string[] {
  const out = [...states];
  const seen = new Set(states.map((s) => s.toUpperCase()));
  for (const city of cities) {
    const st = homeStateForCity(city);
    if (st && !seen.has(st)) {
      seen.add(st);
      out.push(st);
    }
  }
  return out;
}

function countryForStateCode(state: string | undefined): string | undefined {
  if (!state) return undefined;
  if (US_STATE_BY_CODE[state]) return 'USA';
  if (CA_PROVINCE_BY_CODE[state]) return 'Canada';
  return undefined;
}
function buildCountryLookup(): Map<string, string> {
  const m = new Map<string, string>();
  for (const [canonical, aliases] of Object.entries(COUNTRY_ALIASES)) {
    m.set(canonical.toLowerCase(), canonical);
    for (const a of aliases) m.set(a.toLowerCase(), canonical);
  }
  return m;
}

function buildCityLookup(): Map<string, string> {
  const m = new Map<string, string>();
  for (const [canonical, aliases] of Object.entries(CITY_ALIASES)) {
    m.set(normalizeCityKey(canonical), canonical);
    for (const a of aliases) m.set(normalizeCityKey(a), canonical);
  }
  return m;
}

function normalizeCityKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[._]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Collapse known country aliases to one filter label. */
export function canonicalizeCountry(
  value: string | undefined | null,
): string | undefined {
  if (!value) return undefined;
  return lookupCountry(value);
}

/** Collapse NYC / SF / Bangalore variants to one filter label. */
export function canonicalizeCity(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const cleaned = value.trim();
  if (!cleaned || isJunkPlace(cleaned)) return undefined;
  if (/[|/]|^\s*or\s*$/i.test(cleaned)) return undefined;
  if (/\bor\b|\band\b|\//i.test(cleaned) && !lookupCountry(cleaned)) {
    // Compound strings are not a single city — caller should split first
    return undefined;
  }
  const mapped = CITY_LOOKUP.get(normalizeCityKey(cleaned));
  if (mapped) return mapped;
  // Title-case unknown cities, but reject countries/states
  if (lookupCountry(cleaned) || lookupUsState(cleaned) || lookupCaProvince(cleaned)) {
    return undefined;
  }
  if (!isCityCandidate(cleaned)) return undefined;
  return titleCaseCity(cleaned);
}

/**
 * Ambiguous 2-letter codes that are both US states and country ISO codes.
 * Prefer US state when paired with a city; prefer country when alone / remote.
 */
const AMBIGUOUS_CODES = new Set(['CA', 'GA', 'IN', 'AL', 'CO', 'ME', 'MO', 'PA']);

export function parseLocation(
  raw: string,
  hints?: { isRemote?: boolean; workplaceType?: string },
): ParsedLocation {
  const text = (raw ?? '').trim();
  const lower = text.toLowerCase();

  const remoteFromText =
    /\bremote\b/i.test(text) ||
    /\bremote-friendly\b/i.test(text) ||
    hints?.workplaceType?.toLowerCase() === 'remote';
  const isRemote = hints?.isRemote === true || remoteFromText;

  const workplaceType = normalizeWorkplace(hints?.workplaceType, isRemote, lower);

  if (!text) {
    return emptyParsed('Unknown', isRemote, workplaceType);
  }

  // Split multi-location postings on | or ; (common Greenhouse pattern)
  const segments = splitLocationSegments(text);
  const parsedSegments = segments
    .map((seg) => parseSingleSegment(seg, { isRemote, workplaceType }))
    .filter((p): p is SegmentParse => p != null);

  if (parsedSegments.length === 0) {
    // Fall back: maybe the whole string is a country or remote region
    const asCountry = lookupCountry(text.replace(/^remote\s*[-–—,:]?\s*/i, '').trim());
    if (asCountry) {
      return {
        raw: text,
        country: asCountry,
        isRemote,
        workplaceType: isRemote ? 'Remote' : workplaceType,
        allCities: [],
        allStates: [],
        allCountries: [asCountry],
      };
    }
    return emptyParsed(text, isRemote, workplaceType);
  }

  // Prefer a segment that has a city; else first with state; else first with country
  const primary =
    parsedSegments.find((p) => p.city) ??
    parsedSegments.find((p) => p.state) ??
    parsedSegments[0]!;

  const allCities = unique(
    parsedSegments
      .map((p) => canonicalizeCity(p.city))
      .filter((c): c is string => Boolean(c)),
  );
  let allStates = unique(
    parsedSegments.map((p) => p.state).filter(Boolean) as string[],
  );
  allStates = enrichStatesFromCities(allCities, allStates);

  let allCountries = unique(
    parsedSegments
      .map((p) => (p.country ? lookupCountry(p.country) ?? undefined : undefined))
      .filter((c): c is string => Boolean(c)),
  );
  for (const st of allStates) {
    const c = countryForStateCode(st);
    if (c && !allCountries.includes(c)) allCountries = [...allCountries, c];
  }

  const secondaryLocations = parsedSegments
    .filter((p) => p !== primary)
    .map((p) => formatSegment(p))
    .filter((s) => s.length > 0);

  const primaryCity = canonicalizeCity(primary.city);
  let primaryState = primary.state;
  if (!primaryState && primaryCity) {
    primaryState = homeStateForCity(primaryCity);
  }
  let primaryCountry = primary.country
    ? lookupCountry(primary.country) ?? undefined
    : undefined;
  if (!primaryCountry && primaryState) {
    primaryCountry = countryForStateCode(primaryState);
  }

  return {
    raw: text,
    city: primaryCity,
    state: primaryState,
    country: primaryCountry,
    isRemote: isRemote || primary.isRemote,
    workplaceType: isRemote || primary.isRemote ? 'Remote' : workplaceType,
    secondaryLocations: secondaryLocations.length ? secondaryLocations : undefined,
    allCities,
    allStates,
    allCountries,
  };
}

interface SegmentParse {
  city?: string;
  state?: string;
  country?: string;
  isRemote: boolean;
  label: string;
}

function parseSingleSegment(
  segment: string,
  defaults: { isRemote: boolean; workplaceType?: WorkplaceType },
): SegmentParse | null {
  let text = segment.trim();
  if (!text) return null;

  // Drop parenthetical noise: "Remote-Friendly (Travel-Required)"
  text = text.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return null;

  // Skip pure remote markers with no place
  if (/^remote(?:-friendly)?$/i.test(text) || /^remote friendly$/i.test(text)) {
    return { isRemote: true, label: text };
  }

  // "Remote - US" / "Remote: Canada" / "Remote - New York"
  const remotePlace = text.match(/^remote(?:-friendly)?\s*[-–—,:]\s*(.+)$/i);
  if (remotePlace) {
    const place = remotePlace[1]!.trim();
    const country = lookupCountry(place);
    if (country) {
      return { country, isRemote: true, label: text };
    }
    // Prefer known cities over same-named states ("New York")
    const knownCity = CITY_LOOKUP.get(normalizeCityKey(place));
    if (knownCity) {
      return {
        city: knownCity,
        state: homeStateForCity(knownCity),
        country: countryForStateCode(homeStateForCity(knownCity) ?? ''),
        isRemote: true,
        label: text,
      };
    }
    const state = lookupUsState(place);
    if (state) {
      return { state, country: 'USA', isRemote: true, label: text };
    }
    // "Remote - Seattle" → city (+ inferred state when known)
    if (isCityCandidate(place) && !isJunkPlace(place)) {
      const city = canonicalizeCity(place) ?? titleCaseCity(place);
      const inferred = homeStateForCity(city);
      return {
        city,
        state: inferred,
        country: countryForStateCode(inferred ?? ''),
        isRemote: true,
        label: text,
      };
    }
    return { isRemote: true, label: text };
  }

  // Single token: country, known city, state, or unknown city
  if (!text.includes(',')) {
    const country = lookupCountry(text);
    if (country) return { country, isRemote: defaults.isRemote, label: text };

    // Prefer known city aliases over same-named states (e.g. "New York")
    const knownCity = CITY_LOOKUP.get(normalizeCityKey(text));
    if (knownCity) {
      const inferred = homeStateForCity(knownCity);
      return {
        city: knownCity,
        state: inferred,
        country: countryForStateCode(inferred ?? ''),
        isRemote: defaults.isRemote,
        label: text,
      };
    }

    const usState = lookupUsState(text);
    if (usState) {
      return { state: usState, country: 'USA', isRemote: defaults.isRemote, label: text };
    }

    const caProv = lookupCaProvince(text);
    if (caProv) {
      return { state: caProv, country: 'Canada', isRemote: defaults.isRemote, label: text };
    }

    // Likely a bare city name
    const city = canonicalizeCity(text);
    if (city) {
      return { city, isRemote: defaults.isRemote, label: text };
    }
    return null;
  }

  // Comma-separated: "City, ST" | "City, Country" | "City, State, Country"
  const parts = text.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) {
    const city = canonicalizeCity(parts[0]!) ?? undefined;
    const mid = parts[1]!;
    const last = parts[2]!;
    const state =
      lookupUsState(mid) ?? lookupCaProvince(mid) ?? undefined;
    let country =
      lookupCountry(last) ??
      (state && US_STATE_BY_CODE[state] ? 'USA' : undefined) ??
      (state && CA_PROVINCE_BY_CODE[state] ? 'Canada' : undefined) ??
      lookupCountry(mid) ??
      undefined;

    // If mid is a country and last isn't a country, swap interpretation
    if (!lookupUsState(mid) && !lookupCaProvince(mid) && lookupCountry(mid)) {
      return {
        city,
        country: lookupCountry(mid)!,
        isRemote: defaults.isRemote,
        label: text,
      };
    }

    return {
      city,
      state,
      country,
      isRemote: defaults.isRemote,
      label: text,
    };
  }

  if (parts.length === 2) {
    const left = parts[0]!;
    const right = parts[1]!;

    // "Remote-Friendly, United States"
    if (/^remote/i.test(left)) {
      const country = lookupCountry(right);
      if (country) return { country, isRemote: true, label: text };
    }

    const rightState = lookupUsState(right);
    const rightProvince = lookupCaProvince(right);
    const rightCountry = lookupCountry(right);
    const leftCountry = lookupCountry(left);
    const leftState = lookupUsState(left);

    // "San Francisco, CA" / "New York, NY" / "Washington, DC"
    if (rightState && isCityCandidate(left) && !leftCountry) {
      return {
        city: canonicalizeCity(left) ?? titleCaseCity(left),
        state: rightState,
        country: 'USA',
        isRemote: defaults.isRemote,
        label: text,
      };
    }

    // "Toronto, ON"
    if (rightProvince && isCityCandidate(left) && !leftCountry) {
      return {
        city: canonicalizeCity(left) ?? titleCaseCity(left),
        state: rightProvince,
        country: 'Canada',
        isRemote: defaults.isRemote,
        label: text,
      };
    }

    // "London, UK" / "Dublin, IE" / "Paris, France"
    if (rightCountry && isCityCandidate(left) && !leftState) {
      const leftProv = lookupCaProvince(left);
      const leftSt = lookupUsState(left);
      if (leftProv || leftSt) {
        return {
          state: leftProv ?? leftSt,
          country: rightCountry,
          isRemote: defaults.isRemote,
          label: text,
        };
      }
      return {
        city: canonicalizeCity(left) ?? titleCaseCity(left),
        country: rightCountry,
        isRemote: defaults.isRemote,
        label: text,
      };
    }

    // "California, USA" / "Ontario, Canada"
    if ((leftState || lookupCaProvince(left)) && rightCountry) {
      return {
        state: leftState ?? lookupCaProvince(left),
        country: rightCountry,
        isRemote: defaults.isRemote,
        label: text,
      };
    }

    // Ambiguous: if right looks like country code used as state wrongly
    if (rightCountry && !isCityCandidate(left)) {
      return { country: rightCountry, isRemote: defaults.isRemote, label: text };
    }
  }

  return null;
}

function splitLocationSegments(text: string): string[] {
  // Split on | ; / and " or " but keep commas inside segments for "City, ST"
  return text
    .split(/\s*[|;]\s*/)
    .flatMap((chunk) =>
      chunk
        .split(/\s*\/\s*|\s+or\s+/i)
        .map((s) => s.trim())
        .filter(Boolean),
    )
    .flatMap((chunk) => {
      // Also split "City, ST, City, ST" patterns that use commas between places
      // Heuristic: if there are 4+ comma parts alternating city/state, split into pairs
      const parts = chunk.split(',').map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 4 && parts.length % 2 === 0) {
        const pairs: string[] = [];
        let allPairsLookValid = true;
        for (let i = 0; i < parts.length; i += 2) {
          const city = parts[i]!;
          const region = parts[i + 1]!;
          if (
            isCityCandidate(city) &&
            (lookupUsState(region) || lookupCaProvince(region) || lookupCountry(region))
          ) {
            pairs.push(`${city}, ${region}`);
          } else {
            allPairsLookValid = false;
            break;
          }
        }
        if (allPairsLookValid) return pairs;
      }
      return [chunk.trim()];
    })
    .filter(Boolean);
}

function lookupUsState(value: string): string | undefined {
  const v = value.trim();
  if (!v) return undefined;
  const upper = v.toUpperCase();
  if (US_STATE_BY_CODE[upper] && upper.length === 2) return US_STATE_BY_CODE[upper];
  return US_STATE_BY_NAME[v.toLowerCase()];
}

function lookupCaProvince(value: string): string | undefined {
  const v = value.trim();
  if (!v) return undefined;
  const upper = v.toUpperCase();
  if (CA_PROVINCE_BY_CODE[upper] && upper.length === 2) return CA_PROVINCE_BY_CODE[upper];
  return CA_PROVINCE_BY_NAME[v.toLowerCase()];
}

function lookupCountry(value: string): string | undefined {
  const v = value.trim().toLowerCase();
  if (!v) return undefined;
  // Do not treat bare "CA" / "GA" etc. as countries — those are US states in job boards
  if (v.length === 2 && AMBIGUOUS_CODES.has(v.toUpperCase())) return undefined;
  if (v === 'ca') return undefined; // prefer not to map bare CA → Canada in this domain
  return COUNTRY_LOOKUP.get(v);
}

function normalizeCountry(value: string): string | undefined {
  return lookupCountry(value);
}

function isJunkPlace(value: string): boolean {
  const v = value.trim().toLowerCase();
  return (
    /^(n\/a|n\.a\.|na|none|null|unknown|tbd|us-remote|us-ny|us-sf|anywhere)$/i.test(
      v,
    ) || /^us-[a-z]{2}$/i.test(v)
  );
}

function isPlausibleCityName(value: string): boolean {
  const v = value.trim();
  if (v.length < 2 || v.length > 60) return false;
  if (isJunkPlace(v)) return false;
  if (/^remote/i.test(v)) return false;
  if (lookupCountry(v)) return false;
  if (lookupUsState(v)) return false;
  if (lookupCaProvince(v)) return false;
  if (/friendly|travel|required|hybrid|onsite/i.test(v)) return false;
  // Must contain a letter
  if (!/[a-zA-Z]/.test(v)) return false;
  return true;
}

/** Looser check for the left side of "City, ST" — allows New York / Washington. */
function isCityCandidate(value: string): boolean {
  const v = value.trim();
  if (v.length < 2 || v.length > 60) return false;
  if (isJunkPlace(v)) return false;
  if (/^remote/i.test(v)) return false;
  if (lookupCountry(v)) return false;
  if (/friendly|travel|required|hybrid|onsite/i.test(v)) return false;
  if (!/[a-zA-Z]/.test(v)) return false;
  return true;
}

function titleCaseCity(value: string): string {
  // Preserve known patterns like "New York City"
  return value
    .split(/\s+/)
    .map((w) => {
      if (/^[A-Z]{2,}$/.test(w)) return w; // NYC-style already capped acronyms stay
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function normalizeWorkplace(
  hint: string | undefined,
  isRemote: boolean,
  lowerRaw: string,
): WorkplaceType {
  const h = (hint ?? '').toLowerCase();
  if (h === 'remote' || isRemote) return 'Remote';
  if (h === 'hybrid' || /\bhybrid\b/.test(lowerRaw)) return 'Hybrid';
  if (h === 'onsite' || h === 'inoffice' || h === 'office') return 'InOffice';
  return isRemote ? 'Remote' : 'Unknown';
}

function formatSegment(p: SegmentParse): string {
  if (p.city && p.state) return `${p.city}, ${p.state}`;
  if (p.city && p.country) return `${p.city}, ${p.country}`;
  if (p.city) return p.city;
  if (p.state && p.country) return `${p.state}, ${p.country}`;
  if (p.country) return p.country;
  return p.label;
}

function emptyParsed(
  raw: string,
  isRemote: boolean,
  workplaceType?: WorkplaceType,
): ParsedLocation {
  return {
    raw,
    isRemote,
    workplaceType,
    allCities: [],
    allStates: [],
    allCountries: [],
  };
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = normalizeCityKey(v);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

/** True if a string is safe to show in the City filter dropdown. */
export function isFilterCity(value: string | undefined | null): boolean {
  if (!value) return false;
  if (value.includes('|') || value.includes(';') || value.includes('/')) return false;
  if (/\bor\b/i.test(value)) return false;
  const canonical = canonicalizeCity(value);
  // Only accept the canonical label (collapses NYC / new-york / New York City)
  return Boolean(canonical && canonical === value);
}

/** True if a string is a US state or CA province code/name suitable for State filter. */
export function isFilterState(value: string | undefined | null): boolean {
  if (!value) return false;
  return Boolean(lookupUsState(value) || lookupCaProvince(value));
}

/**
 * Collapse US state / CA province codes and names to a canonical 2-letter code
 * (e.g. "New York" / "NY" → "NY", "Ontario" / "ON" → "ON").
 */
export function canonicalizeState(
  value: string | undefined | null,
): string | undefined {
  if (!value) return undefined;
  return lookupUsState(value) ?? lookupCaProvince(value);
}

/** True if a string is a known/canonical country for the Country filter. */
export function isFilterCountry(value: string | undefined | null): boolean {
  if (!value) return false;
  if (value.length > 40) return false;
  if (value.includes('|') || value.includes(';') || value.includes('/')) return false;
  if (/\bor\b/i.test(value)) return false;
  // Must be a known country — never invent from title-case city names
  const known = lookupCountry(value);
  return Boolean(known && known === value);
}

/** Full US state + CA province names for State filter (not limited to loaded jobs). */
export function filterStateOptions(): string[] {
  return [
    ...Object.keys(US_STATE_BY_NAME).map(titleCaseRegion),
    ...Object.keys(CA_PROVINCE_BY_NAME).map(titleCaseRegion),
  ].sort((a, b) => a.localeCompare(b));
}

/** "new york" → "New York"; keeps small words like "of"/"and" lowercase mid-phrase. */
function titleCaseRegion(name: string): string {
  const small = new Set(['of', 'and', 'the']);
  return name
    .split(/\s+/)
    .map((word, i) => {
      if (i > 0 && small.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

/** Known countries for Country filter (not limited to loaded jobs). */
export function filterCountryOptions(): string[] {
  return Object.keys(COUNTRY_ALIASES).sort((a, b) => a.localeCompare(b));
}

/**
 * City filter options: canonical aliases plus any cities present on loaded jobs.
 */
export function filterCityOptions(fromJobs: string[] = []): string[] {
  const set = new Set<string>();
  for (const c of Object.keys(CITY_ALIASES)) {
    if (isFilterCity(c)) set.add(c);
  }
  for (const raw of fromJobs) {
    const c = canonicalizeCity(raw);
    if (c && isFilterCity(c)) set.add(c);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/**
 * Re-normalize a stored job location from its raw string (fixes legacy bad parses).
 */
export function normalizeStoredLocation(location: {
  raw?: string;
  city?: string;
  state?: string;
  country?: string;
  isRemote?: boolean;
  workplaceType?: string;
  secondaryLocations?: string[];
}): ParsedLocation {
  const raw = location.raw?.trim() || '';
  if (raw) {
    return parseLocation(raw, {
      isRemote: location.isRemote,
      workplaceType: location.workplaceType,
    });
  }
  // No raw — validate existing fields
  const city = canonicalizeCity(location.city);
  const state = isFilterState(location.state)
    ? lookupUsState(location.state!) ?? lookupCaProvince(location.state!) ?? location.state
    : undefined;
  const country = location.country ? lookupCountry(location.country) : undefined;
  return {
    raw: location.raw ?? 'Unknown',
    city,
    state,
    country,
    isRemote: Boolean(location.isRemote),
    workplaceType: (location.workplaceType as WorkplaceType) ?? 'Unknown',
    secondaryLocations: location.secondaryLocations,
    allCities: city ? [city] : [],
    allStates: state ? [state] : [],
    allCountries: country ? [country] : [],
  };
}
