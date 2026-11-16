// Retail outlet channel: register, orders with back-orders (first in, first out),
// dispatch, invoices and delivery notes, signed-note confirmation and payments.

import type { Draft } from "immer";
import type {
  Db,
  Dispatch,
  Invoice,
  Outlet,
  OutletOrder,
  OutletOrderLine,
  OutletOrderStatus,
  OutletPayment,
} from "./types";
import { actor, audit, nextId, notify, sendMessage, stamp } from "./db";
import { addDays, date, daysBetween, lkr, round2 } from "./format";
import { addStock, available, issue, pickPlan, productName, release, reserve } from "./stock";

type D = Draft<Db> | Db;

export const ORDER_STATUS_LABEL: Record<OutletOrderStatus, string> = {
  open: "Open",
  partly_delivered: "Partly delivered",
  delivered: "Delivered",
  closed: "Closed",
  cancelled: "Cancelled",
};

// ---------- Outlets ----------

export function createOutlet(d: Draft<Db>, o: Omit<Outlet, "id" | "since" | "status"> & { status?: Outlet["status"] }) {
  if (!o.name.trim()) throw new Error("Outlet name is required");
  const dup = d.outlets.find((x) => x.name.toLowerCase() === o.name.trim().toLowerCase() || (o.taxId && x.taxId === o.taxId));
  if (dup) throw new Error(`An outlet with this name or tax ID already exists (${dup.id})`);
  const outlet: Outlet = { ...o, id: nextId(d, "CUS", 4, false), since: stamp(d), status: o.status ?? "active" };
  d.outlets.push(outlet);
  audit(d, { by: actor(d), area: "Outlets", action: `Outlet registered ${outlet.id}`, entityId: outlet.id, after: outlet.name });
  return outlet;
}

export function updateOutlet(d: Draft<Db>, id: string, patch: Partial<Outlet>) {
  const o = d.outlets.find((x) => x.id === id);
  if (!o) return;
  const before = JSON.stringify({ name: o.name, paymentTerms: o.paymentTerms, creditLimit: o.creditLimit, status: o.status });
  Object.assign(o, patch);
  audit(d, {
    by: actor(d),
    area: "Outlets",
    action: `Outlet updated ${id}`,
    entityId: id,
    before,
    after: JSON.stringify({ name: o.name, paymentTerms: o.paymentTerms, creditLimit: o.creditLimit, status: o.status }),
  });
}

// ---------- Order maths ----------

export function lineValue(l: Pick<OutletOrderLine, "qty" | "unitPrice" | "discountPct">, qty = l.qty) {
  return round2(qty * l.unitPrice * (1 - l.discountPct / 100));
}

export function orderValue(o: OutletOrder) {
  return round2(o.lines.reduce((s, l) => s + lineValue(l), 0));
}

export function orderTotals(o: OutletOrder) {
  const t = { qty: 0, allocated: 0, dispatched: 0, delivered: 0, backordered: 0, lost: 0, cancelled: 0, difference: 0 };
  for (const l of o.lines) {
    t.qty += l.qty;
    t.allocated += l.allocated;
    t.dispatched += l.dispatched;
    t.delivered += l.delivered;
    t.backordered += l.backordered;
    t.lost += l.lost;
    t.cancelled += l.cancelled;
    t.difference += l.difference;
  }
  return t;
}

export function computeStatus(d: D, o: OutletOrder): OutletOrderStatus {
  if (o.status === "cancelled") return "cancelled";
  const t = orderTotals(o);
  const finished = t.delivered + t.lost + t.cancelled + t.difference;
  if (finished >= t.qty) return t.delivered + t.difference === t.qty - t.cancelled ? "delivered" : "closed";
  if (
    d.settings.outlets.backorderMode === "close_and_reconfirm" &&
    t.delivered > 0 &&
    t.allocated === 0 &&
    t.dispatched === 0
  )
    return "closed";
  if (t.delivered > 0) return "partly_delivered";
  return "open";
}

function refreshStatus(d: Draft<Db>, o: Draft<OutletOrder>) {
  o.status = computeStatus(d, o);
}

/** Back-ordered lines for a product, oldest order first. */
export function waitingQueue(db: D, productId: string) {
  return db.outletOrders
    .filter((o) => o.status !== "cancelled")
    .flatMap((o) => o.lines.filter((l) => l.productId === productId && l.backordered > 0).map((l) => ({ order: o, line: l })))
    .sort((a, b) => a.order.createdAt.localeCompare(b.order.createdAt));
}

