"use client";
import { createContext, useContext } from "react";
import { invoke } from "@tauri-apps/api/core";
import { fmtTime } from "@/lib/format";

/** Who is signed in on this desktop and what they may open — assembled entirely from local data
 *  (the session held by the Rust side + the last sync), so it works offline. */
export type DesktopCtx = {
  employeeId: string;
  employeeName: string;
  role: string;
  restaurantId: string;
  restaurantName: string;
  subStatus: string;
  modulePerms: Record<string, boolean>;
  shiftLabel: string | null;
  isAdminOrManager: boolean;
  /** same rule as the server's hasModuleAccess(): admin sees everything */
  can: (module: string) => boolean;
};

type LocalSession = { employee_id: string; name: string; role: string; restaurant_id: string; restaurant_name: string };

// What a cashier gets if the first sync hasn't delivered the permission matrix yet.
const FALLBACK_PERMS: Record<string, boolean> = { dashboard: true, pos: true, sales: true, customers: true, tables: true };

export async function loadDesktopContext(): Promise<DesktopCtx | null> {
  const session = await invoke<LocalSession | null>("get_local_session");
  if (!session) return null;

  const [matrix, settings, meta] = await Promise.all([
    invoke<Record<string, Record<string, boolean>>>("get_cached_data", { kind: "permissions" }).catch(() => ({})),
    invoke<{ settings?: { shift_start?: string; shift_end?: string } }>("get_cached_data", { kind: "settings" }).catch(() => ({})),
    invoke<{ subStatus?: string }>("get_cached_data", { kind: "meta" }).catch(() => ({})),
  ]);

  const role = session.role;
  const modulePerms = role === "admin" ? {} : (matrix as Record<string, Record<string, boolean>>)[role] ?? FALLBACK_PERMS;
  const st = (settings as { settings?: { shift_start?: string; shift_end?: string } }).settings;

  return {
    employeeId: session.employee_id,
    employeeName: session.name,
    role,
    restaurantId: session.restaurant_id,
    restaurantName: session.restaurant_name,
    subStatus: (meta as { subStatus?: string }).subStatus ?? "active",
    modulePerms,
    shiftLabel: st?.shift_start && st?.shift_end ? `${fmtTime(st.shift_start)} – ${fmtTime(st.shift_end)}` : null,
    isAdminOrManager: role === "admin" || role === "manager",
    can: (module) => role === "admin" || !!modulePerms[module],
  };
}

/** Where to land after the PIN screen: the dashboard (same as the web app) when the role may
 *  open it, otherwise straight to the POS. */
export async function desktopHome(): Promise<string> {
  const ctx = await loadDesktopContext();
  return ctx && !ctx.can("dashboard") ? "/pos" : "/dashboard";
}

const Ctx = createContext<DesktopCtx | null>(null);
export const DesktopCtxProvider = Ctx.Provider;
export function useDesktopCtx() {
  return useContext(Ctx);
}
