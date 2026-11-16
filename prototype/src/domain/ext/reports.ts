// Report centre: each report builds its rows from the records, adds a totals row,
// and checks its totals against the records underneath (so exports reconcile).

import type { Channel, Db, RoleId } from "../types";
import { can, stockChannels, type Permission } from "../permissions";
import { batchOf, CHANNEL_LABEL, countDifference, productName } from "../stock";
import { ageing, daysOverdue, invoiceBalance, invoiceStatus, lineValue, outletName, paidOn, queuePosition, waitingQueue } from "../outlets";
import { consultantById, DELIVERY_STATUS_LABEL, fullName, PAYMENT_STATUS_LABEL, STATUS_LABEL } from "../consultants";
import { computeMonth, isQualifying, salesByConsultant, salesMonth, whyNotQualified } from "../commission";
import { consultantCode, daysBetween, dayKey, lkr, maskTail, monthKey, monthLabel, prevMonthKey, round2 } from "../format";
import { dispatchStatusLabel, MOVEMENT_LABEL, orderStatusLabel } from "../lists";
import { inventorySummary, locationLabel, REF_TYPE_LABEL } from "./inventory";

export type ReportGroup = "outlet" | "stock" | "consultant" | "finance";
export type FilterKey = "period" | "month" | "outlet" | "product" | "channel" | "consultant" | "status" | "area";
export type Kind = "text" | "money" | "qty" | "date" | "datetime" | "pct" | "actor";

export interface ReportFilters {
  from: string;
  to: string;
  month: string;
  outletId: string;
  productId: string;
  channel: "" | Channel;
  consultantId: string;
  status: string;
  area: string;
}

export interface ReportColumn {
  key: string;
  header: string;
  kind?: Kind;
  total?: boolean;
}

export type Row = Record<string, string | number | undefined>;

export interface Check {
  label: string;
  ok: boolean;
  detail: string;
}

export interface ReportResult {
  columns: ReportColumn[];
  rows: Row[];
  hrefs?: (string | undefined)[];
  totals: Row;
  checks: Check[];
}

export interface ReportDef {
  id: string;
  group: ReportGroup;
  title: string;
  description: string;
  perm: Permission;
  pdf: boolean;
  filters: FilterKey[];
  statusOptions?: string[];
  statusLabel?: string;
  visible?: (db: Db) => boolean;
  run: (db: Db, f: ReportFilters, ctx: { now: string; roles: RoleId[] }) => ReportResult;
}

export const GROUPS: { id: ReportGroup; title: (label: string) => string; description: string }[] = [
  { id: "outlet", title: () => "Retail outlet reports", description: "Sales, open orders, back-orders, lost sales, invoices and balances" },
  { id: "stock", title: () => "Stock reports", description: "Stock on hand by batch, movements, count differences and the dispatch register" },
  { id: "consultant", title: (l) => `${l} reports`, description: "Register, teams and recruitment, sales and orders" },
  { id: "finance", title: () => "Finance reports", description: "Commission, payouts, sales against commission and the audit log" },
];

export function defaultFilters(now: string): ReportFilters {
  const m = monthKey(now);
  return { from: `${prevMonthKey(m)}-01`, to: dayKey(now), month: prevMonthKey(m), outletId: "", productId: "", channel: "", consultantId: "", status: "", area: "" };
}

const inPeriod = (iso: string | undefined, f: ReportFilters) => !!iso && (!f.from || dayKey(iso) >= f.from) && (!f.to || dayKey(iso) <= f.to);
const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
const fmt = (n: number) => round2(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function totalsOf(columns: ReportColumn[], rows: Row[]): Row {
  const t: Row = {};
  for (const c of columns) if (c.total) t[c.key] = round2(rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0));
  return t;
}

function result(columns: ReportColumn[], rows: Row[], checks: (t: Row) => Check[], hrefs?: (string | undefined)[]): ReportResult {
  const totals = totalsOf(columns, rows);
  return { columns, rows, hrefs, totals, checks: checks(totals) };
}

function check(label: string, a: number, b: number, what: string, money = false): Check {
  const ok = near(a, b);
  const f = money ? (n: number) => lkr(n) : fmt;
  return { label, ok, detail: ok ? `${what}: ${f(b)}` : `Report shows ${f(a)}, records show ${f(b)}` };
}

const lbl = (db: Db) => db.settings.labels.consultant;

// ---------- Outlet reports ----------

const salesByOutlet: ReportDef = {
  id: "sales-by-outlet",
  group: "outlet",
  title: "Sales by outlet, product and month",
  description: "Invoiced quantities and values, one row per month, outlet and product",
  perm: "reports.outlet",
  pdf: true,
  filters: ["period", "outlet", "product"],
  run: (db, f) => {
    const invs = db.invoices.filter((i) => i.status === "issued" && inPeriod(i.date, f) && (!f.outletId || i.outletId === f.outletId));
    const map = new Map<string, Row>();
    for (const inv of invs) {
      for (const l of inv.lines) {
        if (f.productId && l.productId !== f.productId) continue;
        const key = `${monthKey(inv.date)}|${inv.outletId}|${l.productId}`;
        const r = map.get(key) ?? { month: monthLabel(monthKey(inv.date)), monthKey: monthKey(inv.date), outlet: outletName(db, inv.outletId), code: l.productId, product: productName(db, l.productId), invoices: 0, qty: 0, gross: 0, discount: 0, tax: 0, net: 0 };
        r.qty = Number(r.qty) + l.qty;
        r.gross = round2(Number(r.gross) + l.qty * l.unitPrice);
        r.discount = round2(Number(r.discount) + l.discount);
        r.tax = round2(Number(r.tax) + l.tax);
        r.net = round2(Number(r.net) + l.total);
        r.invoices = Number(r.invoices) + 1;
        map.set(key, r);
      }
    }
    const rows = [...map.values()].sort((a, b) => String(a.monthKey).localeCompare(String(b.monthKey)) || String(a.outlet).localeCompare(String(b.outlet)) || String(a.code).localeCompare(String(b.code)));
    rows.forEach((r) => delete r.monthKey);
    const records = f.productId ? invs.flatMap((i) => i.lines.filter((l) => l.productId === f.productId)).reduce((s, l) => s + l.total, 0) : invs.reduce((s, i) => s + i.total, 0);
    return result(
      [
        { key: "month", header: "Month" },
        { key: "outlet", header: "Outlet" },
        { key: "code", header: "Item code" },
        { key: "product", header: "Product" },
        { key: "qty", header: "Quantity", kind: "qty", total: true },
        { key: "gross", header: "Gross (LKR)", kind: "money", total: true },
        { key: "discount", header: "Discount (LKR)", kind: "money", total: true },
        { key: "tax", header: "Tax (LKR)", kind: "money", total: true },
        { key: "net", header: "Invoiced (LKR)", kind: "money", total: true },
      ],
      rows,
      (t) => [check("Invoiced total matches the invoices", Number(t.net), records, `${invs.length} invoices issued in the period`, true), check("Gross less discount plus tax", Number(t.gross) - Number(t.discount) + Number(t.tax), Number(t.net), "Invoiced total", true)],
    );
  },
};

