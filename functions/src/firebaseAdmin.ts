import {
  getApps,
  initializeApp,
  type App,
} from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

/**
 * Always resolve an App instance explicitly and pass it to getFirestore(app).
 * Avoids "default Firebase app does not exist" when getApps()/getFirestore()
 * briefly disagree (common with Cloud Functions + modular admin SDK).
 */
function getAdminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  return initializeApp();
}

/** Ensure the Admin SDK app exists, then return Firestore. */
export function getDb(): Firestore {
  return getFirestore(getAdminApp());
}

/** Call once at function cold start (idempotent). */
export function initAdmin(): void {
  getAdminApp();
}