export function queuePosition(db: D, orderId: string, productId: string): number {
  return waitingQueue(db, productId).findIndex((x) => x.order.id === orderId) + 1;
}

/** Stock a new order may take: available stock not already promised to older back-orders. */
export function freeForNewOrders(db: D, productId: string) {
  const waiting = waitingQueue(db, productId).reduce((s, x) => s + x.line.backordered, 0);
  return Math.max(0, available(db, productId, "outlet") - waiting);
}

export function stockCheck(db: D, lines: { productId: string; qty: number }[]) {
  return lines.map((l) => {
    const free = freeForNewOrders(db, l.productId);
    const now = Math.min(free, l.qty);
    return { productId: l.productId, qty: l.qty, supplyNow: now, short: l.qty - now, queueAhead: waitingQueue(db, l.productId).length };
  });
}

/** What the outlet owes: its opening balance plus unpaid invoices. */
export function outletBalance(db: D, outletId: string) {
  const opening = db.outlets.find((o) => o.id === outletId)?.openingBalance ?? 0;
  return (
    opening +
    db.invoices.filter((i) => i.outletId === outletId && i.status === "issued").reduce((s, i) => s + invoiceBalance(db, i), 0)
  );
}

/** The workbook's "Qty Outstanding": ordered but not yet delivered or closed. */
export function outstanding(l: OutletOrderLine) {
  return l.qty - l.delivered - l.lost - l.cancelled - l.difference;
}

export function creditWarning(db: D, outletId: string, newValue: number): string | undefined {
  if (!db.settings.outlets.creditWarning) return;
  const o = db.outlets.find((x) => x.id === outletId);
  if (!o || !o.creditLimit) return;
  const bal = outletBalance(db, outletId);
  if (bal + newValue > o.creditLimit)
    return `${o.name} owes ${lkr(bal)}. This order takes the balance to ${lkr(bal + newValue)}, over the credit limit of ${lkr(o.creditLimit)}.`;
}

// ---------- Orders ----------

export interface NewOutletOrder {
  outletId: string;
  poNumber: string;
  poDate: string;
  requiredDate: string;
  deliveryAddressId: string;
  notes?: string;
  source?: "manual" | "upload";
  hasPoPhoto?: boolean;
  deliveryMethod?: "Own vehicle" | "Courier" | "Customer collects";
  /** Save as "New" without allocating stock; confirm later. */
  asDraft?: boolean;
  lines: { productId: string; qty: number; unitPrice?: number; discountPct?: number; notes?: string }[];
}

export function createOutletOrder(d: Draft<Db>, input: NewOutletOrder): Draft<OutletOrder> {
  const outlet = d.outlets.find((o) => o.id === input.outletId);
  if (!outlet) throw new Error("Choose an outlet");
  if (outlet.status === "inactive") throw new Error(`${outlet.name} is inactive`);
  if (!input.poNumber.trim()) throw new Error("Enter the outlet's PO number");
  const lines = input.lines.filter((l) => l.productId && l.qty > 0);
  if (!lines.length) throw new Error("Add at least one product");
  if (d.outletOrders.some((o) => o.outletId === input.outletId && o.poNumber === input.poNumber.trim() && o.status !== "cancelled"))
    throw new Error(`PO ${input.poNumber} from ${outlet.name} is already entered`);
  const ts = stamp(d);
  const order: OutletOrder = {
    id: nextId(d, "SO", 5),
    outletId: input.outletId,
    poNumber: input.poNumber.trim(),
    poDate: input.poDate,
    requiredDate: input.requiredDate,
    deliveryAddressId: input.deliveryAddressId || outlet.deliveryAddresses[0]?.id,
    salespersonId: actor(d),
    createdAt: ts,
    status: "open",
    notes: input.notes ?? "",
    source: input.source ?? "manual",
    hasPoPhoto: !!input.hasPoPhoto,
    deliveryMethod: input.deliveryMethod ?? "Own vehicle",
    draft: !!input.asDraft,
    lines: [],
    events: [],
  };
  const summary: string[] = [];
  for (const l of lines) {
    const p = d.products.find((x) => x.id === l.productId)!;
    const free = input.asDraft || outlet.status === "on_hold" ? 0 : freeForNewOrders(d, l.productId);
    const supply = Math.min(free, l.qty);
    if (supply > 0) reserve(d, l.productId, "outlet", supply);
    const line: OutletOrderLine = {
      productId: l.productId,
      qty: l.qty,
      unitPrice: l.unitPrice ?? p.tradePrice,
      discountPct: l.discountPct ?? 0,
      allocated: supply,
      dispatched: 0,
      delivered: 0,
      backordered: l.qty - supply,
      lost: 0,
      cancelled: 0,
      difference: 0,
      expectedDate: l.qty - supply > 0 && !input.asDraft ? addDays(ts, 14) : undefined,
      notes: l.notes,
    };
    if (input.asDraft || outlet.status === "on_hold") line.backordered = 0;
    order.lines.push(line);
    summary.push(`${l.productId}: ${supply} now${line.backordered ? `, ${line.backordered} back-ordered` : ""}`);
  }
  if (outlet.status === "on_hold") order.onHold = { reason: `${outlet.name} is on hold`, by: actor(d), ts };
  order.events.push({
    ts,
    by: actor(d),
    text: input.asDraft ? `Order entered from PO ${order.poNumber}, saved as New (not yet confirmed)` : `Order entered from PO ${order.poNumber}. ${summary.join("; ")}`,
  });
  d.outletOrders.unshift(order);
  audit(d, { by: actor(d), area: "Outlet orders", action: `Order entered ${order.id}`, entityId: order.id, after: `${outlet.name}, PO ${order.poNumber}, ${lkr(orderValue(order))}` });
  if (order.lines.some((l) => l.allocated > 0)) notify(d, { role: "stores" }, `New outlet order to pick: ${order.id} (${outlet.name})`, `/staff/dispatch`);
  return d.outletOrders[0];
}