const openOrders: ReportDef = {
  id: "open-orders",
  group: "outlet",
  title: "Open orders and back-orders",
  description: "Every outlet order line not yet fully delivered, with the back-ordered balance and its place in line",
  perm: "reports.outlet",
  pdf: true,
  filters: ["outlet", "product", "status"],
  statusLabel: "Show",
  statusOptions: ["Back-ordered only"],
  run: (db, f) => {
    const rows: Row[] = [];
    const hrefs: string[] = [];
    let unbalanced = 0;
    for (const o of db.outletOrders) {
      if (o.status === "cancelled" || (f.outletId && o.outletId !== f.outletId)) continue;
      for (const l of o.lines) {
        if (f.productId && l.productId !== f.productId) continue;
        if (l.qty !== l.delivered + l.allocated + l.dispatched + l.backordered + l.lost + l.cancelled + l.difference) unbalanced += 1;
        const remaining = l.allocated + l.dispatched + l.backordered;
        if (!remaining) continue;
        if (f.status === "Back-ordered only" && !l.backordered) continue;
        rows.push({
          order: o.id,
          po: o.poNumber,
          outlet: outletName(db, o.outletId),
          status: orderStatusLabel(db, o),
          ordered: o.createdAt,
          required: o.requiredDate,
          product: `${l.productId} ${productName(db, l.productId)}`,
          qty: l.qty,
          delivered: l.delivered,
          allocated: l.allocated,
          road: l.dispatched,
          backordered: l.backordered,
          position: l.backordered ? queuePosition(db, o.id, l.productId) : undefined,
          expected: l.expectedDate,
          value: lineValue(l, remaining),
        });
        hrefs.push(`/staff/outlet-orders/${o.id}`);
      }
    }
    const waiting = [...new Set(db.products.map((p) => p.id))]
      .filter((p) => !f.productId || p === f.productId)
      .flatMap((p) => waitingQueue(db, p))
      .filter((x) => !f.outletId || x.order.outletId === f.outletId)
      .reduce((s, x) => s + x.line.backordered, 0);
    return result(
      [
        { key: "order", header: "Order" },
        { key: "po", header: "PO" },
        { key: "outlet", header: "Outlet" },
        { key: "status", header: "Order status" },
        { key: "ordered", header: "Ordered", kind: "date" },
        { key: "required", header: "Required", kind: "date" },
        { key: "product", header: "Product" },
        { key: "qty", header: "Ordered qty", kind: "qty", total: true },
        { key: "delivered", header: "Delivered", kind: "qty", total: true },
        { key: "allocated", header: "Allocated", kind: "qty", total: true },
        { key: "road", header: "On the road", kind: "qty", total: true },
        { key: "backordered", header: "Back-ordered", kind: "qty", total: true },
        { key: "position", header: "Place in line", kind: "qty" },
        { key: "expected", header: "Expected", kind: "date" },
        { key: "value", header: "Open value (LKR)", kind: "money", total: true },
      ],
      rows,
      (t) => [
        check("Back-ordered units match the waiting lists", Number(t.backordered), waiting, "Units waiting for stock"),
        { label: "Every line balances", ok: unbalanced === 0, detail: unbalanced ? `${unbalanced} lines do not balance` : "Ordered = delivered + allocated + on the road + back-ordered + lost + cancelled" },
      ],
      hrefs,
    );
  },
};

const lostSales: ReportDef = {
  id: "lost-sales",
  group: "outlet",
  title: "Lost sales",
  description: "Back-ordered balances the outlet no longer wanted, with the reason",
  perm: "reports.outlet",
  pdf: true,
  filters: ["period", "outlet", "product"],
  run: (db, f) => {
    const rows: Row[] = [];
    const hrefs: string[] = [];
    let recordQty = 0;
    for (const o of db.outletOrders) {
      if (f.outletId && o.outletId !== f.outletId) continue;
      if (!inPeriod(o.createdAt, f)) continue;
      for (const l of o.lines) {
        if (!l.lost || (f.productId && l.productId !== f.productId)) continue;
        recordQty += l.lost;
        rows.push({ order: o.id, po: o.poNumber, ordered: o.createdAt, outlet: outletName(db, o.outletId), status: orderStatusLabel(db, o), product: `${l.productId} ${productName(db, l.productId)}`, qty: l.lost, value: lineValue(l, l.lost), reason: l.lostReason ?? "" });
        hrefs.push(`/staff/outlet-orders/${o.id}`);
      }
    }
    return result(
      [
        { key: "order", header: "Order" },
        { key: "po", header: "PO" },
        { key: "ordered", header: "Ordered", kind: "date" },
        { key: "outlet", header: "Outlet" },
        { key: "status", header: "Order status" },
        { key: "product", header: "Product" },
        { key: "qty", header: "Quantity lost", kind: "qty", total: true },
        { key: "value", header: "Value (LKR)", kind: "money", total: true },
        { key: "reason", header: "Reason" },
      ],
      rows,
      (t) => [check("Lost quantity matches the order lines", Number(t.qty), recordQty, "Units recorded as lost")],
      hrefs,
    );
  },
};

const INVOICE_STATUSES = ["Issued", "Part paid", "Paid", "Overdue", "Cancelled"];

