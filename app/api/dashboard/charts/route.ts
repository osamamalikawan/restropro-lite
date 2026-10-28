import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";

const DAY = 86_400_000;
const MIN = 60_000;

type Series = { labels: string[]; current: (number | null)[]; previous: (number | null)[]; currentTotal: number; previousToDate: number; previousTotal: number };

/** Dashboard charts: today vs yesterday by hour, and this week / this month vs the previous one.
 *  "Today" follows the caller's own clock: the browser sends ?tz=<minutes ahead of UTC> (Pakistan = 300),
 *  so a sale made at 1 AM local time lands on the right day. Cancelled orders are left out; unpaid ones count
 *  (they are real sales that are still to be collected). Totals are the order `total`. */
export async function GET(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const tzRaw = Number(new URL(req.url).searchParams.get("tz"));
  const tz = Number.isFinite(tzRaw) ? Math.max(-840, Math.min(840, Math.round(tzRaw))) : 0;
  const shiftMs = tz * MIN;

  // "Local" calendar maths done with UTC getters on a clock shifted by the caller's offset.
  const nowLocal = new Date(Date.now() + shiftMs);
  const y = nowLocal.getUTCFullYear();
  const m = nowLocal.getUTCMonth();
  const todayKey = Date.UTC(y, m, nowLocal.getUTCDate());
  const yesterdayKey = todayKey - DAY;
  const hourNow = nowLocal.getUTCHours();
  const dow = (nowLocal.getUTCDay() + 6) % 7; // Monday = 0
  const weekKey = todayKey - dow * DAY;
  const lastWeekKey = weekKey - 7 * DAY;
  const monthKey = Date.UTC(y, m, 1);
  const lastMonthKey = Date.UTC(y, m - 1, 1);
  const daysThisMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const daysLastMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dayOfMonth = nowLocal.getUTCDate();

  const sinceIso = new Date(Math.min(lastMonthKey, lastWeekKey) - shiftMs).toISOString();

  const admin = createAdminClient();
  const byDay = new Map<number, number>(); // local day key -> sales total
  const hoursToday = new Array<number>(24).fill(0);
  const hoursYesterday = new Array<number>(24).fill(0);

  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("sales")
      .select("created_at, total")
      .eq("restaurant_id", session.restaurantId)
      .neq("status", "cancelled")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const r of data ?? []) {
      const d = new Date(new Date(r.created_at as string).getTime() + shiftMs);
      const key = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      const amt = Number(r.total) || 0;
      byDay.set(key, (byDay.get(key) ?? 0) + amt);
      if (key === todayKey) hoursToday[d.getUTCHours()] += amt;
      else if (key === yesterdayKey) hoursYesterday[d.getUTCHours()] += amt;
    }
    if ((data?.length ?? 0) < PAGE) break;
  }

  const day = (key: number) => Math.round(byDay.get(key) ?? 0);
  const sum = (arr: (number | null)[]) => arr.reduce<number>((a, v) => a + (v ?? 0), 0);

  const week: Series = (() => {
    const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const current = labels.map((_, i) => (i <= dow ? day(weekKey + i * DAY) : null));
    const previous = labels.map((_, i) => day(lastWeekKey + i * DAY));
    return { labels, current, previous, currentTotal: sum(current), previousToDate: sum(previous.slice(0, dow + 1)), previousTotal: sum(previous) };
  })();

  const month: Series = (() => {
    const labels = Array.from({ length: daysThisMonth }, (_, i) => String(i + 1));
    const current = labels.map((_, i) => (i + 1 <= dayOfMonth ? day(monthKey + i * DAY) : null));
    const previous = Array.from({ length: daysThisMonth }, (_, i) => (i < daysLastMonth ? day(lastMonthKey + i * DAY) : null));
    return {
      labels,
      current,
      previous,
      currentTotal: sum(current),
      previousToDate: sum(previous.slice(0, dayOfMonth)),
      previousTotal: sum(previous),
    };
  })();

  const round = (a: number[]) => a.map((v) => Math.round(v));
  return NextResponse.json({
    hourNow,
    today: round(hoursToday).map((v, h) => (h <= hourNow ? v : null)), // the line stops at the current hour
    yesterday: round(hoursYesterday),
    todayTotal: Math.round(sum(hoursToday)),
    yesterdayTotal: Math.round(sum(hoursYesterday)),
    yesterdayToNow: Math.round(sum(hoursYesterday.slice(0, hourNow + 1))),
    week,
    month: { ...month, monthName: new Date(monthKey).toLocaleString("en-US", { month: "long", timeZone: "UTC" }) },
  });
}
