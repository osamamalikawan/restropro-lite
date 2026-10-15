import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("dashboard_summary", { p_restaurant_id: session.restaurantId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const summary = data as Record<string, unknown>;
  return NextResponse.json({ summary });
}
