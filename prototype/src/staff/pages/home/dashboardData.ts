// Figures for the management dashboard, worked out from the same records the
// lists and reports use, so every number can be traced back.

import type { Channel, ConsultantOrder, Db, OutletOrder } from "@/domain/types";
import { commissionLiability, computeMonth, isQualifying } from "@/domain/commission";
import { invoiceStatus } from "@/domain/outlets";
import { onHand } from "@/domain/stock";
import { dayKey, lastDayOfMonth, monthKey, monthLabel, prevMonthKey, nextMonthKey, round2 } from "@/domain/format";

export type RangeId = "this_month" | "last_month" | "last_3" | "last_6" | "this_year";
export type FulfilmentBucket = "Delivered" | "Processing" | "On hold" | "Cancelled";
export type PayBucket = "Paid" | "Pending" | "Failed or overdue" | "Refunded";

export interface DashFilters {
  range: RangeId;
  channel: "" | Channel;
  outletId: string;
  consultantId: string;
  sponsorId: string;
  productId: string;
  orderStatus: "" | FulfilmentBucket;
  paymentStatus: "" | PayBucket;
}

export const RANGES: { id: RangeId; label: string }[] = [
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "last_3", label: "Last 3 months" },
  { id: "last_6", label: "Last 6 months" },
  { id: "this_year", label: "This year" },
];

export function defaultRange(now: string): RangeId {
  return Number(dayKey(now).slice(8, 10)) <= 7 ? "last_month" : "this_month";
}

export function rangeDays(range: RangeId, now: string): { from: string; to: string; label: string } {
  const m = monthKey(now);
  const today = dayKey(now);
  switch (range) {
    case "this_month":
      return { from: `${m}-01`, to: today, label: monthLabel(m) };
    case "last_month": {
      const p = prevMonthKey(m);
      return { from: `${p}-01`, to: lastDayOfMonth(p), label: monthLabel(p) };
    }
    case "last_3": {
      const p = prevMonthKey(prevMonthKey(m));
      return { from: `${p}-01`, to: today, label: `${monthLabel(p, false)} to ${monthLabel(m, false)}` };
    }
    case "last_6": {
      let p = m;
      for (let i = 0; i < 5; i++) p = prevMonthKey(p);
      return { from: `${p}-01`, to: today, label: `${monthLabel(p, false)} to ${monthLabel(m, false)}` };
    }
    case "this_year":
      return { from: `${m.slice(0, 4)}-01-01`, to: today, label: m.slice(0, 4) };
  }
}