const invoicesReport: ReportDef = {
  id: "invoices",
  group: "outlet",
  title: "Invoices issued",
  description: "Invoices with amounts paid, balance and days overdue",
  perm: "reports.outlet",
  pdf: true,
  filters: ["period", "outlet", "status"],
  statusOptions: INVOICE_STATUSES,
  run: (db, f, { now }) => {
    const invs = db.invoices.filter((i) => i.status !== "draft" && inPeriod(i.date, f) && (!f.outletId || i.outletId === f.outletId) && (!f.status || invoiceStatus(db, i, now) === f.status));
    const rows = invs.map((i) => {
      const live = i.status !== "cancelled";
      return {
        invoice: i.id,
        date: i.date,
        outlet: outletName(db, i.outletId),
        order: i.orderId,
        due: i.dueDate,
        total: live ? i.total : 0,
        paid: live ? round2(paidOn(db, i.id)) : 0,
        balance: invoiceBalance(db, i),
        status: invoiceStatus(db, i, now),
        overdue: invoiceStatus(db, i, now) === "Overdue" ? daysOverdue(i, now) : undefined,
      } as Row;
    });
    const receipts = db.outletPayments.filter((p) => invs.some((i) => i.id === p.invoiceId)).reduce((s, p) => s + p.amount, 0);
    return result(
      [
        { key: "invoice", header: "Invoice" },
        { key: "date", header: "Date", kind: "date" },
        { key: "outlet", header: "Outlet" },
        { key: "order", header: "Order" },
        { key: "due", header: "Due", kind: "date" },
        { key: "total", header: "Total (LKR)", kind: "money", total: true },
        { key: "paid", header: "Paid (LKR)", kind: "money", total: true },
        { key: "balance", header: "Balance (LKR)", kind: "money", total: true },
        { key: "status", header: "Status" },
        { key: "overdue", header: "Days overdue", kind: "qty" },
      ],
      rows,
      (t) => [check("Paid matches the receipts recorded", Number(t.paid), receipts, "Outlet payments against these invoices", true), check("Balance is total less paid", Number(t.total) - Number(t.paid), Number(t.balance), "Balance due", true)],
      invs.map((i) => `/staff/invoices/${i.id}`),
    );
  },
};

const ageingReport: ReportDef = {
  id: "ageing",
  group: "outlet",
  title: "Outlet balances and ageing",
  description: "What each outlet owes, by how long it is past the due date",
  perm: "reports.outlet",
  pdf: true,
  filters: ["outlet"],
  visible: (db) => db.settings.outlets.trackPayments,
  run: (db, f, { now }) => {
    const rows: Row[] = [];
    const hrefs: string[] = [];
    for (const o of db.outlets) {
      if (f.outletId && o.id !== f.outletId) continue;
      const a = ageing(db, now, o.id);
      const bal = a.notDue + a.d1_30 + a.d31_60 + a.d61_90 + a.d90;
      if (bal <= 0) continue;
      rows.push({ outlet: o.name, terms: o.paymentTerms, limit: o.creditLimit, notDue: round2(a.notDue), d30: round2(a.d1_30), d60: round2(a.d31_60), d90: round2(a.d61_90), over90: round2(a.d90), balance: round2(bal) });
      hrefs.push(`/staff/outlets/${o.id}`);
    }
    const records = db.invoices.filter((i) => i.status === "issued" && (!f.outletId || i.outletId === f.outletId)).reduce((s, i) => s + Math.max(0, invoiceBalance(db, i)), 0);
    return result(
      [
        { key: "outlet", header: "Outlet" },
        { key: "terms", header: "Terms" },
        { key: "limit", header: "Credit limit (LKR)", kind: "money" },
        { key: "notDue", header: "Not yet due", kind: "money", total: true },
        { key: "d30", header: "1-30 days", kind: "money", total: true },
        { key: "d60", header: "31-60 days", kind: "money", total: true },
        { key: "d90", header: "61-90 days", kind: "money", total: true },
        { key: "over90", header: "Over 90 days", kind: "money", total: true },
        { key: "balance", header: "Balance (LKR)", kind: "money", total: true },
      ],
      rows,
      (t) => [check("Balances match the open invoices", Number(t.balance), records, "Unpaid on issued invoices", true)],
      hrefs,
    );
  },
};

// ---------- Stock reports ----------

function visibleChannels(roles: RoleId[], f: ReportFilters): Channel[] {
  return stockChannels(roles).filter((c) => !f.channel || c === f.channel);
}

const stockOnHand: ReportDef = {
  id: "stock-on-hand",
  group: "stock",
  title: "Stock on hand by channel, batch and expiry",
  description: "Each batch in each channel's allocation, with expiry, reserved and value at cost",
  perm: "reports.stock",
  pdf: true,
  filters: ["product", "channel"],
  run: (db, f, { now, roles }) => {
    const chs = visibleChannels(roles, f);
    const lots = db.stockLots.filter((l) => chs.includes(l.channel) && (!f.productId || l.productId === f.productId) && l.onHand !== 0);
    const rows = lots
      .map((l) => {
        const b = batchOf(db, l.batchId);
        const cost = db.products.find((p) => p.id === l.productId)?.costPrice ?? 0;
        return { code: l.productId, product: productName(db, l.productId), batch: l.batchId, channel: CHANNEL_LABEL[l.channel], expiry: b?.expiryDate, days: b ? daysBetween(now, b.expiryDate) : undefined, onHand: l.onHand, reserved: l.reserved, available: l.onHand - l.reserved, value: round2(l.onHand * cost) } as Row;
      })
      .sort((a, b) => String(a.code).localeCompare(String(b.code)) || String(a.channel).localeCompare(String(b.channel)) || String(a.expiry).localeCompare(String(b.expiry)));
    const ledger = db.movements.filter((m) => chs.includes(m.channel) && (!f.productId || m.productId === f.productId)).reduce((s, m) => s + m.qtyIn - m.qtyOut, 0);
    return result(
      [
        { key: "code", header: "Item code" },
        { key: "product", header: "Product" },
        { key: "batch", header: "Batch" },
        { key: "channel", header: "Channel" },
        { key: "expiry", header: "Expiry", kind: "date" },
        { key: "days", header: "Days left", kind: "qty" },
        { key: "onHand", header: "On hand", kind: "qty", total: true },
        { key: "reserved", header: "Reserved", kind: "qty", total: true },
        { key: "available", header: "Available", kind: "qty", total: true },
        { key: "value", header: "Value at cost (LKR)", kind: "money", total: true },
      ],
      rows,
      (t) => [check("On hand matches the stock ledger", Number(t.onHand), ledger, "Units in less units out, all movements")],
      rows.map((r) => `/staff/batches/${r.batch}`),
    );
  },
};

