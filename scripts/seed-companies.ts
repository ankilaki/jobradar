/**
 * One-time seed of the companies master list.
 * Usage (from repo root, with GOOGLE_APPLICATION_CREDENTIALS or `firebase login`):
 *   npx tsx scripts/seed-companies.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cert, getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const here = dirname(fileURLToPath(import.meta.url));

function init() {
  if (getApps().length) return;
  try {
    initializeApp({ credential: applicationDefault() });
  } catch {
    const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!keyPath) {
      throw new Error(
        'Set GOOGLE_APPLICATION_CREDENTIALS or run `gcloud auth application-default login`',
      );
    }
    initializeApp({ credential: cert(keyPath) });
  }
}

async function main() {
  init();
  const companies = JSON.parse(
    readFileSync(join(here, 'companies.json'), 'utf8'),
  ) as Array<{
    id: string;
    name: string;
    ats: 'ashby' | 'greenhouse';
    boardToken: string;
    careersUrl?: string;
  }>;

  const db = getFirestore();
  for (const c of companies) {
    await db.collection('companies').doc(c.id).set(
      {
        name: c.name,
        ats: c.ats,
        boardToken: c.boardToken,
        careersUrl: c.careersUrl ?? null,
        active: true,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    console.log('upserted', c.id);
  }
  console.log(`Done — ${companies.length} companies`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
