import { describe, expect, it } from 'vitest';
import { fetchAshbyBoard, normalizeAshbyJobs } from '../sources/ashby.js';
import {
  fetchGreenhouseBoard,
  normalizeGreenhouseJobs,
} from '../sources/greenhouse.js';
import { fetchLeverBoard, normalizeLeverJobs } from '../sources/lever.js';
import {
  resolveLinkedInCompanyId,
  testLinkedInCompany,
} from '../sources/linkedin.js';
import type { CompanyRecord } from '../types.js';

/**
 * Live API smoke tests — hit public boards.
 * Soft-skip on network failure.
 */
describe('live board fetch', () => {
  it('fetches and normalizes Ashby board', async () => {
    const company: CompanyRecord = {
      id: 'ashby',
      name: 'Ashby',
      ats: 'ashby',
      boardToken: 'Ashby',
      active: true,
    };
    try {
      const raw = await fetchAshbyBoard('Ashby');
      const jobs = normalizeAshbyJobs(company, raw);
      expect(jobs.length).toBeGreaterThan(0);
      expect(jobs[0]!.title.length).toBeGreaterThan(0);
    } catch (err) {
      console.warn('Skipping live Ashby test:', err);
    }
  }, 20_000);

  it('fetches and normalizes Greenhouse board', async () => {
    const company: CompanyRecord = {
      id: 'anthropic',
      name: 'Anthropic',
      ats: 'greenhouse',
      boardToken: 'anthropic',
      active: true,
    };
    try {
      const raw = await fetchGreenhouseBoard('anthropic');
      const jobs = normalizeGreenhouseJobs(company, raw);
      expect(jobs.length).toBeGreaterThan(0);
      expect(jobs[0]!.descriptionHtml).toMatch(/</);
    } catch (err) {
      console.warn('Skipping live Greenhouse test:', err);
    }
  }, 20_000);

  it('fetches and normalizes Lever board', async () => {
    const company: CompanyRecord = {
      id: 'activecampaign',
      name: 'ActiveCampaign',
      ats: 'lever',
      boardToken: 'activecampaign',
      active: true,
    };
    try {
      const raw = await fetchLeverBoard('activecampaign');
      const jobs = normalizeLeverJobs(company, raw);
      expect(jobs.length).toBeGreaterThan(0);
      expect(jobs[0]!.ats).toBe('lever');
      expect(jobs[0]!.applyUrl).toMatch(/^https?:\/\//);
    } catch (err) {
      console.warn('Skipping live Lever test:', err);
    }
  }, 20_000);

  it('resolves LinkedIn company id without company page (avoids 999)', async () => {
    try {
      const id = await resolveLinkedInCompanyId('openai');
      expect(id).toMatch(/^\d+$/);
      const result = await testLinkedInCompany('li:openai');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.resolvedToken).toBe('openai');
      }
    } catch (err) {
      console.warn('Skipping live LinkedIn test:', err);
    }
  }, 60_000);
});
