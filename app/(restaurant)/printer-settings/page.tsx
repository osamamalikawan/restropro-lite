import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyStaffSessionToken, STAFF_SESSION_COOKIE } from "@/lib/auth/staff-session";
import { hasModuleAccess } from "@/lib/permissions";
import { PrinterSettings } from "./printer-settings-client";

export default async function PrinterSettingsPage() {
  const token = (await cookies()).get(STAFF_SESSION_COOKIE)?.value;
  const session = await verifyStaffSessionToken(token);
  if (!session) redirect("/login");
  if (!(await hasModuleAccess(session.restaurantId, session.role, "settings"))) redirect("/dashboard");

  return (
    <main className="min-h-screen bg-canvas text-ink-strong p-6 md:p-8">
      <h1 className="font-display text-2xl font-bold mb-1">Printer settings</h1>
      <p className="text-sm text-ink-mid mb-6">Saved per computer, since a USB or network printer only makes sense on the PC that reaches it.</p>
      <PrinterSettings />
    </main>
  );
}