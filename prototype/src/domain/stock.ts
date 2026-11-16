// Stock: allocations per channel, batches with expiry, FEFO picking,
// goods received, moves between allocations, counts and adjustments.

import type { Draft } from "immer";
import type { Batch, Channel, CountLine, Db, Grn, Product, StockCount, StockLot } from "./types";
import { actor, audit, nextId, notify, stamp } from "./db";
import { addDays, daysBetween } from "./format";

type D = Draft<Db> | Db;

export const CHANNEL_LABEL: Record<Channel, string> = {
  outlet: "Retail outlets",
  consultant: "Consultants",
};

export function lotId(batchId: string, channel: Channel, productId = "") {
  return `${productId}:${batchId}:${channel}`;
}

function lot(d: Draft<Db>, productId: string, batchId: string, channel: Channel): Draft<StockLot> {
  const id = lotId(batchId, channel, productId);
  let l = d.stockLots.find((x) => x.id === id);
  if (!l) {
    l = { id, productId, batchId, channel, onHand: 0, reserved: 0 };
    d.stockLots.push(l);
  }
  return l;
}

export function batchOf(db: D, batchId: string): Batch | undefined {
  return db.batches.find((b) => b.id === batchId);
}

/** Lots of a product in a channel, earliest expiry first. */
export function lotsFefo(db: D, productId: string, channel: Channel): StockLot[] {
  const exp = (b: string) => batchOf(db, b)?.expiryDate ?? "9999";
  return db.stockLots
    .filter((l) => l.productId === productId && l.channel === channel && l.onHand > 0)
    .slice()
    .sort((a, b) => exp(a.batchId).localeCompare(exp(b.batchId)));
}

export function onHand(db: D, productId: string, channel: Channel): number {
  return db.stockLots
    .filter((l) => l.productId === productId && l.channel === channel)
    .reduce((s, l) => s + l.onHand, 0);
}

export function reserved(db: D, productId: string, channel: Channel): number {
  return db.stockLots
    .filter((l) => l.productId === productId && l.channel === channel)
    .reduce((s, l) => s + l.reserved, 0);
}

export function available(db: D, productId: string, channel: Channel): number {
  return Math.max(0, onHand(db, productId, channel) - reserved(db, productId, channel));
}

/** Reserve quantity in a channel (no batch chosen yet). Returns how much could be reserved. */
export function reserve(d: Draft<Db>, productId: string, channel: Channel, qty: number): number {
  let left = qty;
  for (const l of lotsFefo(d, productId, channel)) {
    const dl = d.stockLots.find((x) => x.id === l.id)!;
    const free = dl.onHand - dl.reserved;
    if (free <= 0) continue;
    const take = Math.min(free, left);
    dl.reserved += take;
    left -= take;
    if (left === 0) break;
  }
  return qty - left;
}

export function release(d: Draft<Db>, productId: string, channel: Channel, qty: number) {
  let left = qty;
  // release from latest expiry first, so FEFO stock stays reserved
  const lots = lotsFefo(d, productId, channel).reverse();
  for (const l of lots) {
    const dl = d.stockLots.find((x) => x.id === l.id)!;
    const take = Math.min(dl.reserved, left);
    dl.reserved -= take;
    left -= take;
    if (left === 0) break;
  }
}

/** FEFO pick plan for a quantity already reserved in a channel. */
export function pickPlan(db: D, productId: string, channel: Channel, qty: number) {
  const plan: { batchId: string; qty: number; expiryDate: string }[] = [];
  let left = qty;
  for (const l of lotsFefo(db, productId, channel)) {
    const take = Math.min(l.onHand, left);
    if (take <= 0) continue;
    plan.push({ batchId: l.batchId, qty: take, expiryDate: batchOf(db, l.batchId)?.expiryDate ?? "" });
    left -= take;
    if (left === 0) break;
  }
  return plan;
}

/** Issue reserved stock from a specific batch (on dispatch). */
export function issue(
  d: Draft<Db>,
  productId: string,
  batchId: string,
  channel: Channel,
  qty: number,
  ref: { type: string; id: string },
) {
  const l = lot(d, productId, batchId, channel);
  l.onHand -= qty;
  l.reserved = Math.max(0, l.reserved - qty);
  d.movements.unshift({
    id: nextId(d, "MOV", 6),
    ts: stamp(d),
    productId,
    batchId,
    channel,
    type: "Sales issue",
    qtyIn: 0,
    qtyOut: qty,
    refType: ref.type,
    refId: ref.id,
    userId: actor(d),
    unitCost: d.products.find((p) => p.id === productId)?.costPrice,
  });
}

