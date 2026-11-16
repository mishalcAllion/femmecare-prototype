// Value lists from Sachindra's ERP formats workbook (9 Nov 2026), LISTS sheet and
// the dropdowns on the Customer Master, Product Master and Dispatch Register.
// Screens use these so the words match what Selyn's staff already use.

import type { Db, Dispatch, OutletOrder } from "./types";
import { computeStatus, orderTotals } from "./outlets";
import { stockAlerts } from "./stock";

export const ORDER_STATUSES = ["New", "Confirmed", "Picking", "Partially Dispatched", "Dispatched", "Completed", "Cancelled", "On Hold"] as const;
export type WorkbookOrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_TERMS = ["Cash", "7 Days", "14 Days", "30 Days", "45 Days", "60 Days", "Prepaid", "Other"] as const;
export const CUSTOMER_TYPES = ["Retail", "Wholesale", "Distributor", "Corporate", "Online", "Other"] as const;
export const CUSTOMER_STATUSES = ["Active", "Inactive", "On Hold"] as const;
export const MOVEMENT_TYPES = ["Opening Balance", "Purchase/Receipt", "Sales Issue", "Customer Return", "Supplier Return", "Transfer In", "Transfer Out", "Adjustment In", "Adjustment Out"] as const;
export const INVOICE_STATUSES = ["Draft", "Issued", "Part Paid", "Paid", "Overdue", "Cancelled"] as const;
export const PAYMENT_METHODS = ["Cash", "Bank Transfer", "Card", "Cheque", "Online Payment", "Other"] as const;
export const UNITS = ["Each", "Pack", "Box", "Set", "Kg", "Gram", "Litre", "Metre", "Other"] as const;
export const TAX_RATES = [0, 5, 8, 10, 12, 15, 18] as const; // percent
export const PRODUCT_ACTIVE = ["Yes", "No"] as const;
export const DISPATCH_STATUSES = ["Prepared", "Dispatched", "Delivered", "Failed", "Returned"] as const;

/** Our stock movement types, in the workbook's words. */
export const MOVEMENT_LABEL: Record<string, string> = {
  "Opening balance": "Opening Balance",
  "Goods received": "Purchase/Receipt",
  "Sales issue": "Sales Issue",
  "Customer return": "Customer Return",
  "Transfer in": "Transfer In",
  "Transfer out": "Transfer Out",
  "Adjustment in": "Adjustment In",
  "Adjustment out": "Adjustment Out",
  "Count difference": "Adjustment In/Out (stock count)",
};

/** Outlet order status in the workbook's words, worked out from the order's quantities and dispatches. */
export function orderStatusLabel(db: Db, o: OutletOrder): WorkbookOrderStatus {
  if (o.status === "cancelled") return "Cancelled";
  if (o.draft) return "New";
  if (o.onHold) return "On Hold";
  const s = computeStatus(db, o);
  // an order that ended with nothing delivered (every unit declined as a lost sale) was cancelled, not completed
  if (s === "delivered" || s === "closed") return orderTotals(o).delivered > 0 ? "Completed" : "Cancelled";
  const inPick = db.dispatches.some((x) => x.orderId === o.id && (x.status === "to_pick" || x.status === "packing" || x.status === "ready"));
  if (inPick) return "Picking";
  const t = orderTotals(o);
  if (t.dispatched > 0 && t.allocated === 0 && t.backordered === 0) return "Dispatched";
  if (t.dispatched + t.delivered > 0) return "Partially Dispatched";
  return "Confirmed";
}

/** Dispatch status in the workbook's words. */
export function dispatchStatusLabel(x: Dispatch): (typeof DISPATCH_STATUSES)[number] {
  if (x.status === "failed") return "Failed";
  if (x.status === "returned") return "Returned";
  if (x.status === "dispatched") return "Dispatched";
  if (x.status === "delivered") return "Delivered";
  return "Prepared";
}

/** The ten figures on the workbook's DASHBOARD sheet. */
export function workbookKpis(db: Db, now: string) {
  // imported lazily to keep this file light for screens that only need the lists
  const issued = db.invoices.filter((i) => i.status === "issued");
  const paid = db.outletPayments.reduce((s, p) => s + p.amount, 0);
  const invoiced = issued.reduce((s, i) => s + i.total, 0);
  const opening = db.outlets.reduce((s, o) => s + (o.openingBalance || 0), 0);
  const inventoryValue = db.stockLots.reduce((s, l) => s + l.onHand * (db.products.find((p) => p.id === l.productId)?.costPrice ?? 0), 0);
  // Distinct products with a low-stock alert in either channel's allocation.
  const atReorder = new Set(stockAlerts(db, now).filter((a) => a.kind === "low").map((a) => a.productId)).size;
  const overdue = issued.filter((i) => i.total - db.outletPayments.filter((p) => p.invoiceId === i.id).reduce((s, p) => s + p.amount, 0) > 0.005 && now > i.dueDate).length;
  return {
    activeCustomers: db.outlets.filter((o) => o.status === "active").length,
    activeProducts: db.products.filter((p) => p.status === "active").length,
    ordersRecorded: db.outletOrders.length,
    invoicesRecorded: db.invoices.filter((i) => i.status !== "cancelled").length,
    totalInvoiced: invoiced,
    paymentsReceived: paid,
    outstandingReceivables: Math.max(0, invoiced + opening - paid),
    inventoryValue,
    itemsAtReorderLevel: atReorder,
    overdueInvoices: overdue,
  };
}
