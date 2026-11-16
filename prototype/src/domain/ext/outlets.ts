// Extra rules for the retail outlet and logistics screens: scanning several
// units at once (a carton or a counted stack), the order upload in Selyn's
// format, and small read helpers shared by those screens.

import { actor, audit, mutate, stamp } from "../db";
import type { Result } from "../actions";
import { addDays } from "../format";
import { reserve } from "../stock";
import { freeForNewOrders, lineValue, orderTotals, recordOutletPayment, releaseOutletOrder, scanItem, invoiceBalance, invoiceStatus } from "../outlets";
import type { Db, Invoice, OutletOrder } from "../types";
import { dayKey } from "../format";

/**
 * Scan the same barcode `n` times (scanner quantity key). Stops at the first
 * refusal. Returns the message for the packer and how many units counted.
 */
export function scanMany(dispatchId: string, code: string, n: number): Result<{ ok: boolean; message: string; count: number }> {
  try {
    const value = mutate((d) => {
      let count = 0;
      let last = { ok: false, message: "" };
      const times = Math.max(1, Math.floor(n));
      for (let i = 0; i < times; i++) {
        const r = scanItem(d, dispatchId, code);
        if (!r.ok) {
          if (count === 0) return { ok: false, message: r.message, count: 0 };
          break;
        }
        count += 1;
        last = r;
      }
      return { ok: true, message: last.message, count };
    });
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function run<T>(fn: Parameters<typeof mutate<T>>[0]): Result<T> {
  try {
    return { ok: true, value: mutate(fn) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Record an outlet receipt with the workbook's optional Notes column. */
export function recordPaymentWithNotes(input: Parameters<typeof recordOutletPayment>[1] & { notes?: string }): Result<string> {
  return run((d) => {
    const { notes, ...rest } = input;
    const p = recordOutletPayment(d, rest);
    if (notes?.trim()) d.outletPayments[0].notes = notes.trim();
    return p.id;
  });
}

/**
 * Release a hold. An order saved while its outlet was on hold has nothing
 * allocated or waiting, so on release its lines go through the stock check
 * like a newly confirmed order (first in, first out from release).
 */
export function releaseHold(orderId: string): Result<string> {
  return run((d) => {
    releaseOutletOrder(d, orderId);
    const o = d.outletOrders.find((x) => x.id === orderId);
    if (!o || o.draft) return "Hold released";
    const parts: string[] = [];
    let touched = false;
    for (const l of o.lines) {
      const unplaced = l.qty - l.allocated - l.dispatched - l.delivered - l.backordered - l.lost - l.cancelled - l.difference;
      if (unplaced <= 0) continue;
      touched = true;
      const supply = Math.min(freeForNewOrders(d, l.productId), unplaced);
      if (supply > 0) reserve(d, l.productId, "outlet", supply);
      l.allocated += supply;
      l.backordered += unplaced - supply;
      if (unplaced - supply > 0 && !l.expectedDate) l.expectedDate = addDays(stamp(d), 14);
      parts.push(`${l.productId}: ${supply} now${unplaced - supply ? `, ${unplaced - supply} back-ordered` : ""}`);
    }
    if (touched) {
      o.createdAt = stamp(d);
      o.events.push({ ts: stamp(d), by: actor(d), text: `Stock checked on release. ${parts.join("; ")}` });
      audit(d, { by: actor(d), area: "Outlet orders", action: `Order allocated on release ${orderId}`, entityId: orderId, after: parts.join("; ") });
      return `Hold released. ${parts.join("; ")}`;
    }
    return "Hold released";
  });
}

// ---------- read helpers ----------

/** Units still to deliver on an order: allocated, on the road and waiting for stock. */
export function openUnits(o: OutletOrder) {
  if (o.status === "cancelled") return 0;
  const t = orderTotals(o);
  return t.allocated + t.dispatched + t.backordered;
}

export function isOrderOverdue(o: OutletOrder, nowIso: string) {
  return (o.status === "open" || o.status === "partly_delivered") && openUnits(o) > 0 && o.requiredDate < dayKey(nowIso);
}

/** Invoiced value (cancelled invoices left out) matching a test. */
export function invoiced(db: Db, test: (i: Invoice) => boolean) {
  return db.invoices.filter((i) => i.status !== "cancelled" && test(i)).reduce((s, i) => s + i.total, 0);
}

export function overdueInvoices(db: Db, nowIso: string, outletId?: string) {
  return db.invoices.filter((i) => (!outletId || i.outletId === outletId) && invoiceStatus(db, i, nowIso) === "Overdue");
}

export function overdueAmount(db: Db, nowIso: string, outletId?: string) {
  return overdueInvoices(db, nowIso, outletId).reduce((s, i) => s + invoiceBalance(db, i), 0);
}

export interface LostSale {
  order: OutletOrder;
  productId: string;
  qty: number;
  value: number;
  reason: string;
  date: string;
}

/** Every balance an outlet declined, with the date it was recorded. */
export function lostSales(db: Db, outletId?: string): LostSale[] {
  return db.outletOrders
    .filter((o) => !outletId || o.outletId === outletId)
    .flatMap((o) =>
      o.lines
        .filter((l) => l.lost > 0)
        .map((l) => {
          const ev = [...o.events].reverse().find((e) => e.text.includes(`× ${l.productId} recorded as a lost sale`));
          return {
            order: o,
            productId: l.productId,
            qty: l.lost,
            value: lineValue(l, l.lost),
            reason: l.lostReason ?? "Not given",
            date: ev?.ts ?? o.createdAt,
          };
        }),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** 1st, 2nd, 3rd, 4th... */
export function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}