export function addStock(
  d: Draft<Db>,
  productId: string,
  batchId: string,
  channel: Channel,
  qty: number,
  type: "Opening balance" | "Goods received" | "Transfer in" | "Adjustment in" | "Count difference" | "Customer return",
  ref?: { type: string; id: string },
  reason?: string,
) {
  if (qty === 0) return;
  const l = lot(d, productId, batchId, channel);
  l.onHand += qty;
  d.movements.unshift({
    id: nextId(d, "MOV", 6),
    ts: stamp(d),
    productId,
    batchId,
    channel,
    type,
    qtyIn: qty > 0 ? qty : 0,
    qtyOut: qty < 0 ? -qty : 0,
    refType: ref?.type,
    refId: ref?.id,
    userId: actor(d),
    reason,
    unitCost: d.products.find((p) => p.id === productId)?.costPrice,
  });
}

export function removeStock(
  d: Draft<Db>,
  productId: string,
  batchId: string,
  channel: Channel,
  qty: number,
  type: "Transfer out" | "Adjustment out" | "Count difference",
  ref?: { type: string; id: string },
  reason?: string,
) {
  const l = lot(d, productId, batchId, channel);
  l.onHand -= qty;
  d.movements.unshift({
    id: nextId(d, "MOV", 6),
    ts: stamp(d),
    productId,
    batchId,
    channel,
    type,
    qtyIn: 0,
    qtyOut: qty,
    refType: ref?.type,
    refId: ref?.id,
    userId: actor(d),
    reason,
    unitCost: d.products.find((p) => p.id === productId)?.costPrice,
  });
}

// ---------- Goods received ----------

/** Batch numbers are unique across products: B + year and month made + running number. */
export function nextBatchId(d: Draft<Db>, iso: string) {
  const ym = iso.slice(2, 4) + iso.slice(5, 7);
  const used = new Set([...d.batches.map((b) => b.id), ...d.grns.map((g) => g.batchId)]);
  let n = 1;
  while (used.has(`B${ym}-${String(n).padStart(2, "0")}`)) n += 1;
  return `B${ym}-${String(n).padStart(2, "0")}`;
}

/** Production has sent stock: a GRN waits for Stores to record it. */
export function expectGrn(
  d: Draft<Db>,
  input: { productId: string; qty: number; mfgDate: string; expiryDate: string; productionRef: string },
): Grn {
  const ts = stamp(d);
  const g: Grn = {
    id: nextId(d, "GRN", 4),
    status: "expected",
    ts,
    productId: input.productId,
    batchId: nextBatchId(d, input.mfgDate),
    qty: input.qty,
    split: { outlet: Math.round(input.qty * 0.6), consultant: input.qty - Math.round(input.qty * 0.6) },
    mfgDate: input.mfgDate,
    expiryDate: input.expiryDate,
    productionRef: input.productionRef,
  };
  d.grns.unshift(g);
  notify(d, { role: "stores" }, `Stock arrived from production: ${input.qty} × ${input.productId}`, `/staff/grn/${g.id}`);
  return g;
}

/** Record a GRN: creates the batch and puts stock into the allocations. */
export function recordGrn(
  d: Draft<Db>,
  input: {
    grnId?: string;
    productId: string;
    qty: number;
    batchId?: string;
    mfgDate: string;
    expiryDate: string;
    split: Record<Channel, number>;
    productionRef: string;
  },
): Draft<Grn> {
  if (input.split.outlet + input.split.consultant !== input.qty)
    throw new Error("The split must add up to the quantity received");
  if (input.expiryDate <= input.mfgDate) throw new Error("Expiry date must be after the manufacturing date");
  let g = input.grnId ? d.grns.find((x) => x.id === input.grnId) : undefined;
  if (!g) {
    g = {
      id: nextId(d, "GRN", 4),
      status: "recorded",
      ts: stamp(d),
      productId: input.productId,
      batchId: input.batchId ?? nextBatchId(d, input.mfgDate),
      qty: input.qty,
      split: input.split,
      mfgDate: input.mfgDate,
      expiryDate: input.expiryDate,
      productionRef: input.productionRef,
    };
    d.grns.unshift(g);
  }
  g.status = "recorded";
  g.ts = stamp(d);
  g.qty = input.qty;
  g.split = input.split;
  g.mfgDate = input.mfgDate;
  g.expiryDate = input.expiryDate;
  g.receivedBy = actor(d);
  if (!d.batches.find((b) => b.id === g!.batchId)) {
    d.batches.push({
      id: g.batchId,
      productId: g.productId,
      mfgDate: g.mfgDate,
      expiryDate: g.expiryDate,
      grnId: g.id,
    });
  }
  for (const ch of ["outlet", "consultant"] as Channel[]) {
    if (g.split[ch] > 0) addStock(d, g.productId, g.batchId, ch, g.split[ch], "Goods received", { type: "GRN", id: g.id });
  }
  audit(d, {
    by: actor(d),
    area: "Stock",
    action: `Goods received ${g.id}`,
    entityId: g.id,
    after: `${g.qty} × ${g.productId}, batch ${g.batchId}, outlets ${g.split.outlet}, consultants ${g.split.consultant}`,
  });
  return g;
}

