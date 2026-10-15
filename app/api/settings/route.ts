import { NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/auth/require-staff";
import { clearSessionPolicyCache } from "@/lib/auth/session-policy";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasModuleAccess } from "@/lib/permissions";

/** One row per tenant in restaurant_settings (created with defaults on first access if it
 *  doesn't exist yet), plus the profile fields that actually live on `restaurants`
 *  (name/address/phone — shown on receipts and the staff login screen, same as the
 *  prototype's tenant.settings.restaurantName/address/phone even though this schema keeps
 *  them on the restaurant row itself rather than duplicating them into settings). */
export async function GET() {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();

  const { data: restaurant } = await admin
    .from("restaurants")
    .select("name, address, phone")
    .eq("id", session.restaurantId)
    .single();

  let { data: settings } = await admin
    .from("restaurant_settings")
    .select("*")
    .eq("restaurant_id", session.restaurantId)
    .single();

  if (!settings) {
    const { data: created, error } = await admin
      .from("restaurant_settings")
      .insert({ restaurant_id: session.restaurantId })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    settings = created;
  }

  return NextResponse.json({ restaurant, settings });
}

const SETTINGS_FIELD_MAP: Record<string, string> = {
  serviceChargeRate: "service_charge_rate",
  shiftStart: "shift_start",
  shiftEnd: "shift_end",
  utcOffsetMinutes: "utc_offset_minutes",
  singleDeviceLogin: "single_device_login",
  idleLogoutMinutes: "idle_logout_minutes",
  cashTaxRate: "cash_tax_rate",
  cardTaxRate: "card_tax_rate",
  posShowKitchenPrint: "pos_show_kitchen_print",
  posShowPrintInvoice: "pos_show_print_invoice",
  printerName: "printer_name",
  paperWidth: "paper_width",
  connection: "connection",
  autoPrint: "auto_print",
  receiptHeader: "receipt_header",
  receiptFooter: "receipt_footer",
  fbrEnabled: "fbr_enabled",
  fbrNtn: "fbr_ntn",
  fbrStrn: "fbr_strn",
  fbrPosId: "fbr_pos_id",
  fbrApiToken: "fbr_api_token",
  fbrEnvironment: "fbr_environment",
  fbrFee: "fbr_fee",
  receiptTemplate: "receipt_template",
  showDiscount: "show_discount",
  notePresets: "note_presets",
  urduEnabled: "urdu_enabled",
};

/**
 * Partial update — the Settings page has four independent "Save …" buttons (profile, POS
 * controls, printer/receipt, FBR), each posting only the fields in its own panel, so this
 * only touches the columns actually present in the body rather than requiring the whole form.
 */
export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!(await hasModuleAccess(session.restaurantId, session.role, "settings"))) {
    return NextResponse.json({ error: "Not permitted to change settings" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const admin = createAdminClient();

  const { restaurantName, address, phone } = body as { restaurantName?: string; address?: string; phone?: string };
  if (restaurantName !== undefined || address !== undefined || phone !== undefined) {
    const patch: Record<string, unknown> = {};
    if (restaurantName !== undefined) patch.name = restaurantName;
    if (address !== undefined) patch.address = address;
    if (phone !== undefined) patch.phone = phone;
    const { error } = await admin.from("restaurants").update(patch).eq("id", session.restaurantId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const settingsPatch: Record<string, unknown> = {};
  for (const [bodyKey, column] of Object.entries(SETTINGS_FIELD_MAP)) {
    if (body[bodyKey] !== undefined) settingsPatch[column] = body[bodyKey];
  }
  if (settingsPatch.idle_logout_minutes !== undefined) {
    const m = Math.round(Number(settingsPatch.idle_logout_minutes));
    if (!Number.isFinite(m) || m < 2 || m > 60) return NextResponse.json({ error: "Sign-out time must be between 2 and 60 minutes" }, { status: 400 });
    settingsPatch.idle_logout_minutes = m;
  }
  if (settingsPatch.single_device_login !== undefined) settingsPatch.single_device_login = settingsPatch.single_device_login === true;
  if (settingsPatch.note_presets !== undefined) {
    // keep a clean, short list of unique non-empty strings
    const raw = Array.isArray(settingsPatch.note_presets) ? settingsPatch.note_presets : [];
    const seen = new Set<string>();
    settingsPatch.note_presets = raw
      .map((x) => (typeof x === "string" ? x.trim().slice(0, 60) : ""))
      .filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()))
      .slice(0, 40);
  }
  if (Object.keys(settingsPatch).length > 0) {
    const { error } = await admin
      .from("restaurant_settings")
      .upsert({ restaurant_id: session.restaurantId, ...settingsPatch, updated_at: new Date().toISOString() });
    if (error && /utc_offset_minutes/.test(error.message) && "utc_offset_minutes" in settingsPatch) {
      // migration 0025 not run yet: still save everything else (the shift times) and say what is missing
      const { utc_offset_minutes: _skip, ...rest } = settingsPatch;
      const retry = await admin.from("restaurant_settings").upsert({ restaurant_id: session.restaurantId, ...rest, updated_at: new Date().toISOString() });
      if (retry.error) return NextResponse.json({ error: retry.error.message }, { status: 500 });
      return NextResponse.json({ success: true, warning: "Shift timings saved, but the time zone needs migration 0025_riders_attendance.sql" });
    }
    if (error && /single_device_login|idle_logout_minutes/.test(error.message)) {
      return NextResponse.json({ error: "Run migration 0028_session_tracking.sql in Supabase first" }, { status: 500 });
    }
    if (!error) clearSessionPolicyCache(session.restaurantId); // new rules apply straight away on this server
    if (error) {
      const missing = /urdu_enabled/.test(error.message);
      return NextResponse.json({ error: missing ? "Run migration 0021_urdu_and_category_colors.sql in Supabase first" : error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
