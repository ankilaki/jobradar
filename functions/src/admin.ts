import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import type { Ats } from '@jobradar/shared';
import { detectBoardAts, testBoard, type DetectableAts } from './boardDetect.js';
import {
  humanizeToken,
  parseBoardTokens,
  slugifyToken,
} from './companyTokens.js';
import { getDb } from './firebaseAdmin.js';
import {
  isExplicitLinkedInToken,
  parseLinkedInCompanyToken,
  testLinkedInCompany,
} from './sources/linkedin.js';

export { humanizeToken, parseBoardTokens, slugifyToken } from './companyTokens.js';
export { ashbyTokenCandidates, detectBoardAts } from './boardDetect.js';

const ATS_VALUES: Ats[] = ['ashby', 'greenhouse', 'lever', 'linkedin'];

function assertAdmin(auth: { token?: Record<string, unknown> } | undefined) {
  if (!auth?.token || auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin claim required');
  }
}

function isAts(value: string): value is Ats {
  return (ATS_VALUES as string[]).includes(value);
}

function isDetectableAts(value: string): value is DetectableAts {
  return value === 'ashby' || value === 'greenhouse' || value === 'lever';
}

async function upsertCompanyDoc(
  uid: string,
  data: {
    id: string;
    name: string;
    ats: Ats;
    boardToken: string;
    careersUrl?: string;
    active?: boolean;
  },
): Promise<string> {
  const db = getDb();
  const ref = db.collection('companies').doc(data.id);
  const existing = await ref.get();
  await ref.set(
    {
      name: data.name,
      ats: data.ats,
      boardToken: data.boardToken,
      careersUrl: data.careersUrl ?? null,
      active: data.active !== false,
      updatedAt: FieldValue.serverTimestamp(),
      ...(existing.exists
        ? {}
        : {
            createdAt: FieldValue.serverTimestamp(),
            createdBy: uid,
          }),
    },
    { merge: true },
  );
  return data.id;
}

export const adminTestCompanyBoard = onCall(async (request) => {
  assertAdmin(request.auth);
  getDb();
  const { ats, boardToken } = request.data as {
    ats?: string;
    boardToken?: string;
  };
  if (!boardToken?.trim()) {
    throw new HttpsError('invalid-argument', 'boardToken required');
  }
  const token = boardToken.trim();

  if (ats === 'linkedin' || (!ats && isExplicitLinkedInToken(token))) {
    return testLinkedInCompany(token);
  }

  if (!ats || ats === 'auto') {
    const detected = await detectBoardAts(token);
    if (detected.ok) return detected;
    const linkedIn = await testLinkedInCompany(token);
    if (linkedIn.ok) {
      return {
        ok: true as const,
        ats: 'linkedin' as const,
        boardToken: linkedIn.resolvedToken,
        jobCount: linkedIn.jobCount,
        sampleTitles: linkedIn.sampleTitles,
      };
    }
    return {
      ok: false as const,
      error:
        'No Ashby, Greenhouse, Lever, or LinkedIn board found for this token',
    };
  }
  if (!isDetectableAts(ats) && ats !== 'linkedin') {
    throw new HttpsError(
      'invalid-argument',
      'ats must be ashby, greenhouse, lever, linkedin, or auto',
    );
  }
  if (ats === 'linkedin') {
    return testLinkedInCompany(token);
  }
  const result = await testBoard(ats, token);
  if (!result.ok) return result;
  return {
    ok: true as const,
    ats,
    boardToken: result.resolvedToken,
    jobCount: result.jobCount,
    sampleTitles: result.sampleTitles,
  };
});

export const adminUpsertCompany = onCall(async (request) => {
  assertAdmin(request.auth);
  getDb();
  const data = request.data as {
    id?: string;
    name?: string;
    ats?: Ats;
    boardToken?: string;
    careersUrl?: string;
    active?: boolean;
  };
  if (!data.id || !data.name || !data.ats || !data.boardToken) {
    throw new HttpsError(
      'invalid-argument',
      'id, name, ats, boardToken required',
    );
  }
  if (!isAts(data.ats)) {
    throw new HttpsError('invalid-argument', 'invalid ats');
  }
  let boardToken = data.boardToken.trim();
  if (data.ats === 'linkedin') {
    const slug = parseLinkedInCompanyToken(boardToken);
    if (!slug) {
      throw new HttpsError('invalid-argument', 'Invalid LinkedIn company token');
    }
    boardToken = slug;
  }
  const id = await upsertCompanyDoc(request.auth!.uid, {
    id: data.id,
    name: data.name,
    ats: data.ats,
    boardToken,
    careersUrl: data.careersUrl,
    active: data.active,
  });
  return { ok: true, id };
});

