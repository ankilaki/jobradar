import { useEffect, useState } from 'react';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { getFirebase, isFirebaseConfigured } from '../lib/firebase';
import type { Job } from './types';

export function useJobsQuery() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setLoading(false);
      setError('Firebase not configured');
      return;
    }
    const { db } = getFirebase();
    const q = query(
      collection(db, 'jobs'),
      where('isActive', '==', true),
      orderBy('firstSeenAt', 'desc'),
      limit(2000),
    );
    return onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Job);
        setJobs(next);
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );
  }, []);

  return { jobs, loading, error };
}