export function setExpectedDate(d: Draft<Db>, orderId: string, productId: string, iso: string, emailOutlet: boolean) {
  const o = d.outletOrders.find((x) => x.id === orderId);
  const l = o?.lines.find((x) => x.productId === productId);
  if (!o || !l) return;
  const before = l.expectedDate;
  l.expectedDate = iso;
  o.events.push({ ts: stamp(d), by: actor(d), text: `Expected date for ${l.backordered} × ${productId} revised to ${date(iso)}` });
  audit(d, { by: actor(d), area: "Outlet orders", action: `Expected date revised ${orderId}`, entityId: orderId, before: before ? date(before) : "not set", after: date(iso) });
  const outlet = d.outlets.find((x) => x.id === o.outletId);
  if (emailOutlet && outlet?.email) {
    sendMessage(d, {
      channel: "email",
      to: outlet.email,
      toName: outlet.contactPerson,
      subject: `Revised delivery date: your PO ${o.poNumber}`,
      body: `Dear ${outlet.contactPerson},\n\nThe balance of ${l.backordered} × ${productName(d, productId)} on your PO ${o.poNumber} is now expected on ${date(iso)}.\n\nThank you for your patience.\nFemmeCare Sales`,
      relatedType: "Outlet order",
      relatedId: orderId,
    });
  }
}

/** Serve a back-order from stock that has arrived. Enforces first in, first out. */
export function allocateBackorder(d: Draft<Db>, orderId: string, productId: string) {
  const queue = waitingQueue(d, productId);
  const idx = queue.findIndex((x) => x.order.id === orderId);
  if (idx < 0) throw new Error("Nothing waiting on this order");
  const ahead = queue.slice(0, idx).reduce((s, x) => s + x.line.backordered, 0);
  const free = available(d, productId, "outlet") - ahead;
  if (free <= 0) throw new Error("Older orders are ahead in line for this stock");
  const o = d.outletOrders.find((x) => x.id === orderId)!;
  if (o.onHold) throw new Error(`This order is on hold: ${o.onHold.reason}`);
  const l = o.lines.find((x) => x.productId === productId)!;
  const take = Math.min(free, l.backordered);
  reserve(d, productId, "outlet", take);
  l.backordered -= take;
  l.allocated += take;
  if (l.backordered === 0) l.expectedDate = undefined;
  o.events.push({ ts: stamp(d), by: actor(d), text: `${take} × ${productId} allocated from new stock` });
  refreshStatus(d, o);
  audit(d, { by: actor(d), area: "Outlet orders", action: `Back-order allocated ${orderId}`, entityId: orderId, after: `${take} × ${productId}` });
  notify(d, { role: "stores" }, `Back-order ready to pick: ${o.id}`, `/staff/dispatch`);
  return take;
}

