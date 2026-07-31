import { useEffect, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { getFirebase, isFirebaseConfigured } from '../lib/firebase';

export type AppliedStatus = 'applied' | 'not_applied';

export function useJobStatus(uid: string | undefined) {
  const [statusMap, setStatusMap] = useState<Map<string, AppliedStatus>>(
    () => new Map(),
  );

  useEffect(() => {
    if (!uid || !isFirebaseConfigured()) {
      setStatusMap(new Map());
      return;
    }
    const { db } = getFirebase();
    return onSnapshot(collection(db, 'users', uid, 'jobStatus'), (snap) => {
      const next = new Map<string, AppliedStatus>();
      for (const d of snap.docs) {
        const status = d.data().status as AppliedStatus | undefined;
        if (status) next.set(d.id, status);
      }
      setStatusMap(next);
    });
  }, [uid]);

  async function toggleApplied(jobId: string) {
    if (!uid) return;
    const { db } = getFirebase();
    const current = statusMap.get(jobId) ?? 'not_applied';
    const next: AppliedStatus =
      current === 'applied' ? 'not_applied' : 'applied';
    await setDoc(
      doc(db, 'users', uid, 'jobStatus', jobId),
      {
        jobId,
        status: next,
        appliedAt: next === 'applied' ? serverTimestamp() : null,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  return { statusMap, toggleApplied };
}
