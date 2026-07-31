import { describe, expect, it } from 'vitest';
import {
  humanizeToken,
  parseBoardTokens,
  slugifyToken,
} from '../companyTokens.js';

describe('parseBoardTokens', () => {
  it('splits commas, semicolons, and newlines', () => {
    expect(parseBoardTokens('stripe, anthropic; ashby\nnotion')).toEqual([
      'stripe',
      'anthropic',
      'ashby',
      'notion',
    ]);
  });

  it('dedupes case-insensitively', () => {
    expect(parseBoardTokens('Stripe, stripe, STRIPE')).toEqual(['Stripe']);
  });

  it('ignores empty segments', () => {
    expect(parseBoardTokens('  , stripe,  ,  ')).toEqual(['stripe']);
  });
});

describe('slugifyToken / humanizeToken', () => {
  it('slugifies board tokens for doc ids', () => {
    expect(slugifyToken('OpenAI')).toBe('openai');
    expect(slugifyToken('Acme Corp')).toBe('acme-corp');
  });

  it('humanizes for display names', () => {
    expect(humanizeToken('stripe')).toBe('Stripe');
    expect(humanizeToken('open-ai')).toBe('Open Ai');
  });
});