/** The outlet no longer wants the balance: record a lost sale. */
export function declineBackorder(d: Draft<Db>, orderId: string, productId: string, reason: string) {
  const o = d.outletOrders.find((x) => x.id === orderId);
  const l = o?.lines.find((x) => x.productId === productId);
  if (!o || !l || l.backordered <= 0) return;
  const qty = l.backordered;
  l.lost += qty;
  l.backordered = 0;
  l.lostReason = reason || "Outlet no longer wants the balance";
  l.expectedDate = undefined;
  o.events.push({ ts: stamp(d), by: actor(d), text: `${qty} × ${productId} recorded as a lost sale: ${l.lostReason}` });
  refreshStatus(d, o);
  audit(d, { by: actor(d), area: "Outlet orders", action: `Lost sale recorded ${orderId}`, entityId: orderId, after: `${qty} × ${productId}, ${lkr(lineValue(l, qty))}`, reason: l.lostReason });
}

export function cancelOutletOrder(d: Draft<Db>, orderId: string, reason: string) {
  const o = d.outletOrders.find((x) => x.id === orderId);
  if (!o) return;
  if (o.lines.some((l) => l.dispatched > 0 || l.delivered > 0)) throw new Error("Part of this order has been dispatched, so it can't be cancelled");
  if (d.dispatches.some((x) => x.orderId === orderId && x.status !== "delivered")) throw new Error("This order is being packed. Stop the packing first");
  if (!reason.trim()) throw new Error("A reason is required");
  for (const l of o.lines) {
    if (l.allocated) release(d, l.productId, "outlet", l.allocated);
    l.cancelled = l.qty;
    l.allocated = 0;
    l.backordered = 0;
  }
  o.status = "cancelled";
  o.events.push({ ts: stamp(d), by: actor(d), text: `Order cancelled: ${reason}` });
  audit(d, { by: actor(d), area: "Outlet orders", action: `Order cancelled ${orderId}`, entityId: orderId, reason });
}

// ---------- Dispatch, invoice, delivery note ----------

/** Lines of an outlet order ready to pick (allocated, not yet in a dispatch). */
export function pickableQty(db: D, o: OutletOrder, productId: string) {
  const l = o.lines.find((x) => x.productId === productId);
  if (!l) return 0;
  const inFlight = db.dispatches
    .filter((x) => x.orderId === o.id && (x.status === "to_pick" || x.status === "packing" || x.status === "ready"))
    .flatMap((x) => x.lines)
    .filter((x) => x.productId === productId)
    .reduce((s, x) => s + x.qty, 0);
  return Math.max(0, l.allocated - inFlight);
}

export function createOutletDispatch(d: Draft<Db>, orderId: string): Draft<Dispatch> | undefined {
  const o = d.outletOrders.find((x) => x.id === orderId);
  if (!o) return;
  if (o.onHold) throw new Error(`This order is on hold: ${o.onHold.reason}`);
  if (o.draft) throw new Error("Confirm the order first");
  const lines = o.lines.flatMap((l) => {
    const q = pickableQty(d, o, l.productId);
    return q > 0 ? pickPlan(d, l.productId, "outlet", q).map((p) => ({ productId: l.productId, batchId: p.batchId, qty: p.qty, scanned: 0 })) : [];
  });
  if (!lines.length) return;
  const x: Dispatch = {
    id: nextId(d, "DSP", 5),
    channel: "outlet",
    orderId,
    status: "to_pick",
    createdAt: stamp(d),
    lines,
    events: [{ ts: stamp(d), by: actor(d), text: "Pick list created (earliest expiry first)" }],
  };
  d.dispatches.unshift(x);
  return d.dispatches[0];
}

/** Scan one item while packing. Returns a message for the packer. */
export function scanItem(d: Draft<Db>, dispatchId: string, code: string): { ok: boolean; message: string } {
  const x = d.dispatches.find((y) => y.id === dispatchId);
  if (!x) return { ok: false, message: "Unknown dispatch" };
  const p = d.products.find((y) => y.barcode === code.trim() || y.id.toLowerCase() === code.trim().toLowerCase());
  if (!p) return { ok: false, message: `Barcode ${code} is not a FemmeCare product` };
  const line = x.lines.find((l) => l.productId === p.id && l.scanned < l.qty);
  if (!line) {
    const inOrder = x.lines.some((l) => l.productId === p.id);
    return { ok: false, message: inOrder ? `All ${p.name} for this order are already packed` : `Wrong item: ${p.name} is not on this order` };
  }
  line.scanned += 1;
  if (x.status === "to_pick") x.status = "packing";
  const done = x.lines.every((l) => l.scanned >= l.qty);
  if (done) {
    x.status = "ready";
    x.events.push({ ts: stamp(d), by: actor(d), text: "Packed and checked by scan" });
    if (x.channel === "consultant") {
      const co = d.consultantOrders.find((y) => y.id === x.orderId);
      if (co && co.deliveryStatus === "placed") {
        co.deliveryStatus = "packed";
        co.events.push({ ts: stamp(d), by: actor(d), text: "Packed" });
      }
    }
  }
  return { ok: true, message: `${p.name}: ${line.scanned} of ${line.qty}` };
}