// ---------- Moves between allocations ----------

export function requestTransfer(
  d: Draft<Db>,
  input: { productId: string; batchId: string; from: Channel; to: Channel; qty: number; reason: string },
) {
  const l = d.stockLots.find((x) => x.id === lotId(input.batchId, input.from, input.productId));
  const free = l ? l.onHand - l.reserved : 0;
  if (input.qty <= 0 || input.qty > free) throw new Error(`Only ${free} free in that batch`);
  if (!input.reason.trim()) throw new Error("A reason is required");
  const t = {
    id: nextId(d, "TRF", 4),
    ts: stamp(d),
    ...input,
    status: "requested" as const,
    requestedBy: actor(d),
  };
  d.transfers.unshift(t);
  audit(d, { by: actor(d), area: "Stock", action: `Move requested ${t.id}`, entityId: t.id, after: `${t.qty} × ${t.productId} from ${CHANNEL_LABEL[t.from]} to ${CHANNEL_LABEL[t.to]}`, reason: t.reason });
  if (d.settings.stock.transferApproval) {
    notify(d, { role: "admin" }, `Stock move to approve: ${t.qty} × ${t.productId}`, `/staff/transfers`);
  } else {
    decideTransfer(d, t.id, true);
  }
  return t;
}

export function decideTransfer(d: Draft<Db>, id: string, approve: boolean, rejectReason?: string) {
  const t = d.transfers.find((x) => x.id === id);
  if (!t || t.status !== "requested") return;
  t.decidedBy = actor(d);
  t.decidedAt = stamp(d);
  if (!approve) {
    t.status = "rejected";
    t.rejectReason = rejectReason;
    audit(d, { by: actor(d), area: "Stock", action: `Move rejected ${t.id}`, entityId: t.id, reason: rejectReason });
    return;
  }
  t.status = "approved";
  removeStock(d, t.productId, t.batchId, t.from, t.qty, "Transfer out", { type: "TRF", id: t.id }, t.reason);
  addStock(d, t.productId, t.batchId, t.to, t.qty, "Transfer in", { type: "TRF", id: t.id }, t.reason);
  audit(d, { by: actor(d), area: "Stock", action: `Move approved ${t.id}`, entityId: t.id });
}

// ---------- Counts and adjustments ----------

export function startCount(d: Draft<Db>, productIds?: string[]) {
  const lines: CountLine[] = d.stockLots
    .filter((l) => l.onHand > 0 && (!productIds || productIds.includes(l.productId)))
    .map((l) => ({ productId: l.productId, batchId: l.batchId, channel: l.channel, systemQty: l.onHand }));
  const c: StockCount = { id: nextId(d, "CNT", 4), ts: stamp(d), status: "counting", countedBy: actor(d), lines };
  d.counts.unshift(c);
  return d.counts[0];
}

export function countDifference(line: { systemQty: number; counted?: number; recounted?: number }) {
  const final = line.recounted ?? line.counted;
  return final === undefined ? 0 : final - line.systemQty;
}

export function submitCount(d: Draft<Db>, id: string) {
  const c = d.counts.find((x) => x.id === id);
  if (!c) return;
  const limit = d.settings.stock.recountLimit;
  const needsRecount = c.lines.some((l) => l.recounted === undefined && Math.abs(countDifference(l)) > limit);
  c.status = needsRecount && c.status === "counting" ? "recount" : "submitted";
  audit(d, { by: actor(d), area: "Stock", action: `Count ${c.status === "recount" ? "needs recount" : "submitted"} ${c.id}`, entityId: c.id });
  if (c.status === "submitted") notify(d, { role: "stores" }, `Stock count ${c.id} waiting for approval`, `/staff/counts/${c.id}`);
}

