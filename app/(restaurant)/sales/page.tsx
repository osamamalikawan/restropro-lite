import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyStaffSessionToken, STAFF_SESSION_COOKIE } from "@/lib/auth/staff-session";
import { hasModuleAccess } from "@/lib/permissions";
import { SalesClient } from "./sales-client";

export default async function SalesPage() {
  const token = (await cookies()).get(STAFF_SESSION_COOKIE)?.value;
  const session = await verifyStaffSessionToken(token);
  if (!session) redirect("/login");
  if (!(await hasModuleAccess(session.restaurantId, session.role, "sales"))) redirect("/dashboard");

  return <SalesClient canCancel={session.role === "admin" || session.role === "manager"} />;
}
