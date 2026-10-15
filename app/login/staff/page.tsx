"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { initials, colorForId } from "@/lib/avatar";
import { PinModal } from "./pin-modal";
import { ACTIVE_RESTAURANT_KEY, type ActiveRestaurant } from "./session-key";
import { PageLoader } from "@/components/ui/loading";

type Employee = { id: string; name: string; role: string };

/**
 * Staff picker — step 2 of the prototype's login flow: "Select your name on staff to clock
 * in" (the HTML prototype's #loginScreen), matched card-for-card (avatar initials on a
 * deterministic color, name, role). Tapping a card opens the PIN modal (#pinOverlay).
 */
export default function StaffPickerPage() {
  const router = useRouter();
  const [restaurant, setRestaurant] = useState<ActiveRestaurant | null>(null);
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<Employee | null>(null);
  const [pinLoading, setPinLoading] = useState(false);
  const [pinError, setPinError] = useState("");

  useEffect(() => {
    const raw = sessionStorage.getItem(ACTIVE_RESTAURANT_KEY);
    if (!raw) {
      router.replace("/login");
      return;
    }
    const active: ActiveRestaurant = JSON.parse(raw);
    setRestaurant(active);

    fetch(`/api/staff/employees?slug=${encodeURIComponent(active.slug)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load staff");
        setEmployees(data.employees);
      })
      .catch((e) => setLoadError(e.message));
  }, [router]);

  function goBack() {
    sessionStorage.removeItem(ACTIVE_RESTAURANT_KEY);
    router.push("/login");
  }

  async function submitPin(pin: string) {
    if (!restaurant || !selected) return;
    setPinLoading(true);
    setPinError("");
    const res = await fetch("/api/staff/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ restaurantSlug: restaurant.slug, employeeId: selected.id, pin }),
    });
    const data = await res.json();
    setPinLoading(false);
    if (!res.ok) {
      setPinError(data.error || "Incorrect PIN — try again");
      return;
    }
    router.push("/dashboard");
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
          <span className="font-display italic font-bold text-white text-[23px]">RF</span>
        </div>
        <h1 className="font-display text-[27px] font-semibold tracking-tight text-ink-strong">
          {restaurant?.name || "Restro Pro"}
        </h1>
        <p className="text-ink-faint text-sm mt-2">Select your name on staff to clock in</p>
      </div>

      {loadError && (
        <div className="relative z-10 text-center">
          <p className="text-crimson-400 text-sm mb-3">{loadError}</p>
          <button onClick={goBack} className="text-xs text-ink-faint hover:text-ink-strong underline">
            ← Back to login
          </button>
        </div>
      )}

      {!loadError && employees === null && (
        <div className="relative z-10">
          <PageLoader label="Loading staff…" />
        </div>
      )}

      {!loadError && employees !== null && employees.length === 0 && (
        <div className="relative z-10 text-center">
          <p className="text-ink-faint text-sm mb-3">No active staff found for this restaurant yet.</p>
          <button onClick={goBack} className="text-xs text-ink-faint hover:text-ink-strong underline">
            ← Back to login
          </button>
        </div>
      )}

      {!loadError && employees !== null && employees.length > 0 && (
        <>
          <div className="relative z-10 grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-3.5 max-w-[660px]">
            {employees.map((emp, i) => (
              <button
                key={emp.id}
                onClick={() => {
                  setSelected(emp);
                  setPinError("");
                }}
                style={{ animationDelay: `${i * 50}ms` }}
                className="emp-card-in bg-surface border border-line rounded-2xl px-3 py-5 text-center shadow-lg transition-transform hover:-translate-y-1 hover:border-chili-500"
              >
                <div
                  className="w-14 h-14 mx-auto mb-3 rounded-full flex items-center justify-center font-display font-bold text-[17px] text-white"
                  style={{ background: colorForId(emp.id) }}
                >
                  {initials(emp.name)}
                </div>
                <div className="font-semibold text-[13.5px] text-ink-strong">{emp.name}</div>
                <div className="text-ink-faint text-[11px] mt-0.5 uppercase tracking-wide capitalize">{emp.role}</div>
              </button>
            ))}
          </div>
          <button onClick={goBack} className="relative z-10 text-xs text-ink-faint hover:text-ink-strong underline mt-8">
            Not your restaurant? Go back
          </button>
        </>
      )}

      {selected && (
        <PinModal
          employeeName={selected.name}
          onSubmit={submitPin}
          onClose={() => setSelected(null)}
          loading={pinLoading}
          error={pinError}
        />
      )}
    </main>
  );
}