/** Pack every line at once (used by the seed and "mark all scanned" for speed). */
export function packAll(d: Draft<Db>, dispatchId: string) {
  const x = d.dispatches.find((y) => y.id === dispatchId);
  if (!x) return;
  for (const l of x.lines) l.scanned = l.qty;
  x.status = "ready";
  x.events.push({ ts: stamp(d), by: actor(d), text: "Packed and checked by scan" });
  if (x.channel === "consultant") {
    const co = d.consultantOrders.find((y) => y.id === x.orderId);
    if (co && co.deliveryStatus === "placed") {
      co.deliveryStatus = "packed";
      co.events.push({ ts: stamp(d), by: actor(d), text: "Packed" });
    }
  }
}

export function issueInvoice(d: Draft<Db>, dispatchId: string): Draft<Invoice> {
  const x = d.dispatches.find((y) => y.id === dispatchId);
  if (!x || x.channel !== "outlet") throw new Error("Not an outlet dispatch");
  if (x.status !== "ready") throw new Error("Pack and scan every item before issuing the invoice and delivery note");
  if (x.invoiceId) return d.invoices.find((i) => i.id === x.invoiceId)!;
  const o = d.outletOrders.find((y) => y.id === x.orderId)!;
  const outlet = d.outlets.find((y) => y.id === o.outletId)!;
  const byProduct = new Map<string, number>();
  for (const l of x.lines) byProduct.set(l.productId, (byProduct.get(l.productId) ?? 0) + l.qty);
  const lines = [...byProduct.entries()].map(([productId, qty]) => {
    const ol = o.lines.find((y) => y.productId === productId)!;
    const p = d.products.find((y) => y.id === productId)!;
    const gross = round2(qty * ol.unitPrice);
    const discount = round2(gross * (ol.discountPct / 100));
    const tax = round2((gross - discount) * (p.taxRate / 100));
    return { productId, qty, unitPrice: ol.unitPrice, discount, tax, total: round2(gross - discount + tax) };
  });
  const ts = stamp(d);
  const id = nextId(d, "INV", 5);
  const days = parseInt(outlet.paymentTerms, 10);
  const inv: Invoice = {
    id,
    deliveryNoteId: id.replace("INV", "DN"),
    outletId: outlet.id,
    orderId: o.id,
    dispatchId,
    date: ts,
    dueDate: addDays(ts, Number.isFinite(days) ? days : 0),
    lines,
    subtotal: round2(lines.reduce((s, l) => s + l.qty * l.unitPrice, 0)),
    discount: round2(lines.reduce((s, l) => s + l.discount, 0)),
    tax: round2(lines.reduce((s, l) => s + l.tax, 0)),
    total: round2(lines.reduce((s, l) => s + l.total, 0)),
    status: "issued",
  };
  d.invoices.unshift(inv);
  x.invoiceId = inv.id;
  x.deliveryNoteId = inv.deliveryNoteId;
  x.events.push({ ts, by: actor(d), text: `Invoice ${inv.id} and delivery note ${inv.deliveryNoteId} issued` });
  o.events.push({ ts, by: actor(d), text: `Invoice ${inv.id} issued for ${lkr(inv.total)}` });
  if (outlet.email) {
    inv.emailedAt = ts;
    sendMessage(d, {
      channel: "email",
      to: outlet.email,
      toName: outlet.contactPerson,
      subject: `Invoice ${inv.id} and delivery note ${inv.deliveryNoteId} from FemmeCare`,
      body: `Dear ${outlet.contactPerson},\n\nPlease find attached invoice ${inv.id} for ${lkr(inv.total)} and delivery note ${inv.deliveryNoteId} for your PO ${o.poNumber}. Payment is due by ${date(inv.dueDate)}.\n\nThank you,\nFemmeCare Sales`,
      attachment: `${inv.id}.pdf, ${inv.deliveryNoteId}.pdf`,
      relatedType: "Invoice",
      relatedId: inv.id,
    });
  }
  audit(d, { by: actor(d), area: "Invoices", action: `Invoice issued ${inv.id}`, entityId: inv.id, after: `${outlet.name}, ${lkr(inv.total)}` });
  return d.invoices[0];
}

