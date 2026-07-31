import { fetchAshbyBoard, summarizeAshbyBoard } from './sources/ashby.js';
import {
  fetchGreenhouseBoard,
  summarizeGreenhouseBoard,
} from './sources/greenhouse.js';
import { fetchLeverBoard, summarizeLeverBoard } from './sources/lever.js';
import type { Ats } from './types.js';

export type DetectableAts = Exclude<Ats, 'linkedin'>;

export async function testBoard(
  ats: DetectableAts,
  boardToken: string,
): Promise<
  | { ok: true; jobCount: number; sampleTitles: string[]; resolvedToken: string }
  | { ok: false; error: string }
> {
  const candidates =
    ats === 'ashby' ? ashbyTokenCandidates(boardToken) : [boardToken];

  let lastError = 'Unknown error';
  for (const candidate of candidates) {
    try {
      if (ats === 'ashby') {
        const jobs = await fetchAshbyBoard(candidate);
        return {
          ok: true as const,
          ...summarizeAshbyBoard(jobs),
          resolvedToken: candidate,
        };
      }
      if (ats === 'lever') {
        const jobs = await fetchLeverBoard(candidate);
        // Empty array is a valid Lever board (company exists); treat as ok
        return {
          ok: true as const,
          ...summarizeLeverBoard(jobs),
          resolvedToken: candidate,
        };
      }
      const jobs = await fetchGreenhouseBoard(candidate);
      return {
        ok: true as const,
        ...summarizeGreenhouseBoard(jobs),
        resolvedToken: candidate,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  return { ok: false as const, error: lastError };
}

/** Ashby board slugs are often case-sensitive — try a few variants. */
export function ashbyTokenCandidates(token: string): string[] {
  const raw = token.trim();
  if (!raw) return [];
  const lower = raw.toLowerCase();
  const titled = raw
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('');
  const out: string[] = [];
  for (const c of [raw, lower, titled]) {
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

/**
 * Probe Greenhouse, Ashby, and Lever.
 * Prefer more jobs; tie-break Greenhouse > Ashby > Lever.
 * Never selects LinkedIn (explicit tokens only).
 */
export async function detectBoardAts(boardToken: string): Promise<
  | {
      ok: true;
      ats: DetectableAts;
      boardToken: string;
      jobCount: number;
      sampleTitles: string[];
    }
  | { ok: false; error: string }
> {
  const [gh, ash, lev] = await Promise.all([
    testBoard('greenhouse', boardToken),
    testBoard('ashby', boardToken),
    testBoard('lever', boardToken),
  ]);

  type Ok = Extract<Awaited<ReturnType<typeof testBoard>>, { ok: true }>;
  const pick = (ats: DetectableAts, result: Ok) => ({
    ok: true as const,
    ats,
    boardToken: result.resolvedToken,
    jobCount: result.jobCount,
    sampleTitles: result.sampleTitles,
  });

  const candidates: Array<{ ats: DetectableAts; result: Ok }> = [];
  if (gh.ok) candidates.push({ ats: 'greenhouse', result: gh });
  if (ash.ok) candidates.push({ ats: 'ashby', result: ash });
  if (lev.ok && lev.jobCount > 0) {
    // Ignore empty Lever [] — many tokens 200 with [] for non-boards
    candidates.push({ ats: 'lever', result: lev });
  } else if (lev.ok && !gh.ok && !ash.ok && lev.jobCount === 0) {
    // Only accept empty Lever if nothing else matched and we got a real 200
    // (still weak — skip empty to avoid false positives)
  }

  if (candidates.length === 0) {
    return {
      ok: false,
      error: 'No Ashby, Greenhouse, or Lever board found for this token',
    };
  }

  candidates.sort((a, b) => {
    if (b.result.jobCount !== a.result.jobCount) {
      return b.result.jobCount - a.result.jobCount;
    }
    const rank = { greenhouse: 0, ashby: 1, lever: 2 };
    return rank[a.ats] - rank[b.ats];
  });

  const best = candidates[0]!;
  return pick(best.ats, best.result);
}
