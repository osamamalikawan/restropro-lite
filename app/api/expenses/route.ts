import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";

/** Expense list, paged: ?limit (default 50, max 200) &offset, ?q= (category contains),
 *  ?from= & ?to= (YYYY-MM-DD, inclusive). Returns { expenses, hasMore }; on the first page
 *  (offset 0) also { total, count } for the whole filtered range. */
export async function GET(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const limit = Math.min(Math.max(Number(sp.get("limit") ?? 50) || 50, 1), 200);
  const offset = Math.max(Number(sp.get("offset") ?? 0) || 0, 0);
  const q = (sp.get("q") ?? "").replace(/[,()%*\\]/g, " ").trim();
  const isDate = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const from = isDate(sp.get("from"));
  const to = isDate(sp.get("to"));

  const admin = createAdminClient();
  const build = (columns: string) => {
    let query = admin.from("expenses").select(columns).eq("restaurant_id", session.restaurantId);
    if (q) query = query.ilike("category", `%${q}%`);
    if (from) query = query.gte("txn_date", from);
    if (to) query = query.lte("txn_date", to);
    return query;
  };

  const { data, error } = await build("id, category, expense_type, amount, vendor, description, payment_method, txn_date")
    .order("txn_date", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const body: Record<string, unknown> = { expenses: rows.slice(0, limit), hasMore: rows.length > limit };

  if (offset === 0) {
    let total = 0;
    let count = 0;
    for (let start = 0, i = 0; i < 30; i++, start += 1000) {
      const { data: part, error: e2 } = await build("amount").order("id", { ascending: true }).range(start, start + 999);
      if (e2) break;
      for (const r of (part ?? []) as unknown as { amount: number }[]) {
        total += Number(r.amount) || 0;
        count += 1;
      }
      if ((part ?? []).length < 1000) break;
    }
    body.total = total;
    body.count = count;
  }
  return NextResponse.json(body);
}

/** Logs an expense via the atomic `log_expense` Postgres function — writes the expense row
 *  and books the matching accounts entry in one transaction. */
export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (session.role !== "admin" && session.role !== "manager") {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const { category, expenseType, amount, vendor, description, paymentMethod } = (await req.json().catch(() => ({}))) as {
    category?: string;
    expenseType?: "regular" | "recurring";
    amount?: number;
    vendor?: string;
    description?: string;
    paymentMethod?: string;
  };
  if (!category || !amount) {
    return NextResponse.json({ error: "category and amount are required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("log_expense", {
    p_restaurant_id: session.restaurantId,
    p_category: category,
    p_expense_type: expenseType || "regular",
    p_amount: amount,
    p_vendor: vendor || null,
    p_description: description || null,
    p_payment_method: paymentMethod || "Cash",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
