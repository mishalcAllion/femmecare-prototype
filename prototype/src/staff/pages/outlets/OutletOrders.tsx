// S6 Outlet orders: status tabs, overdue and back-order filters, search by PO.

import { useMemo, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { AlertTriangle, ClipboardList, Plus, Upload } from "lucide-react";
import { useDb } from "@/domain/db";
import { orderTotals, orderValue, outletName } from "@/domain/outlets";
import { ORDER_STATUSES, orderStatusLabel, type WorkbookOrderStatus } from "@/domain/lists";
import type { OutletOrder } from "@/domain/types";
import { date, lkr, num } from "@/domain/format";
import { isOrderOverdue } from "@/domain/ext/outlets";
import { useCan, useNow } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { Guard } from "../../guard";
import { EmptyState, FilterTabs, PageHeader, SimpleTable, StatusBadge, type Column } from "@/components/fc/ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { OrderStatusBadge } from "./shared";

type Tab = "all" | WorkbookOrderStatus;

export function OutletOrders() {
  return (
    <Guard perms={["outletOrders.view"]}>
      <List />
    </Guard>
  );
}

function List() {
  usePageTitle("Outlet orders");
  const db = useDb();
  const now = useNow();
  const navigate = useNavigate();
  const canCreate = useCan("outletOrders.edit");
  const [params, setParams] = useSearchParams();
  const asked = params.get("status") as Tab | null;
  const tab: Tab = asked && (ORDER_STATUSES as readonly string[]).includes(asked) ? asked : "all";
  const overdueOnly = params.get("overdue") === "1";
  const backOnly = params.get("backorders") === "1";
  const outletFilter = params.get("outlet") ?? "";

  const setParam = (k: string, v?: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const base = useMemo(() => db.outletOrders.filter((o) => !outletFilter || o.outletId === outletFilter), [db, outletFilter]);
  const labels = useMemo(() => new Map(base.map((o) => [o.id, orderStatusLabel(db, o)])), [db, base]);
  const rows = useMemo(
    () =>
      base.filter(
        (o) =>
          (tab === "all" || labels.get(o.id) === tab) &&
          (!overdueOnly || isOrderOverdue(o, now)) &&
          (!backOnly || (o.status !== "cancelled" && orderTotals(o).backordered > 0)),
      ),
    [base, labels, tab, overdueOnly, backOnly, now],
  );
  const overdueCount = base.filter((o) => isOrderOverdue(o, now)).length;
  const backCount = base.filter((o) => o.status !== "cancelled" && orderTotals(o).backordered > 0).length;

  const columns: Column<OutletOrder>[] = [
    { key: "id", className: "whitespace-nowrap", header: "Order", value: (o) => o.id, cell: (o) => o.id },
    { key: "po", className: "whitespace-nowrap", header: "PO number", value: (o) => o.poNumber, cell: (o) => o.poNumber },
    {
      key: "outlet",
      header: "Outlet",
      value: (o) => outletName(db, o.outletId),
      cell: (o) => (
        <Link to={`/staff/outlets/${o.outletId}`} onClick={(e) => e.stopPropagation()} className="hover:text-primary">
          {outletName(db, o.outletId)}
        </Link>
      ),
    },
    { key: "poDate", className: "whitespace-nowrap", header: "PO date", value: (o) => o.poDate, cell: (o) => date(o.poDate), hideOnMobile: true },
    { key: "created", className: "whitespace-nowrap", header: "Entered", value: (o) => o.createdAt, cell: (o) => date(o.createdAt), hideOnMobile: true },
    {
      key: "required", className: "whitespace-nowrap",
      header: "Required",
      value: (o) => o.requiredDate,
      cell: (o) =>
        isOrderOverdue(o, now) ? (
          <span className="inline-flex items-center gap-1 font-medium text-destructive">
            <AlertTriangle className="size-3.5" /> {date(o.requiredDate)}
          </span>
        ) : (
          date(o.requiredDate)
        ),
    },
    { key: "units", className: "whitespace-nowrap", header: "Units", align: "right", value: (o) => orderTotals(o).qty, cell: (o) => num(orderTotals(o).qty) },
    { key: "delivered", className: "whitespace-nowrap", header: "Delivered", align: "right", value: (o) => orderTotals(o).delivered, cell: (o) => num(orderTotals(o).delivered) },
    {
      key: "back", className: "whitespace-nowrap",
      header: "Back-ordered",
      align: "right",
      value: (o) => orderTotals(o).backordered,
      cell: (o) => (orderTotals(o).backordered ? <span className="font-medium text-warning">{num(orderTotals(o).backordered)}</span> : <span className="text-muted-foreground">0</span>),
    },
    { key: "value", className: "whitespace-nowrap", header: "Value", align: "right", value: (o) => orderValue(o), cell: (o) => lkr(orderValue(o)) },
    { key: "status", className: "whitespace-nowrap", header: "Status", value: (o) => labels.get(o.id) ?? "", cell: (o) => <OrderStatusBadge order={o} /> },
  ];

  return (
    <div className="animate-rise space-y-4">
      <PageHeader
        title="Outlet orders"
        description={
          outletFilter ? (
            <>
              Orders from {outletName(db, outletFilter)}.{" "}
              <button className="text-primary hover:underline" onClick={() => setParam("outlet")}>
                Show every outlet
              </button>
            </>
          ) : (
            "Purchase orders from retail outlets, with what has been delivered and what is still waiting."
          )
        }
        actions={
          canCreate && (
            <>
              <Button variant="outline" nativeButton={false} render={<Link to="/staff/outlet-orders/new?mode=upload" />}>
                <Upload className="size-4" /> Upload orders
              </Button>
              <Button nativeButton={false} render={<Link to="/staff/outlet-orders/new" />}>
                <Plus className="size-4" /> New order
              </Button>
            </>
          )
        }
      />
      <FilterTabs<Tab>
        value={tab}
        onChange={(v) => setParam("status", v === "all" ? undefined : v)}
        options={[
          { value: "all", label: "All", count: base.length },
          ...ORDER_STATUSES.map((s) => ({ value: s as Tab, label: s, count: base.filter((o) => labels.get(o.id) === s).length })),
        ]}
      />
      <SimpleTable
        rows={rows}
        columns={columns}
        rowKey={(o) => o.id}
        rowHref={(o) => `/staff/outlet-orders/${o.id}`}
        onRowClick={(o) => navigate(`/staff/outlet-orders/${o.id}`)}
        searchText={(o) => `${o.poNumber} ${o.id} ${outletName(db, o.outletId)}`}
        defaultSort={{ key: "created", dir: "desc" }}
        exportName="outlet-orders"
        toolbar={
          <div className="flex flex-wrap gap-2">
            <ToggleChip on={overdueOnly} onClick={() => setParam("overdue", overdueOnly ? undefined : "1")} tone="danger">
              Past required date <span className="tabular opacity-70">{overdueCount}</span>
            </ToggleChip>
            <ToggleChip on={backOnly} onClick={() => setParam("backorders", backOnly ? undefined : "1")} tone="warning">
              With back-orders <span className="tabular opacity-70">{backCount}</span>
            </ToggleChip>
          </div>
        }
        empty={
          <EmptyState
            icon={<ClipboardList className="size-5" />}
            title={overdueOnly ? "Nothing is past its required date" : "No orders here"}
            description={base.length ? "Try another tab or clear the filters." : "Enter a PO or upload orders to get started."}
          />
        }
      />
    </div>
  );
}

function ToggleChip({ on, onClick, children, tone }: { on: boolean; onClick: () => void; children: ReactNode; tone: "danger" | "warning" }) {
  return (
    <button onClick={onClick} className="rounded-full">
      <StatusBadge tone={on ? tone : "neutral"} dot={on} className={cn("cursor-pointer px-3 py-1 text-[0.8rem]", !on && "hover:text-foreground")}>
        {children}
      </StatusBadge>
    </button>
  );
}
