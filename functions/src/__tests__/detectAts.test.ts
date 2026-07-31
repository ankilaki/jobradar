import { describe, expect, it } from 'vitest';
import { ashbyTokenCandidates } from '../boardDetect.js';

describe('ashbyTokenCandidates', () => {
  it('tries raw, lower, and TitleCase variants', () => {
    expect(ashbyTokenCandidates('OpenAI')).toEqual([
      'OpenAI',
      'openai',
      'Openai',
    ]);
  });

  it('dedupes when already lowercase', () => {
    expect(ashbyTokenCandidates('stripe')).toEqual(['stripe', 'Stripe']);
  });
});
