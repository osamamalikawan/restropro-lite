import bcrypt from "bcryptjs";

/** 4-digit PIN, hashed at rest. bcrypt is deliberately slow-ish (cost 10) which also acts
 *  as mild brute-force friction; pair this with rate limiting on the login route (see
 *  ARCHITECTURE.md #6 — not wired up in this scaffold yet). */
export async function hashPin(pin: string): Promise<string> {
  if (!/^\d{4}$/.test(pin)) throw new Error("PIN must be exactly 4 digits");
  return bcrypt.hash(pin, 10);
}
export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}