/**
 * Add many companies at once from a comma-separated list of board tokens.
 * Auto-detects Greenhouse / Ashby / Lever, then falls back to LinkedIn.
 * Explicit `li:slug` or LinkedIn company URLs are treated as LinkedIn first.
 */
export const adminBulkUpsertCompanies = onCall(
  { timeoutSeconds: 540, memory: '512MiB' },
  async (request) => {
    try {
      assertAdmin(request.auth);
      getDb();
      const data = request.data as {
        ats?: Ats | 'auto';
        tokens?: string;
      };
      if (typeof data.tokens !== 'string') {
        throw new HttpsError('invalid-argument', 'tokens required');
      }
      const forceAts =
        data.ats && data.ats !== 'auto' && isAts(data.ats)
          ? data.ats
          : undefined;

      const tokens = parseBoardTokens(data.tokens);
      if (tokens.length === 0) {
        throw new HttpsError('invalid-argument', 'No board tokens provided');
      }
      if (tokens.length > 80) {
        throw new HttpsError(
          'invalid-argument',
          'Max 80 companies per bulk add',
        );
      }

      const added: Array<{ id: string; ats: string }> = [];
      const failed: Array<{ token: string; error: string }> = [];

      for (const token of tokens) {
        try {
          let ats: Ats;
          let boardToken = token;
          let id: string;
          let name: string;

          if (forceAts === 'linkedin' || isExplicitLinkedInToken(token)) {
            const check = await testLinkedInCompany(token);
            if (!check.ok) {
              failed.push({ token, error: check.error });
              continue;
            }
            ats = 'linkedin';
            boardToken = check.resolvedToken;
            id = slugifyToken(boardToken);
            name = humanizeToken(boardToken);
          } else if (forceAts && isDetectableAts(forceAts)) {
            const check = await testBoard(forceAts, token);
            if (!check.ok) {
              failed.push({
                token,
                error: `No ${forceAts} board found for this token`,
              });
              continue;
            }
            ats = forceAts;
            boardToken = check.resolvedToken;
            id = slugifyToken(token);
            name = humanizeToken(token);
          } else {
            const detected = await detectBoardAts(token);
            if (detected.ok) {
              ats = detected.ats;
              boardToken = detected.boardToken;
              id = slugifyToken(token);
              name = humanizeToken(token);
            } else {
              const linkedIn = await testLinkedInCompany(token);
              if (!linkedIn.ok) {
                failed.push({
                  token,
                  error:
                    'No Ashby, Greenhouse, Lever, or LinkedIn board found for this token',
                });
                continue;
              }
              ats = 'linkedin';
              boardToken = linkedIn.resolvedToken;
              id = slugifyToken(boardToken);
              name = humanizeToken(boardToken);
            }
          }

          await upsertCompanyDoc(request.auth!.uid, {
            id,
            name,
            ats,
            boardToken,
            active: true,
          });
          added.push({ id, ats });
        } catch (err) {
          failed.push({
            token,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      return {
        ok: true as const,
        added: added.map((a) => a.id),
        addedDetailed: added,
        failed,
      };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      console.error('adminBulkUpsertCompanies failed', err);
      throw new HttpsError(
        'internal',
        err instanceof Error ? err.message : 'Bulk add failed',
      );
    }
  },
);

export const adminSetCompanyActive = onCall(async (request) => {
  assertAdmin(request.auth);
  const { id, active } = request.data as { id?: string; active?: boolean };
  if (!id || typeof active !== 'boolean') {
    throw new HttpsError('invalid-argument', 'id and active required');
  }
  await getDb()
    .collection('companies')
    .doc(id)
    .set(
      { active, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  return { ok: true };
});

export const adminDeleteCompany = onCall(async (request) => {
  assertAdmin(request.auth);
  const { id } = request.data as { id?: string };
  if (!id) throw new HttpsError('invalid-argument', 'id required');
  await getDb().collection('companies').doc(id).delete();
  return { ok: true };
});

/** Exported for unit tests of the claim gate. */
export function requireAdminClaim(token: Record<string, unknown> | undefined) {
  if (!token || token.admin !== true) {
    throw new Error('permission-denied');
  }
}
