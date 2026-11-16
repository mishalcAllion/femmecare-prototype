// Extra rules and actions for consultant management and finance screens.
// Built on the shared business functions; every change goes through `mutate`.

import type { Draft } from "immer";
import { actor, audit, mutate, notify, sendMessage, stamp } from "../db";
import type { Result } from "../actions";
import * as cons from "../consultants";
import { addStock, lotsFefo } from "../stock";
import { computeMonth, isQualifying, salesMonth } from "../commission";
import { consultantCode, lkr, monthKey, monthLabel, nextMonthKey, round2 } from "../format";
import type { CommissionLine, CommissionSettings, Consultant, ConsultantOrder, Db } from "../types";

function run<T>(fn: (d: Draft<Db>) => T): Result<T> {
  try {
    return { ok: true, value: mutate(fn) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const units = (o: ConsultantOrder) => o.lines.reduce((a, l) => a + l.qty, 0);

export const financeActions = {
  /**
   * Approve or reject a refund. On top of the shared rule, a delivered order whose
   * goods came back in good condition has its packs returned to consultant stock.
   */
  decideRefund: (orderId: string, approve: boolean, note?: string) =>
    run((d) => {
      const o = d.consultantOrders.find((x) => x.id === orderId);
      if (!o?.refund) throw new Error("There is no refund request on this order");
      const shipped = o.deliveryStatus === "dispatched" || o.deliveryStatus === "delivered";
      const restock = o.refund.restock;
      cons.decideRefund(d, orderId, approve, note);
      if (!approve || !shipped || !restock || o.refund.status !== "approved") return;
      const x = d.dispatches.find((y) => y.id === o.dispatchId);
      const back = x?.lines.length
        ? x.lines.map((l) => ({ productId: l.productId, batchId: l.batchId, qty: l.qty }))
        : o.lines.map((l) => ({ productId: l.productId, batchId: lotsFefo(d, l.productId, "consultant")[0]?.batchId ?? "", qty: l.qty }));
      for (const b of back.filter((y) => y.batchId)) {
        addStock(d, b.productId, b.batchId, "consultant", b.qty, "Adjustment in", { type: "Refund", id: o.id }, "Returned with refund");
      }
      o.events.push({ ts: stamp(d), by: actor(d), text: `${units(o)} packs returned to stock` });
      audit(d, { by: actor(d), area: "Stock", action: `Stock returned with refund ${o.id}`, entityId: o.id, after: `+${units(o)} packs (consultant stock)` });
    }),

  /** Ask a consultant whose bank details were never verified to send them again. */
  askForBankDetails: (consultantId: string, reason: string) =>
    run((d) => {
      const c = d.consultants.find((x) => x.id === consultantId);
      if (!c) throw new Error("Not found");
      if (!reason.trim()) throw new Error("A reason is required");
      sendMessage(d, {
        channel: "sms",
        to: c.mobile,
        toName: cons.fullName(c),
        body: `FemmeCare: We could not verify your bank details: ${reason}. Please update them in the app so we can pay your commission.`,
        relatedType: cons.label(d),
        relatedId: c.id,
      });
      notify(d, { consultantId: c.id }, `Please update your bank details: ${reason}`, "/app/profile");
      audit(d, { by: actor(d), area: `${cons.label(d)}s`, action: `Bank details queried ${consultantCode(c.number)}`, entityId: c.id, reason });
    }),
};

// ---------- read helpers ----------

/** Months from the first paid consultant order to the current month, newest first. */
export function monthOptions(db: Db, nowIso: string): string[] {
  const paid = db.consultantOrders.filter((o) => o.paidAt).map((o) => monthKey(o.paidAt!));
  const closed = db.commissionMonths.map((m) => m.id);
  const first = [...paid, ...closed, monthKey(nowIso)].sort()[0];
  const out: string[] = [];
  let m = first;
  const last = monthKey(nowIso);
  let guard = 0;
  while (m <= last && guard++ < 60) {
    out.push(m);
    m = nextMonthKey(m);
  }
  return out.reverse();
}

/** Lines and the rules used for a month: locked figures once closed, live figures while open. */
export function monthView(db: Db, month: string, settings?: CommissionSettings): { lines: CommissionLine[]; settings: CommissionSettings; closed: boolean } {
  const closed = db.commissionMonths.find((m) => m.id === month);
  if (closed && !settings) return { lines: closed.lines, settings: closed.settingsUsed, closed: true };
  const s = settings ?? db.settings.commission;
  return { lines: computeMonth(db, month, s), settings: s, closed: !!closed };
}

/** Qualifying orders of a set of consultants in a month. */
export function qualifyingOrders(db: Db, month: string, consultantIds: string[], cutoff: string) {
  const ids = new Set(consultantIds);
  return db.consultantOrders.filter((o) => ids.has(o.consultantId) && isQualifying(o) && salesMonth(o.paidAt!, cutoff) === month);
}

export function sponsorOf(db: Db, c?: Consultant) {
  return c?.sponsorId ? cons.consultantById(db, c.sponsorId) : undefined;
}

/** What approving a refund will do to stock and to commission, in plain words. */
export function refundEffect(db: Db, o: ConsultantOrder): { stock: string; commission: string; afterClose: boolean; adjustment?: number } {
  const lbl = cons.label(db).toLowerCase();
  const shipped = o.deliveryStatus === "dispatched" || o.deliveryStatus === "delivered";
  const n = units(o);
  let stock: string;
  if (o.refund?.status === "approved") {
    stock = !shipped || o.deliveryStatus === "cancelled"
      ? `${n} packs went back to ${lbl} stock`
      : o.refund.restock
        ? `${n} packs were returned to ${lbl} stock`
        : "Goods were not returned to stock";
  } else if (!shipped) {
    stock = o.stockReserved ? `${n} packs reserved for this order go back to ${lbl} stock` : "Nothing was reserved, so stock does not change";
  } else {
    stock = o.refund?.restock ? `${n} packs come back into ${lbl} stock` : "Goods are not returned to stock (written off as damaged)";
  }
  const c = cons.consultantById(db, o.consultantId);
  const sponsor = sponsorOf(db, c);
  if (!o.paidAt) return { stock, commission: "No commission effect: the order was never paid", afterClose: false };
  if (!sponsor) return { stock, commission: "No commission effect: no sponsor", afterClose: false };
  const posted = db.commissionAdjustments.find((a) => a.orderId === o.id);
  if (posted)
    return {
      stock,
      commission: `Adjustment ${posted.id} of ${lkr(posted.amount)} on ${cons.fullName(sponsor)}'s commission${posted.appliedInMonth ? `, netted in ${monthLabel(posted.appliedInMonth)}` : ", taken off her next commission"}`,
      afterClose: true,
      adjustment: posted.amount,
    };
  const month = monthKey(o.paidAt);
  const closed = db.commissionMonths.find((m) => m.id === month);
  if (closed) {
    const set = closed.settingsUsed;
    const value = set.base === "mrp" ? o.mrpValue : o.subtotal;
    const amt = round2((-value * set.rate) / 100);
    const line = closed.lines.find((l) => l.sponsorId === sponsor.id);
    if (o.refund?.status === "approved" || o.refund?.status === "rejected")
      return { stock, commission: `${monthLabel(month)} was closed; ${line?.qualifies ? "no adjustment was needed" : `${cons.fullName(sponsor)} did not earn commission that month`}`, afterClose: true };
    if (line?.qualifies)
      return {
        stock,
        commission: `${monthLabel(month)} is closed, so this becomes an adjustment on ${cons.fullName(sponsor)}'s next commission: ${lkr(-amt)} taken off`,
        afterClose: true,
        adjustment: amt,
      };
    return { stock, commission: `${monthLabel(month)} is closed and ${cons.fullName(sponsor)} did not earn commission that month, so there is no adjustment`, afterClose: true };
  }
  const set = db.settings.commission;
  const value = set.base === "mrp" ? o.mrpValue : o.subtotal;
  const sm = salesMonth(o.paidAt, set.cutoff);
  if (o.refund?.status === "approved")
    return { stock, commission: `Removed from ${cons.fullName(sponsor)}'s ${monthLabel(sm)} figures while the month was open`, afterClose: false };
  return {
    stock,
    commission: `${monthLabel(sm)} is still open: ${lkr(value)} comes off ${cons.fullName(sponsor)}'s team sales, about ${lkr((value * set.rate) / 100)} less provisional commission`,
    afterClose: false,
  };
}

export function rulesText(db: Db, s: CommissionSettings): string[] {
  const lbl = cons.label(db).toLowerCase();
  return [
    `${s.rate}% of direct team sales, first level only`,
    `Calculated on ${s.base === "mrp" ? "MRP value" : `net ${lbl} sales (what the team paid)`}`,
    `Qualifies at ${lkr(s.threshold, { decimals: false })} a month of ${s.thresholdCounts === "team_plus_own" ? "team plus own sales" : "team sales"}`,
    s.ownSalesEarn ? "The sponsor's own sales also earn commission" : "The sponsor's own sales count toward the threshold only",
    s.no1Earns ? "FemmeCare No. 1 earns commission" : "FemmeCare No. 1 does not earn commission",
    s.referralTest.enabled ? `Needs at least ${s.referralTest.min} team member${s.referralTest.min > 1 ? "s" : ""} who ordered in the month` : "No minimum number of active referrals",
    `Month cut-off ${s.cutoff} on the last day`,
  ];
}
