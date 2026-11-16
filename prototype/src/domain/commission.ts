// Single-level 5% commission: provisional during the month, locked at month-end,
// paid by bank file. Adjustments carry refunds after a close into the next month.

import type { Draft } from "immer";
import type {
  CommissionLine,
  CommissionMonth,
  CommissionSettings,
  Consultant,
  ConsultantOrder,
  Db,
  PayoutBatch,
} from "./types";
import { actor, audit, notify, sendMessage, stamp } from "./db";
import { consultantCode, lastDayOfMonth, lkr, monthKey, monthLabel, nextMonthKey, round2 } from "./format";
import { consultantById, directTeam, fullName } from "./consultants";

type D = Draft<Db> | Db;

export { salesMonth } from "./format";
import { salesMonth } from "./format";

export function isQualifying(o: ConsultantOrder) {
  return o.paymentStatus === "paid" && !!o.paidAt && o.deliveryStatus !== "cancelled";
}

export function orderValue(o: ConsultantOrder, base: CommissionSettings["base"]) {
  return base === "mrp" ? o.mrpValue : o.subtotal;
}

export function salesByConsultant(db: D, month: string, settings: CommissionSettings) {
  const map = new Map<string, number>();
  for (const o of db.consultantOrders) {
    if (!isQualifying(o) || salesMonth(o.paidAt!, settings.cutoff) !== month) continue;
    map.set(o.consultantId, (map.get(o.consultantId) ?? 0) + orderValue(o, settings.base));
  }
  return map;
}

/** The month whose commission is the "next unpaid" one: the first month after the last closed month. */
export function nextMonthToClose(db: D): string {
  const closed = db.commissionMonths.map((m) => m.id).sort();
  if (closed.length) return nextMonthKey(closed[closed.length - 1]);
  const first = db.consultantOrders
    .filter((o) => isQualifying(o))
    .map((o) => salesMonth(o.paidAt!, db.settings.commission.cutoff))
    .sort()[0];
  return first ?? "0000-00";
}

export function pendingAdjustments(db: D, sponsorId?: string) {
  return db.commissionAdjustments.filter((a) => !a.appliedInMonth && (!sponsorId || a.sponsorId === sponsorId));
}

/** Calculate every sponsor's line for a month with the given rules. */
export function computeMonth(db: D, month: string, settings: CommissionSettings = db.settings.commission): CommissionLine[] {
  const sales = salesByConsultant(db, month, settings);
  const lines: CommissionLine[] = [];
  for (const s of db.consultants) {
    if (s.number === undefined) continue;
    const team = db.consultants.filter((c) => c.sponsorId === s.id && c.number !== undefined);
    if (!team.length && !(month === nextMonthToClose(db) && pendingAdjustments(db, s.id).length)) continue;
    const teamSales = round2(team.reduce((a, c) => a + (sales.get(c.id) ?? 0), 0));
    const ownSales = round2(sales.get(s.id) ?? 0);
    const activeReferrals = team.filter((c) => (sales.get(c.id) ?? 0) > 0).length;
    const thresholdBasis = settings.thresholdCounts === "team_plus_own" ? teamSales + ownSales : teamSales;
    const eligible = s.status === "active" && (s.number !== 1 || settings.no1Earns);
    const passesReferral = !settings.referralTest.enabled || activeReferrals >= settings.referralTest.min;
    const qualifies = eligible && thresholdBasis >= settings.threshold && passesReferral;
    const commissionable = round2(teamSales + (settings.ownSalesEarn ? ownSales : 0));
    const amount = qualifies ? round2((commissionable * settings.rate) / 100) : 0;
    const adjustments = month === nextMonthToClose(db) ? round2(pendingAdjustments(db, s.id).reduce((a, x) => a + x.amount, 0)) : 0;
    const payable = round2(Math.max(0, amount + adjustments));
    let hold: string | undefined;
    if (payable > 0 && !s.bankVerified) hold = "Bank details not verified";
    if (payable > 0 && s.status !== "active") hold = `Account ${s.status}`;
    lines.push({ sponsorId: s.id, teamSales, ownSales, thresholdBasis, activeReferrals, qualifies, commissionable, amount, adjustments, payable, hold });
  }
  return lines.sort((a, b) => b.payable - a.payable || b.teamSales - a.teamSales);
}

