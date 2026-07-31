/**
 * Grant the admin custom claim to a user (run once locally).
 * Usage:
 *   USER_UID=... npx tsx scripts/set-admin-claim.ts
 */
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function init() {
  if (getApps().length) return;
  try {
    initializeApp({ credential: applicationDefault() });
  } catch {
    const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!keyPath) {
      throw new Error(
        'Set GOOGLE_APPLICATION_CREDENTIALS or run application-default login',
      );
    }
    initializeApp({ credential: cert(keyPath) });
  }
}

async function main() {
  const uid = process.env.USER_UID;
  if (!uid) {
    throw new Error('Set USER_UID to the Firebase Auth uid to promote');
  }
  init();
  await getAuth().setCustomUserClaims(uid, { admin: true });
  console.log(`Granted admin claim to ${uid}. Sign out/in to refresh the token.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
