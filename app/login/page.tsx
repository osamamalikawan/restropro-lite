"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ACTIVE_RESTAURANT_KEY } from "./staff/session-key";
import { Spinner } from "@/components/ui/loading";

/**
 * Restaurant owner login — step 1 of the prototype's two-step flow (see
 * app/(restaurant)/login/staff/page.tsx for step 2, the employee picker + PIN).
 * Matches the HTML prototype's #ownerLoginScreen 1:1: same brand mark, tagline, copy and
 * layout. The owner's real Supabase Auth email/password is checked once here purely to
 * resolve which restaurant they belong to (see /api/staff/resolve-restaurant) — it does not
 * leave a Supabase session on this shared till, matching the prototype's "PIN sessions only"
 * model (ARCHITECTURE.md).
 */
export default function OwnerLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Mirrors the prototype's inline bootstrap script: if a restaurant was already resolved
  // this session, skip straight to the staff picker instead of asking for the password again.
  useEffect(() => {
    if (sessionStorage.getItem(ACTIVE_RESTAURANT_KEY)) {
      router.replace("/login/staff");
    }
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/staff/resolve-restaurant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Incorrect email or password.");
      return;
    }
    sessionStorage.setItem(ACTIVE_RESTAURANT_KEY, JSON.stringify({ slug: data.slug, name: data.name }));
    router.push("/login/staff");
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-5 py-10 relative overflow-hidden bg-canvas">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(650px 420px at 12% 8%, rgba(217,72,31,0.16), transparent 60%), radial-gradient(520px 400px at 88% 92%, rgba(63,110,82,0.10), transparent 60%)",
        }}
      />

      <div className="text-center mb-9 relative z-10">
        <div className="w-[58px] h-[58px] mx-auto mb-4 rounded-2xl bg-gradient-to-br from-chili-400 to-chili-600 flex items-center justify-center shadow-[0_14px_34px_-10px_rgba(217,72,31,0.6)]">
          <span className="font-display italic font-bold text-white text-[23px]">RP</span>
        </div>
        <h1 className="font-display text-[31px] font-semibold tracking-tight text-ink-strong">Restro Pro</h1>
        <div className="text-ink-faint text-[12.5px] mt-1 tracking-wide">Run Your Restaurant. Smarter.</div>
        <p className="text-ink-faint text-sm mt-3">Sign in with your restaurant account to continue.</p>
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
          {loading ? "Checking…" : "Continue"}
        </button>
      </form>

    </main>
  );
}
