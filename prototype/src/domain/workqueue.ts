// What is waiting for each role. Drives the staff home page and sidebar badges.

import type { Db, RoleId } from "./types";
import { can, type Permission } from "./permissions";
import { stockAlerts } from "./stock";
import { invoiceStatus } from "./outlets";
import { closeChecks } from "./commission";
import { lastDayOfMonth, monthKey, monthLabel, prevMonthKey } from "./format";

export interface WorkItem {
  key: string;
  label: string;
  count: number;
  to: string;
  perm: Permission;
  hint: string;
  tone: "brand" | "warning" | "danger" | "info" | "success";
}

export function workItems(db: Db, now: string): WorkItem[] {
  const pendingApps = db.consultants.filter((c) => c.status === "pending").length;
  const proofs = db.consultantOrders.filter((o) => o.paymentStatus === "proof_uploaded").length;
  const failedPay = db.consultantOrders.filter((o) => o.paymentStatus === "failed" || o.paymentStatus === "rejected").filter((o) => o.deliveryStatus !== "cancelled").length;
  const consultantToPack = db.consultantOrders.filter((o) => (o.paymentStatus === "paid" || o.paymentStatus === "cod_pending") && o.deliveryStatus === "placed" && !o.refund).length;
  const outletToPick = db.outletOrders.filter((o) => o.status !== "cancelled" && o.lines.some((l) => l.allocated > 0)).length;
  const readyToHand = db.dispatches.filter((x) => x.channel === "consultant" && x.status === "ready").length;
  const readyToInvoice = db.dispatches.filter((x) => x.channel === "outlet" && x.status === "ready" && !x.invoiceId).length;
  const pod = db.dispatches.filter((x) => x.channel === "outlet" && x.status === "dispatched").length;
  const backorderOutlets = new Set(db.outletOrders.filter((o) => o.status !== "cancelled" && o.lines.some((l) => l.backordered > 0)).map((o) => o.id)).size;
  const grn = db.grns.filter((g) => g.status === "expected").length;
  const transfers = db.transfers.filter((t) => t.status === "requested").length;
  const alerts = stockAlerts(db, now);
  const low = alerts.filter((a) => a.kind === "low").length;
  const expiring = alerts.filter((a) => a.kind === "expiry").length;
  const counts = db.counts.filter((c) => c.status === "submitted").length;
  const bank = db.consultants.filter((c) => c.pendingBank).length;
  const refunds = db.consultantOrders.filter((o) => o.refund?.status === "requested").length;
  const overdue = db.invoices.filter((i) => invoiceStatus(db, i, now) === "Overdue").length;
  const lastMonth = prevMonthKey(monthKey(now));
  const lastMonthHasSales = db.consultantOrders.some((o) => o.paidAt && monthKey(o.paidAt) === lastMonth);
  const monthOpen = lastMonthHasSales && !db.commissionMonths.some((m) => m.id === lastMonth) && now.slice(0, 10) > lastDayOfMonth(lastMonth);
  const blocked = monthOpen ? !closeChecks(db, lastMonth, now).ok : false;
  const draftBatches = db.payoutBatches.filter((b) => b.status === "draft" || b.status === "approved").length;
  const failedPayouts = db.payoutBatches.flatMap((b) => b.lines).filter((l) => l.status === "failed" && l.carriedFrom !== "moved").length;

  return [
    { key: "applications", label: "Applications to approve", count: pendingApps, to: "/staff/applications", perm: "applications.decide", hint: "New consultants waiting for a decision", tone: "brand" },
    { key: "payments", label: "Bank transfers to verify", count: proofs, to: "/staff/payments", perm: "payments.verify", hint: "Slips uploaded by consultants", tone: "warning" },
    { key: "failedPayments", label: "Failed or rejected payments", count: failedPay, to: "/staff/consultant-orders?payment=problem", perm: "payments.verify", hint: "Orders the consultant still has to pay", tone: "danger" },
    { key: "toPack", label: "Orders to pick and pack", count: consultantToPack + outletToPick, to: "/staff/dispatch", perm: "dispatch.view", hint: `${consultantToPack} consultant, ${outletToPick} outlet`, tone: "info" },
    { key: "handover", label: "Packed, waiting for the courier", count: readyToHand, to: "/staff/dispatch?column=ready", perm: "dispatch.consultant", hint: "Enter the tracking number at handover", tone: "info" },
    { key: "toInvoice", label: "Packed, waiting for the invoice and delivery note", count: readyToInvoice, to: "/staff/dispatch?channel=outlet&column=ready", perm: "invoices.issue", hint: "Issue both before the van leaves", tone: "info" },
    { key: "pod", label: "Deliveries waiting for the signed note", count: pod, to: "/staff/pod", perm: "pod.confirm", hint: "Upload the outlet's signed delivery note", tone: "warning" },
    { key: "backorders", label: "Outlet orders with back-orders", count: backorderOutlets, to: "/staff/backorders", perm: "outletOrders.edit", hint: "Waiting for stock, oldest first", tone: "warning" },
    { key: "grn", label: "Stock arrived, not yet received", count: grn, to: "/staff/grn", perm: "grn.record", hint: "Record batch, expiry and channel split", tone: "brand" },
    { key: "transfers", label: "Stock moves to approve", count: transfers, to: "/staff/transfers", perm: "transfer.approve", hint: "Between outlet and consultant stock", tone: "warning" },
    { key: "counts", label: "Stock counts to approve", count: counts, to: "/staff/counts", perm: "count.approve", hint: "Approved by someone other than the counter", tone: "warning" },
    { key: "low", label: "Low stock", count: low, to: "/staff/stock?filter=low", perm: "stock.view.all", hint: "At or below the reorder level", tone: "danger" },
    { key: "expiring", label: "Batches close to expiry", count: expiring, to: "/staff/stock?filter=expiring", perm: "stock.view.all", hint: `Within ${db.settings.stock.expiryWarnDays} days`, tone: "warning" },
    { key: "bank", label: "Bank details to verify", count: bank, to: "/staff/bank-details", perm: "bank.verify", hint: "Needed before the next payout", tone: "warning" },
    { key: "refunds", label: "Refunds to approve", count: refunds, to: "/staff/refunds", perm: "refunds.approve", hint: "Requested by Operations", tone: "warning" },
    { key: "overdue", label: "Overdue outlet invoices", count: overdue, to: "/staff/invoices?status=Overdue", perm: "outletPayments.record", hint: "Follow up with the outlet", tone: "danger" },
    { key: "monthEnd", label: monthOpen ? `Close ${monthLabel(lastMonth)} and pay commission` : "Month-end close", count: monthOpen ? 1 : 0, to: "/staff/month-end", perm: "month.close", hint: blocked ? "Some checks need attention first" : "Commission is due by the 5th", tone: "brand" },
    { key: "payouts", label: "Payout batches in progress", count: draftBatches, to: "/staff/payouts", perm: "payout.approve", hint: "Approve, create the bank file, record results", tone: "info" },
    { key: "failedPayouts", label: "Failed payouts to pay again", count: failedPayouts, to: "/staff/payouts", perm: "payout.approve", hint: "Go into the next batch", tone: "danger" },
  ];
}

export function itemsFor(db: Db, now: string, roles: RoleId[]): WorkItem[] {
  return workItems(db, now).filter((i) => can(roles, i.perm));
}

export function badgeCounts(db: Db, now: string, roles: RoleId[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of itemsFor(db, now, roles)) out[i.key] = i.count;
  return out;
}