export function dispatchOutletDelivery(d: Draft<Db>, dispatchId: string, vehicle: string, driver: string) {
  const x = d.dispatches.find((y) => y.id === dispatchId);
  if (!x || x.channel !== "outlet") return;
  if (!x.invoiceId) throw new Error("Issue the invoice and delivery note first");
  const o = d.outletOrders.find((y) => y.id === x.orderId)!;
  for (const l of x.lines) {
    issue(d, l.productId, l.batchId, "outlet", l.qty, { type: "Dispatch", id: x.id });
    const ol = o.lines.find((y) => y.productId === l.productId)!;
    ol.allocated -= l.qty;
    ol.dispatched += l.qty;
  }
  x.status = "dispatched";
  x.vehicle = vehicle;
  x.driver = driver;
  x.dispatchedAt = stamp(d);
  x.events.push({ ts: stamp(d), by: actor(d), text: `Out for delivery: ${vehicle}, driver ${driver}` });
  o.events.push({ ts: stamp(d), by: actor(d), text: `Dispatched (${x.id})` });
  audit(d, { by: actor(d), area: "Logistics", action: `Outlet delivery dispatched ${x.id}`, entityId: x.id });
}

/** Simulated reading of a signed delivery note photo. */
export function readSignedNote(d: Draft<Db>, dispatchId: string, docImage: string) {
  const x = d.dispatches.find((y) => y.id === dispatchId);
  if (!x) return;
  const read: Record<string, number> = {};
  for (const l of x.lines) read[l.productId] = (read[l.productId] ?? 0) + l.qty;
  let note: string | undefined;
  if (docImage === "pod-difference") {
    const first = Object.keys(read)[0];
    if (first && read[first] >= 2) {
      read[first] -= 2;
      note = "2 packs damaged in transit (written on the note by the outlet)";
    }
  }
  x.pod = { docImage, readQty: read, differenceNote: note };
  x.events.push({ ts: stamp(d), by: actor(d), text: "Signed delivery note uploaded and read" });
}

export function confirmDelivery(d: Draft<Db>, dispatchId: string, confirmed: Record<string, number>, note?: string, receivedBy?: string) {
  const x = d.dispatches.find((y) => y.id === dispatchId);
  if (!x || !x.pod) return;
  if (receivedBy) x.receivedBy = receivedBy;
  const o = d.outletOrders.find((y) => y.id === x.orderId)!;
  const sent = new Map<string, number>();
  for (const l of x.lines) sent.set(l.productId, (sent.get(l.productId) ?? 0) + l.qty);
  for (const [pid, qty] of sent) {
    const got = Math.min(qty, Math.max(0, confirmed[pid] ?? qty));
    const ol = o.lines.find((y) => y.productId === pid)!;
    ol.dispatched -= qty;
    ol.delivered += got;
    ol.difference += qty - got;
  }
  x.pod.confirmedQty = confirmed;
  x.pod.differenceNote = note ?? x.pod.differenceNote;
  x.pod.confirmedBy = actor(d);
  x.pod.confirmedAt = stamp(d);
  x.status = "delivered";
  x.deliveredAt = stamp(d);
  const totalGot = Object.values(confirmed).reduce((s, n) => s + n, 0);
  x.events.push({ ts: stamp(d), by: actor(d), text: `Delivery confirmed: ${totalGot} received${x.pod.differenceNote ? `. ${x.pod.differenceNote}` : ""}` });
  o.events.push({ ts: stamp(d), by: actor(d), text: `Signed note confirmed: ${totalGot} received${x.pod.differenceNote ? ` (${x.pod.differenceNote})` : ""}` });
  refreshStatus(d, o);
  audit(d, { by: actor(d), area: "Logistics", action: `Delivery confirmed ${x.id}`, entityId: x.id, after: `${totalGot} received`, reason: x.pod.differenceNote });
}

// ---------- Invoices and payments ----------

export function paidOn(db: D, invoiceId: string) {
  return db.outletPayments.filter((p) => p.invoiceId === invoiceId).reduce((s, p) => s + p.amount, 0);
}

export function invoiceBalance(db: D, inv: Invoice) {
  if (inv.status === "cancelled") return 0;
  return round2(inv.total - paidOn(db, inv.id));
}

export type InvoiceDisplayStatus = "Issued" | "Part Paid" | "Paid" | "Overdue" | "Cancelled" | "Draft";

