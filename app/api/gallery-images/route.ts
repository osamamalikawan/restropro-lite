import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";

/** Master Gallery is platform-wide (managed by Super Admin) — tenants can only browse and
 *  pick from it, never upload/edit here. See gallery_images table + gallery-images storage
 *  bucket. */
export async function GET() {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("gallery_images")
    .select("id, title, url, category, tags")
    .eq("is_active", true)
    .order("category")
    .order("title");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ images: data });
}
