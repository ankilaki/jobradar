import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query } from 'firebase/firestore';
import { getFirebase, isFirebaseConfigured } from '../lib/firebase';
import {
  companyLogoCandidates,
  type CompanyLogoSource,
} from './companyLogo';

export type CompanyInfo = CompanyLogoSource & {
  name: string;
  ats?: string;
  active?: boolean;
};

/**
 * One-shot company map for logos. Not a live listener — hourly sync used to
 * rewrite every company doc, and an onSnapshot here billed a read per write.
 */
export function useCompaniesMap() {
  const [byId, setById] = useState<Map<string, CompanyInfo>>(new Map());

  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    const { db } = getFirebase();
    const q = query(collection(db, 'companies'));
    void getDocs(q)
      .then((snap) => {
        const next = new Map<string, CompanyInfo>();
        for (const doc of snap.docs) {
          const data = doc.data();
          next.set(doc.id, {
            id: doc.id,
            name: String(data.name ?? doc.id),
            boardToken: data.boardToken as string | undefined,
            careersUrl: (data.careersUrl as string | null | undefined) ?? null,
            logoUrl: (data.logoUrl as string | null | undefined) ?? null,
            ats: data.ats as string | undefined,
            active: data.active as boolean | undefined,
          });
        }
        setById(next);
      })
      .catch(() => {
        /* logos are optional; feed still works without them */
      });
  }, []);

  const logoUrlsByCompanyId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const [id, company] of byId) {
      map.set(id, companyLogoCandidates(company));
    }
    return map;
  }, [byId]);

  return { byId, logoUrlsByCompanyId };
}