const inventorySummaryReport: ReportDef = {
  id: "inventory-summary",
  group: "stock",
  title: "Inventory summary",
  description: "Opening stock, total in and out, on hand, reorder status and stock value for each product and channel",
  perm: "reports.stock",
  pdf: true,
  filters: ["product", "channel"],
  run: (db, f, { roles }) => {
    const chs = visibleChannels(roles, f);
    const rows: Row[] = [];
    const hrefs: string[] = [];
    for (const p of db.products) {
      if (f.productId && p.id !== f.productId) continue;
      for (const ch of chs) {
        const s = inventorySummary(db, p.id, ch);
        rows.push({ code: p.id, product: p.name, location: locationLabel(ch, lbl(db)), opening: s.opening, in: s.totalIn, out: s.totalOut, onHand: s.onHand, reorder: s.reorder, status: s.status, cost: s.unitCost, value: round2(s.value) });
        hrefs.push("/staff/products/" + p.id);
      }
    }
    const lots = db.stockLots.filter((l) => chs.includes(l.channel) && (!f.productId || l.productId === f.productId));
    const lotsTotal = lots.reduce((s, l) => s + l.onHand, 0);
    const valueTotal = round2(lots.reduce((s, l) => s + l.onHand * (db.products.find((p) => p.id === l.productId)?.costPrice ?? 0), 0));
    return result(
      [
        { key: "code", header: "SKU" },
        { key: "product", header: "Product Name" },
        { key: "location", header: "Location / Warehouse" },
        { key: "opening", header: "Opening Stock", kind: "qty", total: true },
        { key: "in", header: "Total In", kind: "qty", total: true },
        { key: "out", header: "Total Out", kind: "qty", total: true },
        { key: "onHand", header: "On Hand", kind: "qty", total: true },
        { key: "reorder", header: "Reorder Level", kind: "qty" },
        { key: "status", header: "Stock Status" },
        { key: "cost", header: "Unit Cost (LKR)", kind: "money" },
        { key: "value", header: "Stock Value (LKR)", kind: "money", total: true },
      ],
      rows,
      (t) => [
        check("Opening + in - out equals on hand", Number(t.opening) + Number(t.in) - Number(t.out), Number(t.onHand), "On hand"),
        check("On hand matches the batches in stock", Number(t.onHand), lotsTotal, "Units held in every batch"),
        check("Stock value matches the batches at unit cost", Number(t.value), valueTotal, "Inventory value", true),
      ],
      hrefs,
    );
  },
};

const MOVEMENT_TYPES = ["Opening balance", "Goods received", "Sales issue", "Customer return", "Transfer in", "Transfer out", "Adjustment in", "Adjustment out", "Count difference"];

const stockMovements: ReportDef = {
  id: "stock-movements",
  group: "stock",
  title: "Stock movements",
  description: "Every receipt, sales issue, move, adjustment and count difference in the period",
  perm: "reports.stock",
  pdf: true,
  filters: ["period", "product", "channel", "status"],
  statusLabel: "Movement type",
  statusOptions: MOVEMENT_TYPES,
  run: (db, f, { now, roles }) => {
    const chs = visibleChannels(roles, f);
    const scope = db.movements.filter((m) => chs.includes(m.channel) && (!f.productId || m.productId === f.productId));
    const ms = scope.filter((m) => inPeriod(m.ts, f) && (!f.status || m.type === f.status));
    const rows = ms.map(
      (m) =>
        ({
          id: m.id,
          date: m.ts,
          code: m.productId,
          product: productName(db, m.productId),
          type: MOVEMENT_LABEL[m.type] ?? m.type,
          in: m.qtyIn,
          out: m.qtyOut,
          cost: m.unitCost,
          refType: m.refType ? REF_TYPE_LABEL[m.refType] ?? m.refType : "",
          ref: m.refId ?? "",
          location: locationLabel(m.channel, lbl(db)),
          batch: m.batchId,
          by: m.userId ?? "",
          reason: m.reason ?? "",
        }) as Row,
    );
    const checks = (t: Row): Check[] => {
      const out: Check[] = [];
      if (!f.status && (!f.to || f.to >= dayKey(now))) {
        const opening = scope.filter((m) => f.from && dayKey(m.ts) < f.from).reduce((s, m) => s + m.qtyIn - m.qtyOut, 0);
        const closing = db.stockLots.filter((l) => chs.includes(l.channel) && (!f.productId || l.productId === f.productId)).reduce((s, l) => s + l.onHand, 0);
        out.push(check("Opening stock plus movements equals stock on hand today", opening + Number(t.in) - Number(t.out), closing, `Opening ${fmt(opening)} + in ${fmt(Number(t.in))} - out ${fmt(Number(t.out))} = on hand`));
      }
      const listed = ms.reduce((s, m) => s + m.qtyIn - m.qtyOut, 0);
      out.push(check("Net movement matches the ledger", Number(t.in) - Number(t.out), listed, `${ms.length} ledger entries`));
      return out;
    };
    return result(
      [
        { key: "id", header: "Movement ID" },
        { key: "date", header: "Movement Date", kind: "datetime" },
        { key: "code", header: "SKU" },
        { key: "product", header: "Product Name" },
        { key: "type", header: "Movement Type" },
        { key: "in", header: "Quantity In", kind: "qty", total: true },
        { key: "out", header: "Quantity Out", kind: "qty", total: true },
        { key: "cost", header: "Unit Cost (LKR)", kind: "money" },
        { key: "refType", header: "Reference Type" },
        { key: "ref", header: "Reference No." },
        { key: "location", header: "Location / Warehouse" },
        { key: "batch", header: "Batch / Lot" },
        { key: "by", header: "Entered By", kind: "actor" },
        { key: "reason", header: "Notes" },
      ],
      rows,
      checks,
    );
  },
};

