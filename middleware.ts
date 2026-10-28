import { NextResponse, type NextRequest } from "next/server";
import { verifyStaffSessionToken, STAFF_SESSION_COOKIE } from "@/lib/auth/staff-session";

/** Protects the restaurant app. Owner-facing Supabase-Auth routes are protected separately
 *  by RLS + server-side checks in their own layouts; this middleware specifically guards the
 *  PIN-authenticated staff app, since that traffic carries our own cookie, not a Supabase one.
 *
 *  Every page under app/(restaurant)/ — dashboard, inventory, employees, accounts, permissions,
 *  etc. — plus /pos needs this check. Rather than listing each one in `matcher` (which silently
 *  stops protecting a page the moment it's renamed or moved, as happened when the dashboard/*
 *  routes were flattened to top-level paths), the matcher below runs on effectively everything
 *  except static assets and /api, and the small PUBLIC_PATHS allowlist below carves out the
 *  pages that must stay reachable without a session: the landing page, signup, and both staff
 *  login screens. Any new page added under (restaurant)/ is protected automatically. */
const PUBLIC_PATHS = ["/", "/login"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.includes(pathname) || pathname.startsWith("/login/");
  if (isPublic) return NextResponse.next();

  const token = req.cookies.get(STAFF_SESSION_COOKIE)?.value;
  const session = await verifyStaffSessionToken(token);
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  // NOTE: session_version and subscription grace/expired status still need a DB check —
  // middleware runs on the edge and shouldn't do a full DB round trip on every request.
  // The pattern used here: trust the signed cookie for identity, but re-verify
  // session_version + subscription status inside each server action / API route before any
  // mutating operation (see app/(restaurant)/dashboard/page.tsx for where that check lives).
  return NextResponse.next();
}

export const config = {
  // Static files must stay reachable without a session (the login page needs its icon, the browser fetches the
  // manifest and service worker before anyone signs in) - otherwise they get redirected to /login and the tab shows no icon.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.json|sw.js|icons/).*)"],
};