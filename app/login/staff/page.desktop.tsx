'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { invoke } from '@tauri-apps/api/core';
import { initials, colorForId } from '@/lib/avatar';
import { desktopHome } from '@/lib/desktop/context';
import { rememberClockIn } from '@/lib/clock-in-hint';
import { PinModal } from './pin-modal';
import { PageLoader } from '@/components/ui/loading';

type Employee = { id: string; name: string; role: string };

/**
 * Desktop version of the staff picker: the same screen as the web app (avatar cards, shared PIN
 * modal and keypad) with the staff list and PIN check coming from this device — the list from the
 * last sync, the PIN verified locally — so it works with no internet.
 */
export default function StaffPickerPage() {
  const router = useRouter();
  const [restaurantName, setRestaurantName] = useState('');
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState<Employee | null>(null);
  const [pinLoading, setPinLoading] = useState(false);
  const [pinError, setPinError] = useState('');
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    invoke<{ restaurant_name: string } | null>('get_device_info')
      .then((info) => {
        if (!info) {
          router.replace('/login');
          return;
        }
        setRestaurantName(info.restaurant_name);
        return invoke<Employee[]>('get_cached_staff_list').then(setEmployees);
      })
      .catch((e) => setLoadError(typeof e === 'string' ? e : 'Could not load staff'));
  }, [router]);

  async function submitPin(pin: string) {
    if (!selected) return;
    setPinLoading(true);
    setPinError('');
    try {
      await invoke('verify_staff_pin', { employeeId: selected.id, pin });
      // Clock in: remember the time on this device and tell the server (skipped silently when offline).
      const clockIn = rememberClockIn(selected.id);
      fetch('/api/staff/clock-in', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clockIn }) }).catch(() => {});
      router.push(await desktopHome());
    } catch (err) {
      setPinError(typeof err === 'string' ? err : 'Incorrect PIN — try again');
    } finally {
      setPinLoading(false);
    }
  }

  async function switchRestaurant() {
    if (!confirm('This signs this till out completely. The owner will need to log in again to reactivate it. Continue?')) return;
    setResetting(true);
    try {
      await invoke('deactivate_device');
      router.push('/login');
    } catch (err) {
      setLoadError(typeof err === 'string' ? err : 'Could not reset this device');
      setResetting(false);
    }
  }

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
        <h1 className="font-display text-[27px] font-semibold tracking-tight text-ink-strong">
          {restaurantName || 'Restro Pro'}
        </h1>
        <p className="text-ink-faint text-sm mt-2">Select your name on staff to clock in</p>
      </div>

      {loadError && (
        <div className="relative z-10 text-center">
          <p className="text-crimson-400 text-sm">{loadError}</p>
        </div>
      )}

      {!loadError && employees === null && (
        <div className="relative z-10">
          <PageLoader label="Loading staff…" />
        </div>
      )}

      {!loadError && employees !== null && employees.length === 0 && (
        <div className="relative z-10 text-center max-w-[320px]">
          <p className="text-ink-faint text-sm">
            No staff on this computer yet. Connect to the internet and open Sync to download your team.
          </p>
        </div>
      )}

      {!loadError && employees !== null && employees.length > 0 && (
        <div className="relative z-10 grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-3.5 max-w-[660px]">
          {employees.map((emp, i) => (
            <button
              key={emp.id}
              onClick={() => {
                setSelected(emp);
                setPinError('');
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
      )}

      <button
        onClick={switchRestaurant}
        disabled={resetting}
        className="relative z-10 text-xs text-ink-faint hover:text-ink-strong underline mt-8 disabled:opacity-50"
      >
        {resetting ? 'Resetting…' : 'Restaurant login'}
      </button>

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