const countDifferences: ReportDef = {
  id: "count-differences",
  group: "stock",
  title: "Count differences",
  description: "Shelves where the count differed from the records, and the adjustment posted",
  perm: "reports.stock",
  pdf: true,
  filters: ["period", "product"],
  run: (db, f, { roles }) => {
    const chs = stockChannels(roles);
    const rows: Row[] = [];
    const hrefs: string[] = [];
    for (const c of db.counts) {
      if (c.status === "counting" || c.status === "recount" || !inPeriod(c.ts, f)) continue;
      for (const l of c.lines) {
        const diff = countDifference(l);
        if (!diff || !chs.includes(l.channel) || (f.productId && l.productId !== f.productId)) continue;
        const cost = db.products.find((p) => p.id === l.productId)?.costPrice ?? 0;
        rows.push({ count: c.id, date: c.ts, product: `${l.productId} ${productName(db, l.productId)}`, batch: l.batchId, channel: CHANNEL_LABEL[l.channel], system: l.systemQty, counted: l.recounted ?? l.counted, diff, value: round2(diff * cost), status: c.status === "approved" ? "Approved" : c.status === "rejected" ? "Rejected" : "Waiting for approval", by: c.countedBy, approver: c.decidedBy ?? "" });
        hrefs.push(`/staff/counts/${c.id}`);
      }
    }
    const approvedIds = new Set(db.counts.filter((c) => c.status === "approved" && inPeriod(c.ts, f)).map((c) => c.id));
    const posted = db.movements.filter((m) => m.type === "Count difference" && m.refId && approvedIds.has(m.refId) && chs.includes(m.channel) && (!f.productId || m.productId === f.productId)).reduce((s, m) => s + m.qtyIn - m.qtyOut, 0);
    const approvedDiff = rows.filter((r) => r.status === "Approved").reduce((s, r) => s + Number(r.diff), 0);
    return result(
      [
        { key: "count", header: "Count" },
        { key: "date", header: "Date", kind: "date" },
        { key: "product", header: "Product" },
        { key: "batch", header: "Batch" },
        { key: "channel", header: "Channel" },
        { key: "system", header: "System", kind: "qty", total: true },
        { key: "counted", header: "Counted", kind: "qty", total: true },
        { key: "diff", header: "Difference", kind: "qty", total: true },
        { key: "value", header: "Value at cost (LKR)", kind: "money", total: true },
        { key: "status", header: "Status" },
        { key: "by", header: "Counted by", kind: "actor" },
        { key: "approver", header: "Decided by", kind: "actor" },
      ],
      rows,
      () => [check("Approved differences match the ledger", approvedDiff, posted, "Count difference movements posted")],
      hrefs,
    );
  },
};

const dispatchRegister: ReportDef = {
  id: "dispatch-register",
  group: "stock",
  title: "Dispatch register",
  description: "Every delivery that left the warehouse, with vehicle or courier and the documents",
  perm: "reports.stock",
  pdf: true,
  filters: ["period", "channel"],
  run: (db, f, { roles }) => {
    const chs = visibleChannels(roles, f);
    const xs = db.dispatches.filter((x) => ["dispatched", "delivered", "failed", "returned"].includes(x.status) && chs.includes(x.channel) && inPeriod(x.dispatchedAt ?? x.createdAt, f));
    const rows = xs.map((x) => {
      const isOutlet = x.channel === "outlet";
      const oo = isOutlet ? db.outletOrders.find((o) => o.id === x.orderId) : undefined;
      const co = !isOutlet ? db.consultantOrders.find((o) => o.id === x.orderId) : undefined;
      const c = co ? consultantById(db, co.consultantId) : undefined;
      return {
        date: x.dispatchedAt ?? x.createdAt,
        dispatch: x.id,
        channel: CHANNEL_LABEL[x.channel],
        order: x.orderId,
        customer: oo ? outletName(db, oo.outletId) : c ? `${fullName(c)} (${consultantCode(c.number)})` : "",
        carrier: isOutlet ? x.vehicle ?? "" : x.courier ?? "",
        driver: isOutlet ? x.driver ?? "" : x.trackingNo ?? "",
        document: x.deliveryNoteId ?? "",
        units: x.lines.reduce((s, l) => s + l.qty, 0),
        status: dispatchStatusLabel(x),
        note: x.failReason ?? x.notes ?? x.pod?.differenceNote ?? "",
      } as Row;
    });
    const ids = new Set(xs.map((x) => x.id));
    const issued = db.movements.filter((m) => m.type === "Sales issue" && m.refId && ids.has(m.refId)).reduce((s, m) => s + m.qtyOut, 0);
    return result(
      [
        { key: "date", header: "Dispatched", kind: "datetime" },
        { key: "dispatch", header: "Dispatch" },
        { key: "channel", header: "Channel" },
        { key: "order", header: "Order" },
        { key: "customer", header: "Customer" },
        { key: "carrier", header: "Vehicle or courier" },
        { key: "driver", header: "Driver or tracking" },
        { key: "document", header: "Delivery note" },
        { key: "units", header: "Units", kind: "qty", total: true },
        { key: "status", header: "Dispatch status" },
        { key: "note", header: "Notes" },
      ],
      rows,
      (t) => [check("Units match the stock issued", Number(t.units), issued, "Sales issue movements for these deliveries")],
      xs.map((x) => `/staff/dispatch/${x.id}`),
    );
  },
};

// ---------- Consultant reports ----------

const register: ReportDef = {
  id: "consultant-register",
  group: "consultant",
  title: "Register",
  description: "Every applicant and seller with status, sponsor and join date. NIC and bank numbers are masked",
  perm: "reports.consultant",
  pdf: false,
  filters: ["status"],
  statusOptions: ["Active", "Pending", "Suspended", "Terminated", "Rejected"],
  run: (db, f) => {
    const cs = db.consultants.filter((c) => !f.status || STATUS_LABEL[c.status] === f.status);
    const rows = cs
      .map((c) => {
        const s = consultantById(db, c.sponsorId);
        return {
          number: consultantCode(c.number),
          name: fullName(c),
          status: STATUS_LABEL[c.status],
          sponsor: s ? `${fullName(s)} (${consultantCode(s.number)})` : c.number === 1 ? "" : "FemmeCare",
          joined: c.joinedAt,
          city: c.city,
          mobile: c.mobile,
          email: c.email,
          nic: maskTail(c.nic, 3),
          bank: c.bankVerified ? "Verified" : "Not verified",
          team: db.consultants.filter((x) => x.sponsorId === c.id && x.number !== undefined).length,
        } as Row;
      })
      .sort((a, b) => String(a.number).localeCompare(String(b.number)));
    const want = db.consultants.filter((c) => !f.status || STATUS_LABEL[c.status] === f.status).length;
    return result(
      [
        { key: "number", header: "Number" },
        { key: "name", header: "Name" },
        { key: "status", header: "Status" },
        { key: "sponsor", header: "Sponsor" },
        { key: "joined", header: "Joined", kind: "date" },
        { key: "city", header: "City" },
        { key: "mobile", header: "Mobile" },
        { key: "email", header: "Email" },
        { key: "nic", header: "NIC" },
        { key: "bank", header: "Bank details" },
        { key: "team", header: "Direct team", kind: "qty", total: true },
      ],
      rows,
      () => [check("Count matches the records", rows.length, want, `${f.status || "All"} records`)],
      cs.map((c) => `/staff/consultants/${c.id}`),
    );
  },
};