export function invoiceStatus(db: D, inv: Invoice, nowIso: string): InvoiceDisplayStatus {
  if (inv.status === "cancelled") return "Cancelled";
  if (inv.status === "draft") return "Draft";
  const bal = invoiceBalance(db, inv);
  if (bal <= 0.005) return "Paid";
  if (nowIso > inv.dueDate) return "Overdue";
  if (bal < inv.total) return "Part Paid";
  return "Issued";
}

export function daysOverdue(inv: Invoice, nowIso: string) {
  return Math.max(0, daysBetween(inv.dueDate, nowIso));
}

export function ageing(db: D, nowIso: string, outletId?: string) {
  const buckets = { notDue: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90: 0 };
  for (const inv of db.invoices.filter((i) => i.status === "issued" && (!outletId || i.outletId === outletId))) {
    const bal = invoiceBalance(db, inv);
    if (bal <= 0) continue;
    const od = daysOverdue(inv, nowIso);
    if (nowIso <= inv.dueDate) buckets.notDue += bal;
    else if (od <= 30) buckets.d1_30 += bal;
    else if (od <= 60) buckets.d31_60 += bal;
    else if (od <= 90) buckets.d61_90 += bal;
    else buckets.d90 += bal;
  }
  return buckets;
}

export function recordOutletPayment(
  d: Draft<Db>,
  input: { invoiceId: string; amount: number; method: OutletPayment["method"]; reference: string; date?: string; notes?: string },
) {
  const inv = d.invoices.find((i) => i.id === input.invoiceId);
  if (!inv || inv.status !== "issued") throw new Error("Choose an issued invoice");
  const bal = invoiceBalance(d, inv);
  if (input.amount <= 0) throw new Error("Enter the amount received");
  if (input.amount > bal + 0.005) throw new Error(`The balance on ${inv.id} is ${lkr(bal)}`);
  const p: OutletPayment = {
    id: nextId(d, "RCPT", 5),
    invoiceId: inv.id,
    outletId: inv.outletId,
    date: input.date ?? stamp(d),
    amount: round2(input.amount),
    method: input.method,
    reference: input.reference,
    receivedBy: actor(d),
    notes: input.notes,
  };
  d.outletPayments.unshift(p);
  audit(d, { by: actor(d), area: "Outlet payments", action: `Payment recorded ${p.id}`, entityId: inv.id, after: `${lkr(p.amount)} by ${p.method}${p.reference ? `, ref ${p.reference}` : ""}` });
  return p;
}

export function cancelInvoice(d: Draft<Db>, invoiceId: string, reason: string) {
  const inv = d.invoices.find((i) => i.id === invoiceId);
  if (!inv) return;
  if (!reason.trim()) throw new Error("A reason is required");
  if (paidOn(d, invoiceId) > 0) throw new Error("Payments are recorded against this invoice");
  inv.status = "cancelled";
  inv.cancelReason = reason;
  audit(d, { by: actor(d), area: "Invoices", action: `Invoice cancelled ${inv.id}`, entityId: inv.id, reason });
}

// ---------- Restock alerts ----------

/** Called after goods are received: alert outlet sales staff (and email outlets if set). */
export function alertWaitingOutlets(d: Draft<Db>, productId: string) {
  const queue = waitingQueue(d, productId);
  if (!queue.length) return;
  const outlets = [...new Set(queue.map((x) => x.order.outletId))];
  notify(
    d,
    { role: "outlet_sales" },
    `${productName(d, productId)} received: ${outlets.length} outlet${outlets.length > 1 ? "s" : ""} waiting`,
    `/staff/backorders?product=${productId}`,
  );
  if (d.settings.outlets.notifyWaiting === "staff_and_email") {
    for (const q of queue) {
      const outlet = d.outlets.find((o) => o.id === q.order.outletId);
      if (!outlet?.email) continue;
      sendMessage(d, {
        channel: "email",
        to: outlet.email,
        toName: outlet.contactPerson,
        subject: `${productName(d, productId)} is back in stock`,
        body: `Dear ${outlet.contactPerson},\n\n${productName(d, productId)} is back in stock. We will contact you to confirm delivery of the ${q.line.backordered} packs still due on your PO ${q.order.poNumber}.\n\nFemmeCare Sales`,
        relatedType: "Outlet order",
        relatedId: q.order.id,
      });
    }
  }
}

export function outletName(db: D, id: string) {
  return db.outlets.find((o) => o.id === id)?.name ?? id;
}

// ---------- New, On Hold, failed and returned deliveries (workbook statuses) ----------

