// Words and defaults shared by the finance screens.

import type { Db, PayoutBatch, PayoutLine } from "@/domain/types";
import { monthKey, prevMonthKey } from "@/domain/format";

export const MONTH_STATUS: Record<string, string> = { open: "Provisional", locked: "Locked", payout_approved: "Payout approved", paid: "Paid" };

export const BATCH_STATUS: Record<PayoutBatch["status"], string> = {
  draft: "Waiting for approval",
  approved: "Approved",
  file_generated: "Bank file created",
  results_recorded: "Results recorded",
};

export const LINE_STATUS: Record<PayoutLine["status"], string> = { pending: "To be paid", paid: "Paid", failed: "Failed", held: "Held" };

/** Last month while it is still open, otherwise this month. */
export function defaultMonth(db: Db, now: string) {
  const last = prevMonthKey(monthKey(now));
  const lastHasSales = db.consultantOrders.some((o) => o.paidAt && monthKey(o.paidAt) === last);
  return lastHasSales && !db.commissionMonths.some((m) => m.id === last) ? last : monthKey(now);
}