/** Same length period just before, for the trend arrows. */
function previousPeriod(from: string, to: string) {
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
  const pTo = new Date(Date.parse(from) - 86_400_000).toISOString().slice(0, 10);
  const pFrom = new Date(Date.parse(pTo) - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  return { from: pFrom, to: pTo };
}

const within = (iso: string | undefined, from: string, to: string) => !!iso && dayKey(iso) >= from && dayKey(iso) <= to;

export function coBucket(o: ConsultantOrder): FulfilmentBucket {
  if (o.deliveryStatus === "cancelled") return "Cancelled";
  if (o.deliveryStatus === "delivered") return "Delivered";
  if (["awaiting", "proof_uploaded", "failed", "rejected"].includes(o.paymentStatus)) return "On hold";
  return "Processing";
}

export function ooBucket(o: OutletOrder): FulfilmentBucket {
  if (o.status === "cancelled") return "Cancelled";
  if (o.status === "delivered" || o.status === "closed") return "Delivered";
  if (o.lines.every((l) => l.allocated === 0 && l.dispatched === 0) && o.lines.some((l) => l.backordered > 0)) return "On hold";
  return "Processing";
}

function coPay(o: ConsultantOrder): PayBucket {
  if (o.paymentStatus === "paid") return "Paid";
  if (o.paymentStatus === "refunded") return "Refunded";
  if (o.paymentStatus === "failed" || o.paymentStatus === "rejected") return "Failed or overdue";
  return "Pending";
}

export function dashboard(db: Db, now: string, f: DashFilters) {
  const { from, to, label } = rangeDays(f.range, now);
  const prev = previousPeriod(from, to);
  // A chosen outlet narrows to the outlet channel; a chosen consultant or sponsor to the consultant channel.
  const showOutlet = f.channel !== "consultant" && !f.consultantId && !f.sponsorId;
  const showCons = f.channel !== "outlet" && !f.outletId;

  const coScope = (o: ConsultantOrder) => {
    if (!showCons) return false;
    if (f.consultantId && o.consultantId !== f.consultantId) return false;
    if (f.sponsorId && db.consultants.find((c) => c.id === o.consultantId)?.sponsorId !== f.sponsorId) return false;
    if (f.productId && !o.lines.some((l) => l.productId === f.productId)) return false;
    if (f.orderStatus && coBucket(o) !== f.orderStatus) return false;
    if (f.paymentStatus && coPay(o) !== f.paymentStatus) return false;
    return true;
  };
  const coValue = (o: ConsultantOrder) => (f.productId ? o.lines.filter((l) => l.productId === f.productId).reduce((s, l) => s + l.price * l.qty, 0) : o.subtotal);
  const coMrp = (o: ConsultantOrder) => (f.productId ? o.lines.filter((l) => l.productId === f.productId).reduce((s, l) => s + l.mrp * l.qty, 0) : o.mrpValue);

  const ooScope = (o: OutletOrder) => {
    if (!showOutlet) return false;
    if (f.outletId && o.outletId !== f.outletId) return false;
    if (f.productId && !o.lines.some((l) => l.productId === f.productId)) return false;
    if (f.orderStatus && ooBucket(o) !== f.orderStatus) return false;
    return true;
  };
  const invScope = (i: Db["invoices"][number]) => {
    if (!showOutlet || i.status !== "issued") return false;
    if (f.outletId && i.outletId !== f.outletId) return false;
    if (f.paymentStatus) {
      const s = invoiceStatus(db, i, now);
      const b: PayBucket = s === "Paid" ? "Paid" : s === "Overdue" ? "Failed or overdue" : "Pending";
      if (b !== f.paymentStatus) return false;
    }
    if (f.orderStatus) {
      const o = db.outletOrders.find((x) => x.id === i.orderId);
      if (!o || ooBucket(o) !== f.orderStatus) return false;
    }
    return true;
  };
  const invValue = (i: Db["invoices"][number]) => (f.productId ? i.lines.filter((l) => l.productId === f.productId).reduce((s, l) => s + l.total, 0) : i.total);

  const consultantSales = (a: string, b: string) => round2(db.consultantOrders.filter((o) => coScope(o) && isQualifying(o) && within(o.paidAt, a, b)).reduce((s, o) => s + coValue(o), 0));
  const outletRevenue = (a: string, b: string) => round2(db.invoices.filter((i) => invScope(i) && within(i.date, a, b)).reduce((s, i) => s + invValue(i), 0));

  const cos = db.consultantOrders.filter((o) => coScope(o) && within(o.createdAt, from, to));
  const oos = db.outletOrders.filter((o) => ooScope(o) && within(o.createdAt, from, to));
  const prevOrders = db.consultantOrders.filter((o) => coScope(o) && within(o.createdAt, prev.from, prev.to)).length + db.outletOrders.filter((o) => ooScope(o) && within(o.createdAt, prev.from, prev.to)).length;

  const buckets: Record<FulfilmentBucket, number> = { Delivered: 0, Processing: 0, "On hold": 0, Cancelled: 0 };
  for (const o of cos) buckets[coBucket(o)] += 1;
  for (const o of oos) buckets[ooBucket(o)] += 1;
  const orders = cos.length + oos.length;
  const fulfilment = orders - buckets.Cancelled > 0 ? (buckets.Delivered / (orders - buckets.Cancelled)) * 100 : 0;

  // people
  const team = (c: Db["consultants"][number]) => (!f.sponsorId || c.sponsorId === f.sponsorId) && (!f.consultantId || c.id === f.consultantId);
  const registered = db.consultants.filter((c) => c.number !== undefined && c.number !== 1 && team(c) && (!c.joinedAt || dayKey(c.joinedAt) <= to));
  const active = registered.filter((c) => c.status === "active");
  const recruits = db.consultants.filter((c) => c.number !== undefined && team(c) && within(c.joinedAt, from, to)).length;
  const prevRecruits = db.consultants.filter((c) => c.number !== undefined && team(c) && within(c.joinedAt, prev.from, prev.to)).length;
  const pendingApps = db.consultants.filter((c) => c.status === "pending").length;

  // commission
  const lastClosed = db.commissionMonths.map((m) => m.id).sort().pop();
  const openMonths: string[] = [];
  const firstSale = db.consultantOrders.filter(isQualifying).map((o) => monthKey(o.paidAt!)).sort()[0];
  let m = lastClosed ? nextMonthKey(lastClosed) : firstSale ?? monthKey(now);
  while (m <= monthKey(now)) {
    openMonths.push(m);
    m = nextMonthKey(m);
  }
  const sponsorPick = f.sponsorId || f.consultantId;
  const provisional = round2(openMonths.reduce((s, mk) => s + computeMonth(db, mk).filter((l) => !sponsorPick || l.sponsorId === sponsorPick).reduce((a, l) => a + l.payable, 0), 0));
  const approvedUnpaid = sponsorPick
    ? round2(db.payoutBatches.flatMap((b) => b.lines).filter((l) => l.consultantId === sponsorPick && (l.status === "pending" || l.status === "held" || (l.status === "failed" && l.carriedFrom !== "moved"))).reduce((s, l) => s + l.amount, 0))
    : commissionLiability(db);

  // payments waiting
  const pendingOrders = db.consultantOrders.filter((o) => showCons && (!f.consultantId || o.consultantId === f.consultantId) && (!f.sponsorId || db.consultants.find((c) => c.id === o.consultantId)?.sponsorId === f.sponsorId) && o.deliveryStatus !== "cancelled" && ["awaiting", "proof_uploaded", "failed", "rejected"].includes(o.paymentStatus));
  const pendingValue = round2(pendingOrders.reduce((s, o) => s + o.total, 0));
  const pendingPeople = new Set(pendingOrders.map((o) => o.consultantId)).size;

  // outlet quantities
  let openQty = 0;
  let backQty = 0;
  for (const o of db.outletOrders) {
    if (!ooScope(o) || o.status === "cancelled") continue;
    for (const l of o.lines) {
      if (f.productId && l.productId !== f.productId) continue;
      openQty += l.allocated + l.dispatched + l.backordered;
      backQty += l.backordered;
    }
  }

  // monthly trend (6 months to the end of the period)
  const endMonth = monthKey(`${to}T12:00:00+05:30`);
  const months: string[] = [];
  let k = endMonth;
  for (let i = 0; i < 6; i++) {
    months.unshift(k);
    k = prevMonthKey(k);
  }
  const firstData = [...db.invoices.map((i) => i.date), ...db.consultantOrders.map((o) => o.createdAt)].sort()[0];
  const startMonth = firstData ? monthKey(firstData) : endMonth;
  const trendMonths = months.filter((x) => x >= startMonth);
  const monthRange = (mk: string) => ({ a: `${mk}-01`, b: lastDayOfMonth(mk) });
  const trend = trendMonths.map((mk) => {
    const { a, b } = monthRange(mk);
    return {
      month: monthLabel(mk, false).split(" ")[0],
      key: mk,
      outlets: showOutlet ? outletRevenue(a, b) : 0,
      consultants: showCons ? consultantSales(a, b) : 0,
      orders: db.consultantOrders.filter((o) => coScope(o) && within(o.createdAt, a, b)).length + db.outletOrders.filter((o) => ooScope(o) && within(o.createdAt, a, b)).length,
    };
  });
  const commissionTrend = trendMonths.map((mk) => {
    const closed = db.commissionMonths.find((x) => x.id === mk);
    const lines = (closed ? closed.lines : computeMonth(db, mk)).filter((l) => !sponsorPick || l.sponsorId === sponsorPick);
    return {
      month: monthLabel(mk, false).split(" ")[0],
      key: mk,
      provisional: round2(lines.reduce((s, l) => s + l.amount, 0)),
      payable: closed ? round2(lines.reduce((s, l) => s + l.payable, 0)) : 0,
      closed: !!closed,
    };
  });
  const recruitTrend = trendMonths.map((mk) => {
    const { a, b } = monthRange(mk);
    const joined = db.consultants.filter((c) => c.number !== undefined && team(c) && within(c.joinedAt, a, b)).length;
    const total = db.consultants.filter((c) => c.number !== undefined && c.number !== 1 && team(c) && c.joinedAt && dayKey(c.joinedAt) <= b && c.status !== "terminated" && c.status !== "rejected").length;
    return { month: monthLabel(mk, false).split(" ")[0], key: mk, recruits: joined, total };
  });

  // best sellers in the period
  const sold = new Map<string, { units: number; value: number }>();
  for (const o of db.consultantOrders.filter((x) => coScope(x) && isQualifying(x) && within(x.paidAt, from, to))) {
    for (const l of o.lines) {
      if (f.productId && l.productId !== f.productId) continue;
      const s = sold.get(l.productId) ?? { units: 0, value: 0 };
      s.units += l.qty;
      s.value += l.price * l.qty;
      sold.set(l.productId, s);
    }
  }
  for (const i of db.invoices.filter((x) => invScope(x) && within(x.date, from, to))) {
    for (const l of i.lines) {
      if (f.productId && l.productId !== f.productId) continue;
      const s = sold.get(l.productId) ?? { units: 0, value: 0 };
      s.units += l.qty;
      s.value += l.total;
      sold.set(l.productId, s);
    }
  }
  const soldTotal = [...sold.values()].reduce((s, x) => s + x.value, 0);
  const bestSellers = [...sold.entries()]
    .map(([id, s]) => ({ id, name: db.products.find((p) => p.id === id)?.name ?? id, units: s.units, value: round2(s.value), share: soldTotal ? (s.value / soldTotal) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);

  const stock = db.products
    .filter((p) => p.status === "active" && (!f.productId || p.id === f.productId))
    .map((p) => ({ name: p.name.replace("Ultra Care Pads ", "Pads "), id: p.id, outlets: showOutlet ? onHand(db, p.id, "outlet") : 0, consultants: showCons ? onHand(db, p.id, "consultant") : 0 }));

  const cs = consultantSales(from, to);
  const or = outletRevenue(from, to);
  const csPrev = consultantSales(prev.from, prev.to);
  const orPrev = outletRevenue(prev.from, prev.to);
  const pct = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : undefined);
  const mrpValue = round2(db.consultantOrders.filter((o) => coScope(o) && isQualifying(o) && within(o.paidAt, from, to)).reduce((s, o) => s + coMrp(o), 0));

  return {
    from,
    to,
    label,
    showOutlet,
    showCons,
    kpi: {
      registered: registered.length,
      active: active.length,
      recruits,
      recruitsTrend: pct(recruits, prevRecruits),
      pendingApps,
      consultantSales: cs,
      consultantSalesTrend: pct(cs, csPrev),
      mrpValue,
      outletRevenue: or,
      outletRevenueTrend: pct(or, orPrev),
      orders,
      ordersTrend: pct(orders, prevOrders),
      consultantOrders: cos.length,
      outletOrders: oos.length,
      fulfilment,
      delivered: buckets.Delivered,
      liability: round2(provisional + approvedUnpaid),
      provisional,
      approvedUnpaid,
      openMonths,
      pendingValue,
      pendingPeople,
      pendingCount: pendingOrders.length,
      openQty,
      backQty,
    },
    buckets,
    trend,
    commissionTrend,
    recruitTrend,
    bestSellers,
    stock,
  };
}