const teams: ReportDef = {
  id: "teams-recruitment",
  group: "consultant",
  title: "Teams and recruitment",
  description: "Each sponsor's direct team, new recruits in the period and team sales",
  perm: "reports.consultant",
  pdf: false,
  filters: ["period"],
  run: (db, f) => {
    const s = db.settings.commission;
    const paidIn = (id: string) => db.consultantOrders.filter((o) => o.consultantId === id && isQualifying(o) && inPeriod(o.paidAt, f));
    const rows: Row[] = [];
    const hrefs: string[] = [];
    for (const sp of db.consultants.filter((c) => c.number !== undefined)) {
      const team = db.consultants.filter((c) => c.sponsorId === sp.id && c.number !== undefined);
      const recruits = team.filter((c) => inPeriod(c.joinedAt, f)).length;
      if (!team.length) continue;
      const ordered = team.filter((c) => paidIn(c.id).length > 0).length;
      const sales = round2(team.reduce((a, c) => a + paidIn(c.id).reduce((x, o) => x + (s.base === "mrp" ? o.mrpValue : o.subtotal), 0), 0));
      rows.push({ number: consultantCode(sp.number), sponsor: fullName(sp), status: STATUS_LABEL[sp.status], team: team.length, active: team.filter((c) => c.status === "active").length, recruits, ordered, sales });
      hrefs.push(`/staff/consultants/${sp.id}`);
    }
    rows.sort((a, b) => Number(b.team) - Number(a.team));
    const joined = db.consultants.filter((c) => c.number !== undefined && c.sponsorId && inPeriod(c.joinedAt, f)).length;
    return result(
      [
        { key: "number", header: "Number" },
        { key: "sponsor", header: "Sponsor" },
        { key: "status", header: "Status" },
        { key: "team", header: "Direct team", kind: "qty", total: true },
        { key: "active", header: "Active", kind: "qty", total: true },
        { key: "recruits", header: "New in period", kind: "qty", total: true },
        { key: "ordered", header: "Ordered in period", kind: "qty", total: true },
        { key: "sales", header: `Team sales, ${s.base === "mrp" ? "MRP value" : "net"} (LKR)`, kind: "money", total: true },
      ],
      rows,
      (t) => [check("New recruits match the join dates", Number(t.recruits), joined, "Approved in the period")],
      hrefs,
    );
  },
};

const consultantSales: ReportDef = {
  id: "consultant-sales",
  group: "consultant",
  title: "Sales",
  description: "Paid orders per seller for a commission month, at MRP value and net (price paid)",
  perm: "reports.consultant",
  pdf: false,
  filters: ["month", "consultant"],
  run: (db, f) => {
    const cut = db.settings.commission.cutoff;
    const orders = db.consultantOrders.filter((o) => isQualifying(o) && salesMonth(o.paidAt!, cut) === f.month && (!f.consultantId || o.consultantId === f.consultantId));
    const map = new Map<string, Row>();
    for (const o of orders) {
      const c = consultantById(db, o.consultantId);
      const r = map.get(o.consultantId) ?? { number: consultantCode(c?.number), name: c ? fullName(c) : "", sponsor: c?.sponsorId ? fullName(consultantById(db, c.sponsorId) ?? { givenName: "", surname: "" }) : "", orders: 0, units: 0, mrp: 0, net: 0, margin: 0 };
      r.orders = Number(r.orders) + 1;
      r.units = Number(r.units) + o.lines.reduce((s, l) => s + l.qty, 0);
      r.mrp = round2(Number(r.mrp) + o.mrpValue);
      r.net = round2(Number(r.net) + o.subtotal);
      r.margin = round2(Number(r.mrp) - Number(r.net));
      map.set(o.consultantId, r);
    }
    const rows = [...map.entries()].sort((a, b) => Number(b[1].net) - Number(a[1].net));
    const engine = [...salesByConsultant(db, f.month, { ...db.settings.commission, base: "mrp" }).entries()].filter(([id]) => !f.consultantId || id === f.consultantId).reduce((s, [, v]) => s + v, 0);
    const netRecords = orders.reduce((s, o) => s + o.subtotal, 0);
    return result(
      [
        { key: "number", header: "Number" },
        { key: "name", header: "Name" },
        { key: "sponsor", header: "Sponsor" },
        { key: "orders", header: "Paid orders", kind: "qty", total: true },
        { key: "units", header: "Units", kind: "qty", total: true },
        { key: "mrp", header: "MRP value (LKR)", kind: "money", total: true },
        { key: "net", header: "Net sales (LKR)", kind: "money", total: true },
        { key: "margin", header: "Seller margin (LKR)", kind: "money", total: true },
      ],
      rows.map(([, r]) => r),
      (t) => [check("MRP value matches the commission base", Number(t.mrp), engine, `Qualifying sales for ${monthLabel(f.month)}`, true), check("Net sales match the paid orders", Number(t.net), netRecords, `${orders.length} paid orders`, true)],
      rows.map(([id]) => `/staff/consultants/${id}`),
    );
  },
};

const PAY_STATUSES = Object.values(PAYMENT_STATUS_LABEL);

