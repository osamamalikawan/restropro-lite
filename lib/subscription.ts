export type SubscriptionRow = {
  id: string;
  restaurant_id: string;
  current_period_end: string; // ISO timestamp
  grace_until: string;        // ISO timestamp = current_period_end + 3 days
  status: "trialing" | "active" | "grace" | "expired" | "cancelled";
};

export const GRACE_PERIOD_DAYS = 3;

export function graceUntil(periodEnd: Date): Date {
  return new Date(periodEnd.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
}

/** Pure function — the ONE place subscription status is computed, so request-time
 *  enforcement (middleware, staff login) and the scheduled cron sweep can never disagree. */
export function computeStatus(sub: Pick<SubscriptionRow, "current_period_end" | "grace_until" | "status">, now: Date = new Date()) {
  if (sub.status === "cancelled") return "cancelled" as const;
  const periodEnd = new Date(sub.current_period_end);
  const grace = new Date(sub.grace_until);
  if (sub.status === "trialing" && now <= periodEnd) return "trialing" as const;
  if (now <= periodEnd) return "active" as const;
  if (now <= grace) return "grace" as const;
  return "expired" as const;
}

/** true = restaurant app may be used (active or within grace); false = must be blocked. */
export function isUsable(status: ReturnType<typeof computeStatus>): boolean {
  return status === "active" || status === "grace" || status === "trialing";
}