export function lineFor(db: D, month: string, consultantId: string): CommissionLine | undefined {
  const closed = db.commissionMonths.find((m) => m.id === month);
  if (closed) return closed.lines.find((l) => l.sponsorId === consultantId);
  return computeMonth(db, month).find((l) => l.sponsorId === consultantId);
}

export function whyNotQualified(db: D, l: CommissionLine, settings: CommissionSettings = db.settings.commission): string | undefined {
  if (l.qualifies) return;
  const s = consultantById(db, l.sponsorId);
  if (s && s.status !== "active") return `Account is ${s.status}`;
  if (s?.number === 1 && !settings.no1Earns) return "FemmeCare's own account does not earn commission";
  if (l.thresholdBasis < settings.threshold) return `${lkr(settings.threshold - l.thresholdBasis)} more sales needed to reach ${lkr(settings.threshold, { decimals: false })}`;
  if (settings.referralTest.enabled && l.activeReferrals < settings.referralTest.min)
    return `Needs ${settings.referralTest.min} team members who ordered (has ${l.activeReferrals})`;
}

export function monthStatus(db: D, month: string): "open" | CommissionMonth["status"] {
  return db.commissionMonths.find((m) => m.id === month)?.status ?? "open";
}

// ---------- Month-end close ----------

export interface CloseCheck {
  ok: boolean;
  blocking: { text: string; link?: string }[];
  warnings: { text: string; link?: string }[];
}

export function closeChecks(db: D, month: string, nowIso: string): CloseCheck {
  const blocking: CloseCheck["blocking"] = [];
  const warnings: CloseCheck["warnings"] = [];
  if (db.commissionMonths.some((m) => m.id === month)) blocking.push({ text: `${monthLabel(month)} is already closed` });
  const lastDay = lastDayOfMonth(month);
  if (nowIso.slice(0, 10) <= lastDay && monthKey(nowIso) === month) blocking.push({ text: `${monthLabel(month)} has not ended yet` });
  const earliestOpen = db.consultantOrders
    .filter((o) => isQualifying(o))
    .map((o) => salesMonth(o.paidAt!, db.settings.commission.cutoff))
    .filter((m) => !db.commissionMonths.some((c) => c.id === m))
    .sort()[0];
  if (earliestOpen && earliestOpen < month)
    blocking.push({ text: `Close ${monthLabel(earliestOpen)} first` });
  const unverified = db.consultantOrders.filter(
    (o) => o.paymentStatus === "proof_uploaded" && o.payments.some((p) => p.status === "pending" && salesMonth(p.ts, db.settings.commission.cutoff) === month),
  );
  if (unverified.length)
    blocking.push({
      text: `${unverified.length} bank transfer${unverified.length > 1 ? "s" : ""} sent in ${monthLabel(month)} ${unverified.length > 1 ? "are" : "is"} waiting for Operations to verify ${unverified.length > 1 ? "them" : "it"}`,
      link: "/staff/consultant-orders?tab=slips",
    });
  const lines = computeMonth(db, month);
  const held = lines.filter((l) => l.hold);
  if (held.length)
    warnings.push({ text: `${held.length} payout${held.length > 1 ? "s" : ""} will be held until bank details are verified`, link: "/staff/bank-details" });
  const refunds = db.consultantOrders.filter((o) => o.refund?.status === "requested");
  if (refunds.length) warnings.push({ text: `${refunds.length} refund request${refunds.length > 1 ? "s" : ""} not yet decided`, link: "/staff/refunds" });
  return { ok: blocking.length === 0, blocking, warnings };
}