const consultantOrders: ReportDef = {
  id: "consultant-orders",
  group: "consultant",
  title: "Orders",
  description: "Orders placed in the period with payment and delivery status",
  perm: "reports.consultant",
  pdf: false,
  filters: ["period", "consultant", "status"],
  statusLabel: "Payment status",
  statusOptions: PAY_STATUSES,
  run: (db, f) => {
    const os = db.consultantOrders.filter((o) => inPeriod(o.createdAt, f) && (!f.consultantId || o.consultantId === f.consultantId) && (!f.status || PAYMENT_STATUS_LABEL[o.paymentStatus] === f.status));
    const rows = os.map((o) => {
      const c = consultantById(db, o.consultantId);
      return {
        order: o.id,
        date: o.createdAt,
        number: consultantCode(c?.number),
        name: c ? fullName(c) : "",
        method: o.paymentMethod === "card" ? "Card" : o.paymentMethod === "cod" ? "Cash on delivery" : "Bank transfer",
        payment: PAYMENT_STATUS_LABEL[o.paymentStatus],
        delivery: DELIVERY_STATUS_LABEL[o.deliveryStatus],
        paidAt: o.paidAt,
        subtotal: o.subtotal,
        delivery_charge: o.deliveryCharge,
        total: o.total,
      } as Row;
    });
    const records = os.reduce((s, o) => s + o.total, 0);
    return result(
      [
        { key: "order", header: "Order" },
        { key: "date", header: "Placed", kind: "date" },
        { key: "number", header: "Number" },
        { key: "name", header: "Name" },
        { key: "method", header: "Payment method" },
        { key: "payment", header: "Payment" },
        { key: "delivery", header: "Delivery" },
        { key: "paidAt", header: "Paid on", kind: "date" },
        { key: "subtotal", header: "Products (LKR)", kind: "money", total: true },
        { key: "delivery_charge", header: "Delivery (LKR)", kind: "money", total: true },
        { key: "total", header: "Total (LKR)", kind: "money", total: true },
      ],
      rows,
      (t) => [check("Total matches the orders", Number(t.total), records, `${os.length} orders`, true), check("Products plus delivery equals total", Number(t.subtotal) + Number(t.delivery_charge), Number(t.total), "Order totals", true)],
      os.map((o) => `/staff/consultant-orders/${o.id}`),
    );
  },
};

// ---------- Finance reports ----------

const commissions: ReportDef = {
  id: "commissions",
  group: "finance",
  title: "Commission",
  description: "Each sponsor's commission for a month: provisional while open, approved once the month is locked",
  perm: "reports.finance",
  pdf: true,
  filters: ["month"],
  run: (db, f) => {
    const closed = db.commissionMonths.find((m) => m.id === f.month);
    const settings = closed?.settingsUsed ?? db.settings.commission;
    const lines = closed ? closed.lines : computeMonth(db, f.month, settings);
    const rows = lines.map((l) => {
      const s = consultantById(db, l.sponsorId);
      return {
        number: consultantCode(s?.number),
        sponsor: s ? fullName(s) : "",
        team: l.teamSales,
        own: l.ownSales,
        basis: l.thresholdBasis,
        referrals: l.activeReferrals,
        qualifies: l.qualifies ? "Yes" : `No: ${whyNotQualified(db, l, settings) ?? ""}`,
        commissionable: l.commissionable,
        amount: l.amount,
        adjustments: l.adjustments,
        payable: l.payable,
        status: l.hold ? `Held: ${l.hold}` : closed ? "Approved" : "Provisional",
      } as Row;
    });
    const sales = salesByConsultant(db, f.month, settings);
    const teamRecords = round2(lines.reduce((s, l) => s + db.consultants.filter((c) => c.sponsorId === l.sponsorId && c.number !== undefined).reduce((a, c) => a + (sales.get(c.id) ?? 0), 0), 0));
    const recomputed = round2(lines.filter((l) => l.qualifies).reduce((s, l) => s + round2((l.commissionable * settings.rate) / 100), 0));
    return result(
      [
        { key: "number", header: "Number" },
        { key: "sponsor", header: "Sponsor" },
        { key: "team", header: "Team sales (LKR)", kind: "money", total: true },
        { key: "own", header: "Own sales (LKR)", kind: "money", total: true },
        { key: "basis", header: "Toward threshold (LKR)", kind: "money" },
        { key: "referrals", header: "Team who ordered", kind: "qty" },
        { key: "qualifies", header: "Qualifies" },
        { key: "commissionable", header: "Commission base (LKR)", kind: "money", total: true },
        { key: "amount", header: `Commission ${settings.rate}% (LKR)`, kind: "money", total: true },
        { key: "adjustments", header: "Adjustments (LKR)", kind: "money", total: true },
        { key: "payable", header: "Payable (LKR)", kind: "money", total: true },
        { key: "status", header: "Status" },
      ],
      rows,
      (t) => [
        check("Team sales match the paid orders", Number(t.team), teamRecords, `${settings.base === "mrp" ? "MRP value" : "Net sales"} of each sponsor's direct team`, true),
        check(`Commission is ${settings.rate}% of the base for those who qualify`, Number(t.amount), recomputed, "Recalculated"),
      ],
      lines.map((l) => `/staff/consultants/${l.sponsorId}`),
    );
  },
};

const payouts: ReportDef = {
  id: "payouts",
  group: "finance",
  title: "Payouts",
  description: "Approved, pending, held and failed payouts and completed bank transfers",
  perm: "reports.finance",
  pdf: true,
  filters: ["month", "status"],
  statusOptions: ["Paid", "Pending", "Held", "Failed"],
  run: (db, f) => {
    const batches = db.payoutBatches.filter((b) => !f.month || b.month === f.month);
    const lines = batches.flatMap((b) => b.lines.map((l) => ({ b, l }))).filter(({ l }) => !f.status || l.status === f.status.toLowerCase());
    const rows = lines.map(({ b, l }) => {
      const c = consultantById(db, l.consultantId);
      return {
        batch: b.id,
        month: monthLabel(b.month),
        number: consultantCode(c?.number),
        name: c ? fullName(c) : "",
        bank: c ? `${c.bank.bank} ${maskTail(c.bank.accountNumber)}` : "",
        amount: l.amount,
        status: l.status[0].toUpperCase() + l.status.slice(1),
        ref: l.bankRef ?? "",
        note: [l.carriedFrom && l.carriedFrom !== "moved" ? `Carried from ${monthLabel(l.carriedFrom)}` : "", l.failReason ?? ""].filter(Boolean).join("; "),
      } as Row;
    });
    const batchTotal = round2(lines.reduce((s, x) => s + x.l.amount, 0));
    const byStatus = ["paid", "pending", "held", "failed"].map((st) => round2(lines.filter((x) => x.l.status === st).reduce((s, x) => s + x.l.amount, 0)));
    return result(
      [
        { key: "batch", header: "Batch" },
        { key: "month", header: "Month" },
        { key: "number", header: "Number" },
        { key: "name", header: "Name" },
        { key: "bank", header: "Bank account" },
        { key: "amount", header: "Amount (LKR)", kind: "money", total: true },
        { key: "status", header: "Status" },
        { key: "ref", header: "Bank reference" },
        { key: "note", header: "Note" },
      ],
      rows,
      (t) => [check("Paid, pending, held and failed add up", byStatus.reduce((a, b) => a + b, 0), Number(t.amount), `Paid ${lkr(byStatus[0])}, pending ${lkr(byStatus[1])}, held ${lkr(byStatus[2])}, failed ${lkr(byStatus[3])}`, true), check("Total matches the payout batches", Number(t.amount), batchTotal, `${batches.length} batch${batches.length === 1 ? "" : "es"}`, true)],
      lines.map(({ b }) => `/staff/payouts/${b.id}`),
    );
  },
};

