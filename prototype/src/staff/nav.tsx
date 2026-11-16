// Staff console navigation. Each item names the permission it needs, so the
// sidebar only shows what the signed-in role may use. `later` items appear only
// when the demo panel's "Show later-phase features" switch is on.

import type { ElementType } from "react";
import {
  BadgeDollarSign,
  BarChart3,
  Banknote,
  Boxes,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Gift,
  Hourglass,
  Inbox,
  Landmark,
  LayoutDashboard,
  ListChecks,
  Network,
  Package,
  PackageCheck,
  PackageOpen,
  Plug,
  ReceiptText,
  RotateCcw,
  ScanBarcode,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  Tags,
  TrendingDown,
  Trophy,
  Truck,
  UserPlus,
  Users,
  Wallet,
  Warehouse,
} from "lucide-react";
import type { Permission } from "@/domain/permissions";

export interface NavItem {
  label: string;
  to: string;
  icon: ElementType;
  perms: Permission[]; // any of
  later?: boolean;
  badge?: string; // key of a work-queue count shown beside the item
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: "Work",
    items: [
      { label: "What's waiting", to: "/staff", icon: Inbox, perms: [] },
      { label: "Management dashboard", to: "/staff/dashboard", icon: LayoutDashboard, perms: ["dashboard.management"] },
      { label: "Outlet dashboard", to: "/staff/outlet-dashboard", icon: BarChart3, perms: ["dashboard.outlet"] },
    ],
  },
  {
    label: "Retail outlets",
    items: [
      { label: "Outlets", to: "/staff/outlets", icon: Store, perms: ["outlets.view"] },
      { label: "Outlet orders", to: "/staff/outlet-orders", icon: ClipboardList, perms: ["outletOrders.view"] },
      { label: "Back-orders", to: "/staff/backorders", icon: Hourglass, perms: ["outletOrders.edit", "reports.outlet"], badge: "backorders" },
      { label: "Lost sales", to: "/staff/lost-sales", icon: TrendingDown, perms: ["outletOrders.edit", "reports.outlet"] },
      { label: "Invoices", to: "/staff/invoices", icon: ReceiptText, perms: ["invoices.view"] },
      { label: "Outlet payments", to: "/staff/outlet-payments", icon: Wallet, perms: ["outletPayments.view"] },
    ],
  },
  {
    label: "Logistics",
    items: [
      { label: "Dispatch", to: "/staff/dispatch", icon: Truck, perms: ["dispatch.view"], badge: "toPack" },
      { label: "Signed delivery notes", to: "/staff/pod", icon: ClipboardCheck, perms: ["pod.confirm", "pod.view"], badge: "pod" },
    ],
  },
  {
    label: "Inventory",
    items: [
      { label: "Stock", to: "/staff/stock", icon: Warehouse, perms: ["stock.view.all", "stock.view.outlet", "stock.view.consultant"] },
      { label: "Goods received", to: "/staff/grn", icon: PackageCheck, perms: ["grn.record", "grn.view"], badge: "grn" },
      { label: "Stock moves", to: "/staff/transfers", icon: PackageOpen, perms: ["transfer.request", "transfer.approve"], badge: "transfers" },
      { label: "Stock counts", to: "/staff/counts", icon: ListChecks, perms: ["count.do", "count.approve"] },
      { label: "Stock ledger", to: "/staff/stock-ledger", icon: ScrollText, perms: ["stock.view.all"] },
      { label: "Products", to: "/staff/products", icon: Package, perms: ["products.view"] },
      { label: "Barcode labels", to: "/staff/labels", icon: ScanBarcode, perms: ["labels.print"] },
    ],
  },
  {
    label: "Consultants",
    items: [
      { label: "Applications", to: "/staff/applications", icon: UserPlus, perms: ["applications.view"], badge: "applications" },
      { label: "Consultants", to: "/staff/consultants", icon: Users, perms: ["consultants.view"] },
      { label: "Network", to: "/staff/network", icon: Network, perms: ["consultants.view"] },
      { label: "Consultant orders", to: "/staff/consultant-orders", icon: ShoppingBag, perms: ["consultantOrders.view"] },
      { label: "Payments to verify", to: "/staff/payments", icon: ShieldCheck, perms: ["payments.verify"], badge: "payments" },
      { label: "Cancellations and refunds", to: "/staff/refunds", icon: RotateCcw, perms: ["refunds.view", "refunds.request", "refunds.approve"], badge: "refunds" },
      { label: "Promotions", to: "/staff/promotions", icon: Gift, perms: ["products.edit"], later: true },
      { label: "Ranks", to: "/staff/ranks", icon: Trophy, perms: ["consultants.edit"], later: true },
      { label: "Returns", to: "/staff/returns", icon: Package, perms: ["consultantOrders.manage"], later: true },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Bank details to verify", to: "/staff/bank-details", icon: Landmark, perms: ["bank.verify"], badge: "bank" },
      { label: "Commission", to: "/staff/commission", icon: BadgeDollarSign, perms: ["commission.view"] },
      { label: "Month-end close", to: "/staff/month-end", icon: ClipboardCheck, perms: ["month.close", "payout.view"], badge: "monthEnd" },
      { label: "Payouts", to: "/staff/payouts", icon: Banknote, perms: ["payout.view"] },
      { label: "Statements", to: "/staff/statements", icon: FileText, perms: ["payout.view"] },
    ],
  },
  {
    label: "Reports and admin",
    items: [
      { label: "Reports", to: "/staff/reports", icon: BarChart3, perms: ["reports.outlet", "reports.stock", "reports.consultant", "reports.finance"] },
      { label: "Users and roles", to: "/staff/users", icon: Users, perms: ["users.manage"] },
      { label: "Settings", to: "/staff/settings", icon: Settings, perms: ["settings.view"] },
      { label: "Audit log", to: "/staff/audit", icon: ScrollText, perms: ["audit.view"] },
      { label: "Integrations", to: "/staff/integrations", icon: Plug, perms: ["settings.view"], later: true },
    ],
  },
];

export const allNavItems = () => NAV.flatMap((g) => g.items);
export { Boxes, Tags };