export function closeMonth(d: Draft<Db>, month: string, nowIso: string): Draft<CommissionMonth> {
  const check = closeChecks(d, month, nowIso);
  if (!check.ok) throw new Error(check.blocking.map((b) => b.text).join(". "));
  const lines = computeMonth(d, month);
  for (const a of pendingAdjustments(d)) {
    const da = d.commissionAdjustments.find((x) => x.id === a.id)!;
    da.appliedInMonth = month;
  }
  const ts = stamp(d);
  const cm: CommissionMonth = {
    id: month,
    status: "locked",
    closedAt: ts,
    closedBy: actor(d),
    settingsUsed: JSON.parse(JSON.stringify(d.settings.commission)),
    lines,
  };
  d.commissionMonths.push(cm);
  // payout batch, carrying failed payments from earlier batches
  const carried = d.payoutBatches
    .flatMap((b) => b.lines.filter((l) => l.status === "failed" || l.status === "held").map((l) => ({ l, from: b.month, batch: b })))
    .filter((x) => x.l.carriedFrom !== "moved");
  const batchLines: PayoutBatch["lines"] = [];
  for (const l of lines.filter((x) => x.payable > 0)) {
    batchLines.push({ consultantId: l.sponsorId, amount: l.payable, status: l.hold ? "held" : "pending", failReason: l.hold });
  }
  for (const c of carried) {
    const s = consultantById(d, c.l.consultantId);
    const hold = s && !s.bankVerified ? "Bank details not verified" : undefined;
    batchLines.push({ consultantId: c.l.consultantId, amount: c.l.amount, status: hold ? "held" : "pending", carriedFrom: c.from, failReason: hold });
    // mark the old line as moved
    const ob = d.payoutBatches.find((b) => b.id === c.batch.id)!;
    const ol = ob.lines.find((x) => x.consultantId === c.l.consultantId && x.amount === c.l.amount && (x.status === "failed" || x.status === "held"));
    if (ol) {
      ol.failReason = `${ol.failReason ?? "Not paid"}; moved to the ${monthLabel(month)} batch`;
      ol.carriedFrom = "moved";
    }
  }
  d.payoutBatches.unshift({ id: `PB-${month}`, month, createdAt: ts, status: "draft", lines: batchLines });
  audit(d, {
    by: actor(d),
    area: "Commission",
    action: `${monthLabel(month)} closed and locked`,
    entityId: month,
    after: `${lines.filter((l) => l.qualifies).length} sponsors qualified, ${lkr(lines.reduce((a, l) => a + l.payable, 0))} payable`,
  });
  notify(d, { role: "finance" }, `Payout batch for ${monthLabel(month)} ready to approve`, `/staff/payouts/PB-${month}`);
  return d.commissionMonths[d.commissionMonths.length - 1];
}

export function approvePayout(d: Draft<Db>, batchId: string) {
  const b = d.payoutBatches.find((x) => x.id === batchId);
  if (!b || b.status !== "draft") return;
  b.status = "approved";
  b.approvedBy = actor(d);
  b.approvedAt = stamp(d);
  const m = d.commissionMonths.find((x) => x.id === b.month);
  if (m) m.status = "payout_approved";
  audit(d, { by: actor(d), area: "Payouts", action: `Payout batch approved ${b.id}`, entityId: b.id, after: lkr(b.lines.filter((l) => l.status === "pending").reduce((a, l) => a + l.amount, 0)) });
}

export function bankFileCsv(db: D, batchId: string): string {
  const b = db.payoutBatches.find((x) => x.id === batchId);
  if (!b) return "";
  const rows = [["Beneficiary name", "Bank", "Branch", "Account number", "Amount (LKR)", "Reference"]];
  for (const l of b.lines.filter((x) => x.status === "pending" || x.status === "paid")) {
    const c = consultantById(db, l.consultantId)!;
    rows.push([c.bank.accountName || fullName(c), c.bank.bank, c.bank.branch, c.bank.accountNumber, l.amount.toFixed(2), `FemmeCare commission ${b.month} ${consultantCode(c.number)}`]);
  }
  return rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
}