const reconciliation: ReportDef = {
  id: "reconciliation",
  group: "finance",
  title: "Sales against commission",
  description: "Monthly sales, commission calculated, approved and paid, with the variance",
  perm: "reports.finance",
  pdf: true,
  filters: [],
  run: (db, _f, { now }) => {
    const cut = db.settings.commission.cutoff;
    const months = [...new Set(db.consultantOrders.filter(isQualifying).map((o) => salesMonth(o.paidAt!, cut)))].filter((m) => m <= monthKey(now)).sort();
    const rows = months.map((m) => {
      const closed = db.commissionMonths.find((x) => x.id === m);
      const settings = closed?.settingsUsed ?? db.settings.commission;
      const lines = closed ? closed.lines : computeMonth(db, m, settings);
      const orders = db.consultantOrders.filter((o) => isQualifying(o) && salesMonth(o.paidAt!, cut) === m);
      const net = round2(orders.reduce((s, o) => s + o.subtotal, 0));
      const mrp = round2(orders.reduce((s, o) => s + o.mrpValue, 0));
      const commission = round2(lines.reduce((s, l) => s + l.amount, 0));
      const payable = round2(lines.reduce((s, l) => s + l.payable, 0));
      const batch = db.payoutBatches.find((b) => b.month === m);
      const own = batch ? batch.lines.filter((l) => !l.carriedFrom || l.carriedFrom === "moved") : [];
      const paid = round2(own.filter((l) => l.status === "paid").reduce((s, l) => s + l.amount, 0));
      const failed = round2(own.filter((l) => l.status === "failed").reduce((s, l) => s + l.amount, 0));
      const open = round2(own.filter((l) => l.status === "pending" || l.status === "held").reduce((s, l) => s + l.amount, 0));
      const variance = closed ? round2(payable - paid - failed - open) : 0;
      return {
        month: monthLabel(m),
        status: closed ? (closed.status === "paid" ? "Paid" : closed.status === "payout_approved" ? "Payout approved" : "Locked") : "Open (provisional)",
        net,
        mrp,
        base: settings.base === "mrp" ? "MRP value" : "Net sales",
        commission,
        rate: round2((commission / Math.max(1, settings.base === "mrp" ? mrp : net)) * 100),
        payable,
        paid,
        failed,
        open,
        variance,
      } as Row;
    });
    return result(
      [
        { key: "month", header: "Month" },
        { key: "status", header: "Status" },
        { key: "net", header: "Net sales (LKR)", kind: "money", total: true },
        { key: "mrp", header: "MRP value (LKR)", kind: "money", total: true },
        { key: "base", header: "Commission base" },
        { key: "commission", header: "Commission (LKR)", kind: "money", total: true },
        { key: "rate", header: "% of base", kind: "pct" },
        { key: "payable", header: "Payable (LKR)", kind: "money", total: true },
        { key: "paid", header: "Paid (LKR)", kind: "money", total: true },
        { key: "failed", header: "Failed (LKR)", kind: "money", total: true },
        { key: "open", header: "Pending or held (LKR)", kind: "money", total: true },
        { key: "variance", header: "Variance (LKR)", kind: "money", total: true },
      ],
      rows,
      (t) => [
        { label: "Closed months reconcile", ok: near(Number(t.variance), 0), detail: near(Number(t.variance), 0) ? "Payable equals paid, failed, pending and held for every closed month" : `Variance of ${lkr(Number(t.variance))}` },
        check("Net sales match the paid orders", Number(t.net), db.consultantOrders.filter((o) => isQualifying(o) && months.includes(salesMonth(o.paidAt!, cut))).reduce((s, o) => s + o.subtotal, 0), "Paid orders, every month", true),
      ],
    );
  },
};

const auditReport: ReportDef = {
  id: "audit-log",
  group: "finance",
  title: "Audit log",
  description: "Who changed what and when, with before and after values and the reason",
  perm: "audit.view",
  pdf: true,
  filters: ["period", "area"],
  run: (db, f) => {
    const es = db.audit.filter((a) => inPeriod(a.ts, f) && (!f.area || a.area === f.area));
    const rows = es.map((a) => ({ when: a.ts, who: a.by, area: a.area, action: a.action, before: a.before ?? "", after: a.after ?? "", reason: a.reason ?? "" }) as Row);
    return result(
      [
        { key: "when", header: "When", kind: "datetime" },
        { key: "who", header: "Who", kind: "actor" },
        { key: "area", header: "Area" },
        { key: "action", header: "What" },
        { key: "before", header: "Before" },
        { key: "after", header: "After" },
        { key: "reason", header: "Reason" },
      ],
      rows,
      () => [check("Entries match the audit log", rows.length, es.length, "Audit entries in the period")],
    );
  },
};

export const REPORTS: ReportDef[] = [
  salesByOutlet,
  openOrders,
  lostSales,
  invoicesReport,
  ageingReport,
  inventorySummaryReport,
  stockOnHand,
  stockMovements,
  countDifferences,
  dispatchRegister,
  register,
  teams,
  consultantSales,
  consultantOrders,
  commissions,
  payouts,
  reconciliation,
  auditReport,
];

export function reportsFor(db: Db, roles: RoleId[]) {
  return REPORTS.filter((r) => can(roles, r.perm) && (!r.visible || r.visible(db)));
}

export function reportTitle(db: Db, r: ReportDef) {
  return r.group === "consultant" ? `${lbl(db)} ${r.title.toLowerCase()}` : r.title;
}
