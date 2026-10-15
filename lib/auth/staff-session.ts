/** Stateless, HMAC-signed staff session — NOT a Supabase Auth session (see ARCHITECTURE.md).
 *  Uses the Web Crypto API (crypto.subtle) rather than Node's `crypto` module so this works
 *  identically in Node.js AND the Next.js Edge runtime (middleware.ts runs on the edge, which
 *  cannot import node:crypto — that was the earlier "edge runtime does not support Node.js
 *  'crypto' module" crash). */

export interface StaffSessionPayload {
  restaurantId: string;
  employeeId: string;
  /** Not a fixed union anymore — restaurants can create custom roles (see lib/permissions.ts,
   *  migration 0014). Whatever string is here is looked up against that tenant's
   *  role_permissions rows at each permission check; it isn't validated against a fixed set here. */
  role: string;
  sessionVersion: number;
  /** id of this particular sign-in (employees.active_sid). Absent on cookies issued before migration 0028. */
  sid?: string;
  issuedAt: number;
  expiresAt: number;
}

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours — long enough for one shift

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function base64UrlToBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getKey(): Promise<CryptoKey> {
  const secret = process.env.STAFF_SESSION_SECRET;
  if (!secret) throw new Error("STAFF_SESSION_SECRET is not set");
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function createStaffSessionToken(
  payload: Omit<StaffSessionPayload, "issuedAt" | "expiresAt">
): Promise<string> {
  const full: StaffSessionPayload = {
    ...payload,
    issuedAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  const payloadB64 = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(full)));
  const key = await getKey();
  const sigBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  const sig = bytesToBase64Url(new Uint8Array(sigBuffer));
  return `${payloadB64}.${sig}`;
}

/** Returns the payload if the token is validly signed and unexpired, otherwise null.
 *  Verifying employees.session_version still match is the CALLER's job (needs a DB lookup,
 *  which this function deliberately doesn't do) — see app/(restaurant)/dashboard/page.tsx. */
export async function verifyStaffSessionToken(token: string | undefined | null): Promise<StaffSessionPayload | null> {
  if (!token) return null;
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return null;
  try {
    const key = await getKey();
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToBytes(sig),
      new TextEncoder().encode(payloadB64)
    );
    if (!valid) return null;
    const payload: StaffSessionPayload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payloadB64)));
    if (Date.now() > payload.expiresAt) return null;
    return payload;
  } catch {
    return null;
  }
}

export const STAFF_SESSION_COOKIE = "rp_staff_session";