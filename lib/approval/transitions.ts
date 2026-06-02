import type { ScheduledStatus } from "@/lib/supabase/types";

export type CustomerTarget = "approved" | "rejected";

/**
 * Throws unless a customer is allowed to move `from` -> `to`.
 * Customers may only act on posts awaiting their approval.
 */
export function assertCustomerTransition(
  from: ScheduledStatus,
  to: CustomerTarget,
): void {
  if (from !== "pending_approval") {
    throw new Error(`cannot ${to} a post in status "${from}"`);
  }
  if (to !== "approved" && to !== "rejected") {
    throw new Error(`invalid customer target status "${to}"`);
  }
}