/** Confirm a "New" order: check stock and allocate, as on save. */
export function confirmOutletOrder(d: Draft<Db>, orderId: string) {
  const o = d.outletOrders.find((x) => x.id === orderId);
  if (!o || !o.draft) return;
  const parts: string[] = [];
  for (const l of o.lines) {
    const supply = Math.min(freeForNewOrders(d, l.productId), l.qty);
    if (supply > 0) reserve(d, l.productId, "outlet", supply);
    l.allocated = supply;
    l.backordered = l.qty - supply;
    if (l.backordered) l.expectedDate = addDays(stamp(d), 14);
    parts.push(`${l.productId}: ${supply} now${l.backordered ? `, ${l.backordered} back-ordered` : ""}`);
  }
  o.draft = false;
  o.createdAt = stamp(d); // first in, first out counts from confirmation
  o.events.push({ ts: stamp(d), by: actor(d), text: `Order confirmed. ${parts.join("; ")}` });
  audit(d, { by: actor(d), area: "Outlet orders", action: `Order confirmed ${orderId}`, entityId: orderId });
}

export function holdOutletOrder(d: Draft<Db>, orderId: string, reason: string) {
  const o = d.outletOrders.find((x) => x.id === orderId);
  if (!o || o.status === "cancelled") return;
  if (!reason.trim()) throw new Error("A reason is required");
  o.onHold = { reason, by: actor(d), ts: stamp(d) };
  o.events.push({ ts: stamp(d), by: actor(d), text: `Put on hold: ${reason}` });
  audit(d, { by: actor(d), area: "Outlet orders", action: `Order put on hold ${orderId}`, entityId: orderId, reason });
}

export function releaseOutletOrder(d: Draft<Db>, orderId: string) {
  const o = d.outletOrders.find((x) => x.id === orderId);
  if (!o?.onHold) return;
  o.onHold = undefined;
  o.events.push({ ts: stamp(d), by: actor(d), text: "Hold released" });
  // an order saved while on hold has nothing allocated yet: check stock now, as on confirmation
  const untouched = o.lines.every((l) => l.allocated + l.backordered + l.dispatched + l.delivered + l.lost === 0);
  if (untouched && !o.draft) {
    o.draft = true;
    confirmOutletOrder(d, orderId);
  }
  audit(d, { by: actor(d), area: "Outlet orders", action: `Hold released ${orderId}`, entityId: orderId });
}

/** The delivery could not be made (outlet closed, nobody to receive it). */
export function failDelivery(d: Draft<Db>, dispatchId: string, reason: string) {
  const x = d.dispatches.find((y) => y.id === dispatchId);
  if (!x || x.status !== "dispatched") return;
  if (!reason.trim()) throw new Error("A reason is required");
  x.status = "failed";
  x.failReason = reason;
  x.events.push({ ts: stamp(d), by: actor(d), text: `Delivery failed: ${reason}` });
  audit(d, { by: actor(d), area: "Logistics", action: `Delivery failed ${x.id}`, entityId: x.id, reason });
}

/** Goods from a failed delivery are back in the warehouse: stock returns and the order can be sent again. */
export function returnToStock(d: Draft<Db>, dispatchId: string) {
  const x = d.dispatches.find((y) => y.id === dispatchId);
  if (!x || x.status !== "failed") return;
  for (const l of x.lines) {
    addStock(d, l.productId, l.batchId, x.channel, l.qty, "Customer return", { type: "Dispatch", id: x.id }, x.failReason);
    reserve(d, l.productId, x.channel, l.qty);
  }
  if (x.channel === "outlet") {
    const o = d.outletOrders.find((y) => y.id === x.orderId);
    if (o)
      for (const l of x.lines) {
        const ol = o.lines.find((y) => y.productId === l.productId);
        if (ol) {
          ol.dispatched -= l.qty;
          ol.allocated += l.qty;
        }
      }
  } else {
    const o = d.consultantOrders.find((y) => y.id === x.orderId);
    if (o) {
      o.deliveryStatus = "placed";
      o.dispatchId = undefined;
      o.stockReserved = true;
      o.events.push({ ts: stamp(d), by: actor(d), text: "Parcel returned to the warehouse; it will be sent again" });
    }
  }
  x.status = "returned";
  x.events.push({ ts: stamp(d), by: actor(d), text: "Returned to the warehouse and put back into stock" });
  audit(d, { by: actor(d), area: "Logistics", action: `Returned to stock ${x.id}`, entityId: x.id });
}
