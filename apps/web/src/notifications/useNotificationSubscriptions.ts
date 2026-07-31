import { useEffect, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { sanitizeJobFilter, type JobFilter } from '@jobradar/shared';
import { getFirebase, isFirebaseConfigured } from '../lib/firebase';

export interface NotificationSubscription {
  id: string;
  discordWebhookUrl: string;
  filter: JobFilter;
  active: boolean;
  createdAt?: unknown;
  lastNotifiedAt?: unknown;
}

export function useNotificationSubscriptions(uid: string | undefined) {
  const [subs, setSubs] = useState<NotificationSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid || !isFirebaseConfigured()) {
      setSubs([]);
      setLoading(false);
      return;
    }
    const { db } = getFirebase();
    return onSnapshot(
      collection(db, 'users', uid, 'notificationSubscriptions'),
      (snap) => {
        setSubs(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<NotificationSubscription, 'id'>),
          })),
        );
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );
  }, [uid]);

  async function save(input: {
    discordWebhookUrl: string;
    filter: JobFilter;
    active: boolean;
  }) {
    if (!uid) throw new Error('Not signed in');
    const { db } = getFirebase();
    await addDoc(collection(db, 'users', uid, 'notificationSubscriptions'), {
      discordWebhookUrl: input.discordWebhookUrl,
      filter: sanitizeJobFilter(input.filter),
      active: input.active,
      createdAt: serverTimestamp(),
      lastNotifiedAt: null,
    });
  }

  async function setActive(id: string, active: boolean) {
    if (!uid) return;
    const { db } = getFirebase();
    await updateDoc(
      doc(db, 'users', uid, 'notificationSubscriptions', id),
      { active },
    );
  }

  async function remove(id: string) {
    if (!uid) return;
    const { db } = getFirebase();
    await deleteDoc(doc(db, 'users', uid, 'notificationSubscriptions', id));
  }

  return { subs, loading, error, save, setActive, remove };
}
