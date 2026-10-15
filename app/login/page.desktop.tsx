'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { invoke } from '@tauri-apps/api/core';
import { Spinner } from '@/components/ui/loading';

/**
 * Desktop version of the owner login: the same screen as the web app (brand mark, tagline,
 * card, background glow), but signing in ACTIVATES this computer instead of starting a browser
 * session — the owner's email + password are checked once online, the device token is stored in
 * the OS credential store, and after that cashiers sign in with their PIN only.
 */
export default function OwnerLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const router = useRouter();

  useEffect(() => {
    invoke('get_device_info')
      .then((info) => {
        if (info) router.replace('/login/staff');
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await invoke('activate_device', { email, password });
      router.push('/login/staff');
    } catch (err) {
      setError(typeof err === 'string' ? err : 'Could not activate this device');
    } finally {
      setLoading(false);
    }
  }

  if (checking) return null;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-5 py-10 relative overflow-hidden bg-canvas">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(650px 420px at 12% 8%, rgba(217,72,31,0.16), transparent 60%), radial-gradient(520px 400px at 88% 92%, rgba(63,110,82,0.10), transparent 60%)',
        }}
      />

      <div className="text-center mb-9 relative z-10">
        <div className="w-[58px] h-[58px] mx-auto mb-4 rounded-2xl bg-gradient-to-br from-chili-400 to-chili-600 flex items-center justify-center shadow-[0_14px_34px_-10px_rgba(217,72,31,0.6)]">
          <span className="font-display italic font-bold text-white text-[23px]">RP</span>
        </div>
        <h1 className="font-display text-[31px] font-semibold tracking-tight text-ink-strong">Restro Pro</h1>
        <div className="text-ink-faint text-[12.5px] mt-1 tracking-wide">Run Your Restaurant. Smarter.</div>
        <p className="text-ink-faint text-sm mt-3">Sign in with your restaurant account to set up this computer.</p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[360px] relative z-10 bg-surface border border-line rounded-2xl p-[26px] shadow-xl space-y-4"
      >
        <div>
          <label className="block text-xs font-semibold text-ink-mid mb-1.5">Restaurant email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@restaurant.com"
            required
            autoFocus
            className="w-full rounded-lg bg-raised border border-line px-3.5 py-2.5 text-sm text-ink-strong placeholder:text-ink-faint focus:outline-none focus:border-chili-500"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-ink-mid mb-1.5">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            className="w-full rounded-lg bg-raised border border-line px-3.5 py-2.5 text-sm text-ink-strong placeholder:text-ink-faint focus:outline-none focus:border-chili-500"
          />
        </div>
        <p className="text-[11px] text-crimson-400 min-h-[14px]">{error}</p>
        <button
          type="submit"
          disabled={loading}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-chili-500 hover:bg-chili-600 disabled:opacity-50 text-white text-[12.5px] font-bold py-2.5 mt-1.5 transition-colors"
        >
          {loading && <Spinner size={13} />}
          {loading ? 'Setting up…' : 'Continue'}
        </button>
      </form>

    </main>
  );
}
