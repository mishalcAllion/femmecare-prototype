// Fixed roles and what each may do (PRD section 6).

import type { RoleId } from "./types";

export const ROLES: Record<RoleId, { label: string; description: string }> = {
  admin: { label: "Administrator", description: "Users, products, prices, settings, approvals and sponsor changes" },
  outlet_sales: { label: "Outlet sales", description: "Retail outlets, orders, invoices, delivery notes and back-orders" },
  stores: { label: "Stores", description: "Goods received, stock, picking, packing by scan, labels and counts" },
  operations: { label: "Operations", description: "Consultant payments, packing and courier dispatch" },
  finance: { label: "Finance", description: "Invoices, outlet payments, bank details, month-end and payouts" },
  management: { label: "Management", description: "Dashboards and reports across both channels, read-only" },
};

export type Permission =
  | "users.manage"
  | "settings.view"
  | "settings.edit"
  | "audit.view"
  | "products.view"
  | "products.edit"
  | "labels.print"
  | "stock.view.all"
  | "stock.view.outlet"
  | "stock.view.consultant"
  | "grn.record"
  | "grn.view"
  | "transfer.request"
  | "transfer.approve"
  | "count.do"
  | "count.approve"
  | "outlets.view"
  | "outlets.edit"
  | "outletOrders.view"
  | "outletOrders.edit"
  | "invoices.view"
  | "invoices.issue"
  | "invoices.cancel"
  | "outletPayments.view"
  | "outletPayments.record"
  | "dispatch.view"
  | "dispatch.outlet"
  | "dispatch.consultant"
  | "pod.confirm"
  | "pod.view"
  | "applications.view"
  | "applications.decide"
  | "consultants.view"
  | "consultants.edit"
  | "sponsor.change"
  | "bank.verify"
  | "consultantOrders.view"
  | "consultantOrders.manage"
  | "payments.verify"
  | "refunds.view"
  | "refunds.request"
  | "refunds.approve"
  | "commission.view"
  | "month.close"
  | "payout.view"
  | "payout.approve"
  | "dashboard.management"
  | "dashboard.outlet"
  | "reports.outlet"
  | "reports.stock"
  | "reports.consultant"
  | "reports.finance";

const MATRIX: Record<RoleId, Permission[]> = {
  admin: [
    "users.manage", "settings.view", "settings.edit", "audit.view",
    "products.view", "products.edit", "labels.print",
    "stock.view.all", "grn.view", "transfer.approve", "count.approve",
    "outlets.view", "outlets.edit", "outletOrders.view", "invoices.view", "outletPayments.view",
    "dispatch.view", "pod.view", "applications.view", "applications.decide",
    "consultants.view", "consultants.edit", "sponsor.change",
    "consultantOrders.view", "refunds.view", "commission.view", "month.close", "payout.view",
    "dashboard.management", "dashboard.outlet",
    "reports.outlet", "reports.stock", "reports.consultant", "reports.finance",
  ],
  outlet_sales: [
    "products.view", "stock.view.outlet",
    "outlets.view", "outlets.edit", "outletOrders.view", "outletOrders.edit",
    "invoices.view", "invoices.issue", "outletPayments.view",
    "dispatch.view", "pod.confirm", "pod.view", "dashboard.outlet",
    "reports.outlet", "reports.stock",
  ],
  stores: [
    "products.view", "labels.print", "stock.view.all", "grn.record", "grn.view",
    "transfer.request", "count.do", "count.approve",
    "outletOrders.view", "dispatch.view", "dispatch.outlet", "dispatch.consultant",
    "consultantOrders.view", "reports.stock",
  ],
  operations: [
    "products.view", "stock.view.consultant", "dispatch.view", "dispatch.consultant",
    "applications.view", "consultants.view", "consultantOrders.view", "consultantOrders.manage",
    "payments.verify", "refunds.view", "refunds.request", "commission.view", "reports.consultant",
  ],
  finance: [
    "settings.view", "audit.view", "products.view", "stock.view.all", "grn.view",
    "outlets.view", "outletOrders.view", "invoices.view", "invoices.cancel",
    "outletPayments.view", "outletPayments.record",
    "consultants.view", "bank.verify", "consultantOrders.view", "refunds.view", "refunds.approve",
    "commission.view", "month.close", "payout.view", "payout.approve",
    "dashboard.management", "reports.outlet", "reports.stock", "reports.consultant", "reports.finance",
  ],
  management: [
    "audit.view", "products.view", "stock.view.all", "grn.view",
    "outlets.view", "outletOrders.view", "invoices.view", "outletPayments.view", "dispatch.view", "pod.view",
    "consultants.view", "consultantOrders.view", "refunds.view", "commission.view", "payout.view",
    "dashboard.management", "dashboard.outlet",
    "reports.outlet", "reports.stock", "reports.consultant", "reports.finance",
  ],
};

export function can(roles: RoleId[] | undefined, p: Permission): boolean {
  if (!roles) return false;
  return roles.some((r) => MATRIX[r].includes(p));
}

export function canAny(roles: RoleId[] | undefined, ps: Permission[]): boolean {
  return ps.some((p) => can(roles, p));
}

/** Roles that hold a permission, for the "you don't have access" page. */
export function rolesWith(p: Permission): RoleId[] {
  return (Object.keys(MATRIX) as RoleId[]).filter((r) => MATRIX[r].includes(p));
}

export function permissionsOf(role: RoleId): Permission[] {
  return MATRIX[role];
}

/** Which allocations a role may see stock for. */
export function stockChannels(roles: RoleId[]): ("outlet" | "consultant")[] {
  if (can(roles, "stock.view.all")) return ["outlet", "consultant"];
  const out: ("outlet" | "consultant")[] = [];
  if (can(roles, "stock.view.outlet")) out.push("outlet");
  if (can(roles, "stock.view.consultant")) out.push("consultant");
  return out;
}
