import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentOrPreviousShift, DEFAULT_SHIFT_END, DEFAULT_SHIFT_START } from "@/lib/shift-times";

/** The time window of "the current shift" for the Accounts filter, from the timings set under
 *  Permissions -> "Default shift timings" (restaurant_settings.shift_start / shift_end; overnight is fine).
 *  - inside a shift                        -> kind "current":  from its start, no end (it is still running)
 *  - between two shifts (the last one ended, the next has not begun) -> kind "previous": that shift's start and end
 *  ?tz= is the caller's UTC offset in minutes (Pakistan = 300) so "14:00" means 2 PM where the restaurant is.
 *  Returns ISO instants { kind, from, to, start, end } - start/end are the timings as "HH:MM" for the page's note. */
export async function GET(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const tzRaw = Number(new URL(req.url).searchParams.get("tz"));
  const tz = Number.isFinite(tzRaw) ? Math.max(-840, Math.min(840, Math.round(tzRaw))) : 0;

  const { data: st } = await createAdminClient()
    .from("restaurant_settings")
    .select("*")
    .eq("restaurant_id", session.restaurantId)
    .maybeSingle();
  const start = String(st?.shift_start ?? DEFAULT_SHIFT_START).slice(0, 5);
  const end = String(st?.shift_end ?? DEFAULT_SHIFT_END).slice(0, 5);

  const saved = st?.utc_offset_minutes != null ? Number(st.utc_offset_minutes) : NaN;
  const w = currentOrPreviousShift(Date.now(), start, end, Number.isFinite(saved) ? saved : tz); // the saved zone wins over the browser's
  return NextResponse.json({
    kind: w.kind,
    from: new Date(w.start).toISOString(),
    to: w.kind === "current" ? null : new Date(w.end).toISOString(),
    start,
    end,
  });
}