export function decideCount(d: Draft<Db>, id: string, approve: boolean, note?: string) {
  const c = d.counts.find((x) => x.id === id);
  if (!c || c.status !== "submitted") return;
  if (c.countedBy === actor(d)) throw new Error("A count must be approved by someone other than the counter");
  c.decidedBy = actor(d);
  c.decidedAt = stamp(d);
  c.note = note;
  if (!approve) {
    c.status = "rejected";
    audit(d, { by: actor(d), area: "Stock", action: `Count rejected ${c.id}`, entityId: c.id, reason: note });
    return;
  }
  c.status = "approved";
  for (const l of c.lines) {
    const diff = countDifference(l);
    if (diff === 0) continue;
    const adj = {
      id: nextId(d, "ADJ", 4),
      ts: stamp(d),
      productId: l.productId,
      batchId: l.batchId,
      channel: l.channel,
      qty: diff,
      reason: `Stock count ${c.id}`,
      userId: actor(d),
      countId: c.id,
    };
    d.adjustments.unshift(adj);
    if (diff > 0) addStock(d, l.productId, l.batchId, l.channel, diff, "Count difference", { type: "CNT", id: c.id }, adj.reason);
    else removeStock(d, l.productId, l.batchId, l.channel, -diff, "Count difference", { type: "CNT", id: c.id }, adj.reason);
    audit(d, {
      by: actor(d),
      area: "Stock",
      action: `Count difference posted ${adj.id}`,
      entityId: adj.id,
      before: String(l.systemQty),
      after: String(l.systemQty + diff),
      reason: note ?? adj.reason,
    });
  }
}

export function adjust(
  d: Draft<Db>,
  input: { productId: string; batchId: string; channel: Channel; qty: number; reason: string },
) {
  if (!input.reason.trim()) throw new Error("A reason is required");
  const adj = { id: nextId(d, "ADJ", 4), ts: stamp(d), ...input, userId: actor(d) };
  d.adjustments.unshift(adj);
  if (input.qty > 0) addStock(d, input.productId, input.batchId, input.channel, input.qty, "Adjustment in", { type: "ADJ", id: adj.id }, input.reason);
  else removeStock(d, input.productId, input.batchId, input.channel, -input.qty, "Adjustment out", { type: "ADJ", id: adj.id }, input.reason);
  audit(d, { by: actor(d), area: "Stock", action: `Stock adjusted ${adj.id}`, entityId: adj.id, after: `${input.qty > 0 ? "+" : ""}${input.qty} × ${input.productId} (${CHANNEL_LABEL[input.channel]})`, reason: input.reason });
  return adj;
}

// ---------- Alerts and cover ----------

/** Units issued in the last 28 days in a channel. */
export function soldLast4Weeks(db: D, productId: string, channel: Channel, nowIso: string): number {
  const from = addDays(nowIso, -28);
  return db.movements
    .filter((m) => m.productId === productId && m.channel === channel && m.type === "Sales issue" && m.ts >= from && m.ts <= nowIso)
    .reduce((s, m) => s + m.qtyOut, 0);
}

export function weeksOfCover(db: D, productId: string, channel: Channel, nowIso: string): number | null {
  const weekly = soldLast4Weeks(db, productId, channel, nowIso) / 4;
  if (weekly <= 0) return null;
  return onHand(db, productId, channel) / weekly;
}

export interface StockAlert {
  kind: "low" | "expiry";
  productId: string;
  channel?: Channel;
  batchId?: string;
  text: string;
}

export function stockAlerts(db: D, nowIso: string): StockAlert[] {
  const out: StockAlert[] = [];
  for (const p of db.products.filter((x) => x.status === "active")) {
    for (const ch of ["outlet", "consultant"] as Channel[]) {
      const have = available(db, p.id, ch);
      if (have <= p.reorder[ch])
        out.push({ kind: "low", productId: p.id, channel: ch, text: `${p.name}: ${have} available for ${CHANNEL_LABEL[ch].toLowerCase()} (reorder at ${p.reorder[ch]})` });
    }
  }
  const warn = db.settings.stock.expiryWarnDays;
  for (const b of db.batches) {
    const qty = db.stockLots.filter((l) => l.batchId === b.id).reduce((s, l) => s + l.onHand, 0);
    if (qty <= 0) continue;
    const days = daysBetween(nowIso, b.expiryDate);
    if (days <= warn)
      out.push({ kind: "expiry", productId: b.productId, batchId: b.id, text: `Batch ${b.id} (${qty} units) expires in ${days} days` });
  }
  return out;
}

export function productName(db: D, id: string): string {
  return db.products.find((p) => p.id === id)?.name ?? id;
}

export function productOf(db: D, id: string): Product | undefined {
  return db.products.find((p) => p.id === id);
}

/** Every order a batch went to (recall list). */
export function batchTrace(db: D, batchId: string) {
  return db.dispatches
    .filter((x) => x.lines.some((l) => l.batchId === batchId) && (x.status === "dispatched" || x.status === "delivered"))
    .map((x) => ({
      dispatch: x,
      qty: x.lines.filter((l) => l.batchId === batchId).reduce((s, l) => s + l.qty, 0),
    }));
}

/** Stock value at cost (the workbook's Inventory Summary). */
export function stockValue(db: D, productId?: string, channel?: Channel): number {
  return db.stockLots
    .filter((l) => (!productId || l.productId === productId) && (!channel || l.channel === channel))
    .reduce((s, l) => s + l.onHand * (db.products.find((p) => p.id === l.productId)?.costPrice ?? 0), 0);
}
