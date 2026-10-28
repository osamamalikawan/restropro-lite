"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDesktopCtx, type DesktopCtx } from "@/lib/desktop/context";

/** The desktop counterpart of the access checks at the top of each server page.tsx
 *  (hasModuleAccess / role lists). Not allowed -> back to the dashboard, like the web redirect.
 *  The server re-checks the role on every API call, so this is for the UI, not the security. */
export function DesktopGuard({
  module,
  anyModule,
  roles,
  children,
}: {
  module?: string;
  anyModule?: string[];
  roles?: string[];
  children: (ctx: DesktopCtx) => React.ReactNode;
}) {
  const ctx = useDesktopCtx();
  const router = useRouter();

  const allowed =
    !!ctx &&
    (module ? ctx.can(module) : true) &&
    (anyModule ? anyModule.some((m) => ctx.can(m)) : true) &&
    (roles ? roles.includes(ctx.role) : true);

  useEffect(() => {
    if (ctx && !allowed) router.replace("/dashboard");
  }, [ctx, allowed, router]);

  if (!ctx || !allowed) return null;
  return <>{children(ctx)}</>;
}
