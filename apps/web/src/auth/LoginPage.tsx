import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { BrandMark } from '../components/BrandMark';
import { useAuth } from './AuthContext';

export function LoginPage() {
  const { user, loading, signIn, signUp, configured } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    return <Navigate to={from} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'signin') await signIn(email.trim(), password);
      else await signUp(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-paper text-ink">
      <AzimuthBackground />
      <main className="relative mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
        <BrandMark size="hero" />
        <p className="mt-4 text-base text-ink-muted">
          New postings, logged within minutes.
        </p>

        {!configured ? (
          <p className="mt-10 border-t border-rule-faint pt-6 font-mono text-xs text-fault">
            Firebase env vars missing — see apps/web/.env
          </p>
        ) : (
          <form onSubmit={onSubmit} className="mt-10 space-y-6 border-t border-rule-faint pt-8">
            <label className="block">
              <span className="font-mono text-[11px] uppercase tracking-wide text-ink-muted">
                Email
              </span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full border-0 border-b border-rule bg-transparent px-0 py-2 text-ink outline-none focus:border-signal"
              />
            </label>
            <label className="block">
              <span className="font-mono text-[11px] uppercase tracking-wide text-ink-muted">
                Password
              </span>
              <input
                type="password"
                required
                minLength={6}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full border-0 border-b border-rule bg-transparent px-0 py-2 text-ink outline-none focus:border-signal"
              />
            </label>

            {error ? (
              <p className="font-mono text-xs text-fault">{error}</p>
            ) : null}

            <div className="flex items-center gap-6 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="bg-signal px-5 py-2 font-medium text-signal-ink disabled:opacity-60"
              >
                {submitting
                  ? '…'
                  : mode === 'signin'
                    ? 'Sign in'
                    : 'Create account'}
              </button>
              <button
                type="button"
                className="font-mono text-xs text-ink-muted underline-offset-4 hover:text-ink hover:underline"
                onClick={() =>
                  setMode((m) => (m === 'signin' ? 'signup' : 'signin'))
                }
              >
                {mode === 'signin' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}

function AzimuthBackground() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full text-ink opacity-[0.1]"
      aria-hidden
    >
      <defs>
        <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M48 0H0V48" fill="none" stroke="currentColor" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />
      <g transform="translate(70,80)">
        <circle cx="0" cy="0" r="120" fill="none" stroke="currentColor" strokeWidth="1" />
        <circle cx="0" cy="0" r="80" fill="none" stroke="currentColor" strokeWidth="0.75" />
        <circle cx="0" cy="0" r="40" fill="none" stroke="currentColor" strokeWidth="0.75" />
        <path d="M0 0 L0 -120 A120 120 0 0 1 120 0 Z" fill="var(--signal)" opacity="0.35" />
        <line x1="-130" y1="0" x2="130" y2="0" stroke="currentColor" strokeWidth="0.5" />
        <line x1="0" y1="-130" x2="0" y2="130" stroke="currentColor" strokeWidth="0.5" />
      </g>
    </svg>
  );
}
