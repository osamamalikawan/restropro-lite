import type { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_SHIFT_END, DEFAULT_SHIFT_START, nextShiftEnd } from "@/lib/shift-times";

type Admin = ReturnType<typeof createAdminClient>;

export type AttendanceRow = {
  id: string;
  employee_id: string;
  employee_name: string | null;
  clock_in_at: string;
  clock_out_at: string | null;
  status: "open" | "closed";
  minutes: number | null;
  source: "manual" | "app";
  auto_closed: boolean;
  note: string | null;
  marked_by_name: string | null;
};

export const ATTENDANCE_COLUMNS =
  "id, employee_id, employee_name, clock_in_at, clock_out_at, status, minutes, source, auto_closed, note, marked_by_name";

/** The attendance table comes from migration 0025; until it is run the app keeps working without it. */
export const isMissingAttendanceTable = (err: { message?: string } | null | undefined) => !!err?.message && /attendance_records/i.test(err.message);
export const ATTENDANCE_MIGRATION_WARNING = "Attendance is not set up yet - run migration 0025_riders_attendance.sql in Supabase.";

const minutesBetween = (a: string | number, b: string | number) => Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000));

/** Shift timings (Permissions page) and the restaurant's UTC offset. */
export async function getShiftConfig(admin: Admin, restaurantId: string) {
  const { data } = await admin.from("restaurant_settings").select("*").eq("restaurant_id", restaurantId).maybeSingle();
  const off = Number(data?.utc_offset_minutes);
  return {
    start: String(data?.shift_start ?? DEFAULT_SHIFT_START).slice(0, 5),
    end: String(data?.shift_end ?? DEFAULT_SHIFT_END).slice(0, 5),
    tz: Number.isFinite(off) ? off : 300,
    hasTz: Number.isFinite(off),
  };
}

/** "Auto clock-out at the end of the shift": every record still open whose shift has ended is closed at the moment
 *  that shift ended (not now), flagged auto_closed. Cheap enough to call whenever attendance is read. */
export async function closeExpiredAttendance(admin: Admin, restaurantId: string): Promise<void> {
  const { data: open, error } = await admin
    .from("attendance_records")
    .select("id, clock_in_at")
    .eq("restaurant_id", restaurantId)
    .eq("status", "open")
    .limit(500);
  if (error || !open?.length) return;
  const cfg = await getShiftConfig(admin, restaurantId);
  const now = Date.now();
  for (const r of open as { id: string; clock_in_at: string }[]) {
    const end = nextShiftEnd(Date.parse(r.clock_in_at), cfg.start, cfg.end, cfg.tz);
    if (end <= now) {
      await admin
        .from("attendance_records")
        .update({ clock_out_at: new Date(end).toISOString(), status: "closed", minutes: minutesBetween(r.clock_in_at, end), auto_closed: true })
        .eq("id", r.id)
        .eq("status", "open");
    }
  }
}

/** Clock an employee in (no-op, returning the open record, when they already are). `at` may be back-dated. */
export async function clockInEmployee(
  admin: Admin,
  o: { restaurantId: string; employeeId: string; at?: string | null; source: "manual" | "app"; markedBy?: string | null; note?: string | null }
): Promise<{ record?: AttendanceRow; already?: boolean; error?: string }> {
  const { data: open, error } = await admin
    .from("attendance_records")
    .select(ATTENDANCE_COLUMNS)
    .eq("restaurant_id", o.restaurantId)
    .eq("employee_id", o.employeeId)
    .eq("status", "open")
    .limit(1);
  if (error) return { error: isMissingAttendanceTable(error) ? ATTENDANCE_MIGRATION_WARNING : error.message };
  if (open?.length) return { record: open[0] as AttendanceRow, already: true };

  const { data: emp } = await admin.from("employees").select("name").eq("id", o.employeeId).eq("restaurant_id", o.restaurantId).maybeSingle();
  if (!emp) return { error: "Employee not found" };
  const at = o.at ? Date.parse(o.at) : Date.now();
  if (!Number.isFinite(at) || at > Date.now() + 5 * 60_000) return { error: "Clock-in time can't be in the future" };
  if (Date.now() - at > 7 * 24 * 3_600_000) return { error: "Clock-in time can't be more than 7 days ago" };

  const cfg = await getShiftConfig(admin, o.restaurantId);
  const { data, error: insErr } = await admin
    .from("attendance_records")
    .insert({
      restaurant_id: o.restaurantId,
      employee_id: o.employeeId,
      employee_name: emp.name,
      clock_in_at: new Date(at).toISOString(),
      source: o.source,
      tz_offset: cfg.tz,
      marked_by_name: o.markedBy ?? null,
      note: o.note ?? null,
    })
    .select(ATTENDANCE_COLUMNS)
    .single();
  if (insErr) return { error: isMissingAttendanceTable(insErr) ? ATTENDANCE_MIGRATION_WARNING : insErr.message };
  return { record: data as AttendanceRow };
}

/** Clock an employee out (no-op, returning null, when they aren't clocked in). */
export async function clockOutEmployee(
  admin: Admin,
  o: { restaurantId: string; employeeId: string; at?: string | null; markedBy?: string | null }
): Promise<{ record?: AttendanceRow | null; error?: string }> {
  const { data: open, error } = await admin
    .from("attendance_records")
    .select("id, clock_in_at")
    .eq("restaurant_id", o.restaurantId)
    .eq("employee_id", o.employeeId)
    .eq("status", "open")
    .order("clock_in_at", { ascending: false })
    .limit(1);
  if (error) return { error: isMissingAttendanceTable(error) ? ATTENDANCE_MIGRATION_WARNING : error.message };
  const rec = open?.[0] as { id: string; clock_in_at: string } | undefined;
  if (!rec) return { record: null };

  const at = o.at ? Date.parse(o.at) : Date.now();
  if (!Number.isFinite(at) || at > Date.now() + 5 * 60_000) return { error: "Clock-out time can't be in the future" };
  if (at < Date.parse(rec.clock_in_at)) return { error: "Clock-out can't be before the clock-in time" };

  const patch: Record<string, unknown> = { clock_out_at: new Date(at).toISOString(), status: "closed", minutes: minutesBetween(rec.clock_in_at, at) };
  if (o.markedBy) patch.marked_by_name = o.markedBy;
  const { data, error: upErr } = await admin.from("attendance_records").update(patch).eq("id", rec.id).select(ATTENDANCE_COLUMNS).single();
  if (upErr) return { error: upErr.message };
  return { record: data as AttendanceRow };
}

export const fmtHours = (mins: number | null | undefined) => {
  const m = Math.max(0, Math.round(Number(mins) || 0));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
};
