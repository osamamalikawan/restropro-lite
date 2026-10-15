import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyStaffSessionToken, STAFF_SESSION_COOKIE } from "@/lib/auth/staff-session";
import { AccountsClient } from "./accounts-client";

export default async function AccountsPage() {
  const token = (await cookies()).get(STAFF_SESSION_COOKIE)?.value;
  const session = await verifyStaffSessionToken(token);
  if (!session) redirect("/login");
  if (session.role !== "admin" && session.role !== "manager") redirect("/dashboard");

  return <AccountsClient />;
}