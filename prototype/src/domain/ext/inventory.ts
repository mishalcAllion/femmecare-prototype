// Extra stock rules and read helpers for the inventory screens.
// Data changes still go through `mutate`, so they are saved and shown everywhere.

import { mutate } from "../db";
import type { Result } from "../actions";
import type { Channel, Db } from "../types";
import { available, batchOf, lotsFefo, onHand, productName, soldLast4Weeks, stockValue } from "../stock";
import { ean13 } from "../seed/data";

export const CHANNELS: Channel[] = ["outlet", "consultant"];

/** The batch number recording a GRN would create for a manufacturing date (read-only preview). */
export function previewBatchId(db: Db, mfgDate: string): string {
  if (!/^\d{4}-\d{2}/.test(mfgDate)) return "";
  const ym = mfgDate.slice(2, 4) + mfgDate.slice(5, 7);
  const used = new Set([...db.batches.map((b) => b.id), ...db.grns.map((g) => g.batchId)]);
  let n = 1;
  while (used.has(`B${ym}-${String(n).padStart(2, "0")}`)) n += 1;
  return `B${ym}-${String(n).padStart(2, "0")}`;
}

/** Stock of one batch, per channel. */
export function batchStock(db: Db, batchId: string) {
  return CHANNELS.map((ch) => {
    const lots = db.stockLots.filter((l) => l.batchId === batchId && l.channel === ch);
    const onHand = lots.reduce((s, l) => s + l.onHand, 0);
    const reserved = lots.reduce((s, l) => s + l.reserved, 0);
    return { channel: ch, onHand, reserved, available: Math.max(0, onHand - reserved) };
  });
}

/** Lots of a product in a channel with free stock, earliest expiry first (for move and adjustment forms). */
export function lotOptions(db: Db, productId: string, channel: Channel, includeEmpty = false) {
  const lots = includeEmpty
    ? db.stockLots.filter((l) => l.productId === productId && l.channel === channel)
    : lotsFefo(db, productId, channel);
  return lots
    .map((l) => ({ batchId: l.batchId, onHand: l.onHand, free: Math.max(0, l.onHand - l.reserved), expiry: batchOf(db, l.batchId)?.expiryDate ?? "" }))
    .sort((a, b) => a.expiry.localeCompare(b.expiry));
}

export function stockValueAtCost(db: Db, channels: Channel[]) {
  return db.stockLots
    .filter((l) => channels.includes(l.channel))
    .reduce((s, l) => s + l.onHand * (db.products.find((p) => p.id === l.productId)?.costPrice ?? 0), 0);
}

export function weeklyRate(db: Db, productId: string, channel: Channel, now: string) {
  return soldLast4Weeks(db, productId, channel, now) / 4;
}

/** Next free item code, e.g. FC007. */
export function nextProductCode(db: Db) {
  const max = db.products.reduce((m, p) => Math.max(m, Number(p.id.replace(/\D/g, "")) || 0), 0);
  return `FC${String(max + 1).padStart(3, "0")}`;
}

/** A new EAN-13 in FemmeCare's number range, used only when the pack has no printed barcode. */
export function generateBarcode(db: Db) {
  let n = db.products.length + 1;
  let code = ean13(`4791001${String(n).padStart(5, "0")}`);
  while (db.products.some((p) => p.barcode === code)) {
    n += 1;
    code = ean13(`4791001${String(n).padStart(5, "0")}`);
  }
  return code;
}

/**
 * Inventory summary for one product in one channel allocation, as on the workbook's
 * Inventory Summary sheet: opening stock (the first goods received, or an opening
 * balance), total in and out since, on hand, reorder status and value at cost.
 */
export function inventorySummary(db: Db, productId: string, channel: Channel) {
  const p = db.products.find((x) => x.id === productId);
  const ms = db.movements.filter((m) => m.productId === productId && m.channel === channel);
  const openingMoves = ms.filter((m) => m.type === "Opening balance").reduce((s, m) => s + m.qtyIn - m.qtyOut, 0);
  const firstGrn = db.grns
    .filter((g) => g.status === "recorded" && g.productId === productId)
    .sort((a, b) => a.ts.localeCompare(b.ts))[0];
  const opening = openingMoves || (firstGrn ? firstGrn.split[channel] : 0);
  const allIn = ms.reduce((s, m) => s + m.qtyIn, 0);
  const totalOut = ms.reduce((s, m) => s + m.qtyOut, 0);
  const have = onHand(db, productId, channel);
  const avail = available(db, productId, channel);
  const reorder = p?.reorder[channel] ?? 0;
  return {
    opening,
    totalIn: allIn - opening,
    totalOut,
    onHand: have,
    available: avail,
    reorder,
    status: avail <= reorder ? ("Reorder" as const) : ("OK" as const),
    unitCost: p?.costPrice ?? 0,
    value: stockValue(db, productId, channel),
  };
}

/** Reference types on stock movements, in plain words. */
export const REF_TYPE_LABEL: Record<string, string> = {
  GRN: "Goods received note",
  Dispatch: "Dispatch",
  CNT: "Stock count",
  TRF: "Stock move",
  ADJ: "Adjustment",
};

export function locationLabel(channel: Channel, consultantLabel = "Consultant") {
  return `Main warehouse · ${channel === "outlet" ? "Retail outlets" : `${consultantLabel}s`}`;
}

export const ADJUST_REASONS = ["Damaged in the warehouse", "Samples given out", "Expired and written off", "Found during a shelf check", "Other"];

/**
 * Scan one pack into a chosen count line (a batch on a shelf in one allocation).
 * The scanner gives the product; the counter has already chosen the shelf, so a
 * pack of another product is refused instead of being added to the wrong line.
 */
export function scanCountLine(countId: string, lineIndex: number, code: string, recount: boolean): Result<string> {
  try {
    const value = mutate((d) => {
      const c = d.counts.find((x) => x.id === countId);
      if (!c) throw new Error("Count not found");
      if (c.status !== "counting" && c.status !== "recount") throw new Error("This count has been submitted");
      const clean = code.trim();
      const p = d.products.find((x) => x.barcode === clean || x.id.toLowerCase() === clean.toLowerCase());
      if (!p) throw new Error(`Barcode ${clean} is not a FemmeCare product`);
      const line = c.lines[lineIndex];
      if (!line) throw new Error("Choose the shelf you are counting first");
      if (line.productId !== p.id) throw new Error(`Wrong product: ${p.name} scanned, this shelf holds ${productName(d, line.productId)}`);
      if (recount) line.recounted = (line.recounted ?? 0) + 1;
      else line.counted = (line.counted ?? 0) + 1;
      return `${p.name}: ${recount ? line.recounted : line.counted}`;
    });
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
