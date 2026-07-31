/**
 * Location parsing lives in @jobradar/shared so the feed and sync engine
 * never drift. This module re-exports for functions-local imports.
 */
export {
  parseLocation,
  normalizeStoredLocation,
  isFilterCity,
  isFilterState,
  isFilterCountry,
} from '@jobradar/shared';
export type { ParsedLocation, WorkplaceType } from '@jobradar/shared';
