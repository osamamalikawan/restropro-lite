import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";

const SELECT = "id, txn_date, description, category, type, amount";

/** Ledger list, paged: ?limit (default 50, max 200) &offset, ?q= (description contains),
 *  ?from= & ?to= (ISO date-times, inclusive; matched against the moment the entry was booked).
 *  Returns { accounts, hasMore } (one extra row is fetched to know if another page exists).
 *  On the first page (offset 0) it also returns { totals: { income, expense } } for the WHOLE
 *  filtered range, so the cards above the table stay right however many rows are loaded. */
export async function GET(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const limit = Math.min(Math.max(Number(sp.get("limit") ?? 50) || 50, 1), 200);
  const offset = Math.max(Number(sp.get("offset") ?? 0) || 0, 0);
  const q = (sp.get("q") ?? "").replace(/[,()%*\\]/g, " ").trim();
  const from = sp.get("from");
  const to = sp.get("to");
  const fromOk = from && !Number.isNaN(Date.parse(from)) ? new Date(from).toISOString() : null;
  const toOk = to && !Number.isNaN(Date.parse(to)) ? new Date(to).toISOString() : null;

  const admin = createAdminClient();

  // created_at carries the time of day; if a database has no such column, fall back to the entry's
  // date (txn_date), where the time part of the range is simply ignored.
  const build = (columns: string, useCreatedAt: boolean) => {
    let query = admin.from("accounts").select(columns).eq("restaurant_id", session.restaurantId);
    if (q) query = query.ilike("description", `%${q}%`);
    if (useCreatedAt) {
      if (fromOk) query = query.gte("created_at", fromOk);
      if (toOk) query = query.lte("created_at", toOk);
    } else {
      if (fromOk) query = query.gte("txn_date", fromOk.slice(0, 10));
      if (toOk) query = query.lte("txn_date", toOk.slice(0, 10));
    }
    return query;
  };
  const page = (useCreatedAt: boolean) => {
    let query = build(useCreatedAt ? `${SELECT}, created_at` : SELECT, useCreatedAt).order("txn_date", { ascending: false });
    if (useCreatedAt) query = query.order("created_at", { ascending: false });
    return query.order("id", { ascending: false }).range(offset, offset + limit);
  };

  let useCreatedAt = true;
  let res = await page(true);
  if (res.error && /created_at/.test(res.error.message)) {
    useCreatedAt = false;
    res = await page(false);
  }
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
  const rows = (res.data ?? []) as unknown as Record<string, unknown>[];
  const body: Record<string, unknown> = { accounts: rows.slice(0, limit), hasMore: rows.length > limit };

  if (offset === 0) {
    let income = 0;
    let expense = 0;
    // add up the whole range 1000 rows at a time (capped, so a huge range can't hang the request)
    for (let from1 = 0, i = 0; i < 30; i++, from1 += 1000) {
      const { data, error } = await build("type, amount", useCreatedAt)
        .order("id", { ascending: true })
        .range(from1, from1 + 999);
      if (error) break;
      for (const r of (data ?? []) as unknown as { type: string; amount: number }[]) {
        if (r.type === "income") income += Number(r.amount) || 0;
        else expense += Number(r.amount) || 0;
      }
      if ((data ?? []).length < 1000) break;
    }
    body.totals = { income, expense, net: income - expense };
  }
  return NextResponse.json(body);
}

/** Manual ledger entries (e.g. logging an expense) — Admin/Manager only. Sales entries are
 *  created automatically by app/api/sales/route.ts, not through this POST. */
export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (session.role !== "admin" && session.role !== "manager") {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const { description, category, type, amount } = (await req.json().catch(() => ({}))) as {
    description?: string;
    category?: string;
    type?: "income" | "expense";
    amount?: number;
  };
  if (!description || !type || !amount) {
    return NextResponse.json({ error: "description, type, and amount are required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("accounts").insert({
    restaurant_id: session.restaurantId,
    txn_date: new Date().toISOString().slice(0, 10),
    description,
    category: category || (type === "income" ? "Other income" : "Other expense"),
    type,
    amount,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
