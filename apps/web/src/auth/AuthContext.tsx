import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { getFirebase, isFirebaseConfigured } from '../lib/firebase';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isFirebaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(configured);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }
    const { auth } = getFirebase();
    return onAuthStateChanged(auth, async (next) => {
      setUser(next);
      if (next) {
        const token = await next.getIdTokenResult();
        setIsAdmin(token.claims.admin === true);
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    });
  }, [configured]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isAdmin,
      configured,
      async signIn(email, password) {
        const { auth } = getFirebase();
        await signInWithEmailAndPassword(auth, email, password);
      },
      async signUp(email, password) {
        const { auth } = getFirebase();
        await createUserWithEmailAndPassword(auth, email, password);
      },
      async signOut() {
        const { auth } = getFirebase();
        await firebaseSignOut(auth);
      },
    }),
    [user, loading, isAdmin, configured],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