export function markFileGenerated(d: Draft<Db>, batchId: string) {
  const b = d.payoutBatches.find((x) => x.id === batchId);
  if (!b || (b.status !== "approved" && b.status !== "file_generated")) throw new Error("Approve the batch before creating the bank file");
  b.status = "file_generated";
  b.fileGeneratedAt = stamp(d);
  audit(d, { by: actor(d), area: "Payouts", action: `Bank file created ${b.id}`, entityId: b.id });
}

/** Record the bank's result for each line. `failIds` are consultants whose transfer failed. */
export function recordResults(d: Draft<Db>, batchId: string, failIds: string[] = [], failReason = "Account number not valid at the bank") {
  const b = d.payoutBatches.find((x) => x.id === batchId);
  if (!b || b.status !== "file_generated") throw new Error("Create the bank file first");
  const ts = stamp(d);
  let n = 0;
  for (const l of b.lines) {
    if (l.status !== "pending") continue;
    n += 1;
    if (failIds.includes(l.consultantId)) {
      l.status = "failed";
      l.failReason = failReason;
    } else {
      l.status = "paid";
      l.bankRef = `BOC${ts.slice(2, 4)}${ts.slice(5, 7)}${String(1000 + n)}`;
      const c = consultantById(d, l.consultantId);
      if (c)
        sendMessage(d, {
          channel: "sms",
          to: c.mobile,
          toName: fullName(c),
          body: `FemmeCare: Your ${monthLabel(b.month)} commission of ${lkr(l.amount)} has been paid to your bank account.`,
          relatedType: "Payout",
          relatedId: b.id,
        });
    }
  }
  b.status = "results_recorded";
  b.resultsAt = ts;
  const m = d.commissionMonths.find((x) => x.id === b.month);
  if (m) m.status = "paid";
  audit(d, { by: actor(d), area: "Payouts", action: `Bank results recorded ${b.id}`, entityId: b.id, after: `${b.lines.filter((l) => l.status === "paid").length} paid, ${b.lines.filter((l) => l.status === "failed").length} failed` });
}

/** Statement figures for one consultant and month. */
export function statement(db: D, consultantId: string, month: string) {
  const closed = db.commissionMonths.find((m) => m.id === month);
  const settings = closed?.settingsUsed ?? db.settings.commission;
  const line = closed ? closed.lines.find((l) => l.sponsorId === consultantId) : computeMonth(db, month, settings).find((l) => l.sponsorId === consultantId);
  const team = directTeam(db, consultantId);
  const sales = salesByConsultant(db, month, settings);
  const ownOrders = db.consultantOrders.filter((o) => o.consultantId === consultantId && isQualifying(o) && salesMonth(o.paidAt!, settings.cutoff) === month);
  const margin = round2(ownOrders.reduce((a, o) => a + (o.mrpValue - o.subtotal), 0));
  const payout = db.payoutBatches.find((b) => b.month === month)?.lines.find((l) => l.consultantId === consultantId);
  const adjustments = db.commissionAdjustments.filter((a) => a.sponsorId === consultantId && a.appliedInMonth === month);
  return {
    closed: !!closed,
    settings,
    line,
    team: team.map((c) => ({ consultant: c as Consultant, sales: round2(sales.get(c.id) ?? 0) })),
    ownSales: round2(sales.get(consultantId) ?? 0),
    margin,
    payout,
    adjustments,
  };
}

export function commissionLiability(db: D) {
  const open = db.payoutBatches.flatMap((b) => b.lines).filter((l) => l.status === "pending" || l.status === "held" || (l.status === "failed" && l.carriedFrom !== "moved"));
  return round2(open.reduce((a, l) => a + l.amount, 0));
}

export function notifyMonthEnd(d: Draft<Db>, month: string) {
  notify(d, { role: "finance" }, `${monthLabel(month)} has ended. Close the month and pay commission by the 5th`, "/staff/month-end");
}
