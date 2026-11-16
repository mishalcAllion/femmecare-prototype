// S4 Outlets: the customer register with balance, overdue and last order.

import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Plus, Store } from "lucide-react";
import { useDb } from "@/domain/db";
import { outletBalance } from "@/domain/outlets";
import { date, lkr } from "@/domain/format";
import { overdueAmount } from "@/domain/ext/outlets";
import { useCan, useNow } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { Guard } from "../../guard";
import { EmptyState, FilterTabs, PageHeader, SimpleTable, Status, type Column } from "@/components/fc/ui";
import { Button } from "@/components/ui/button";
import type { Outlet } from "@/domain/types";
import { OUTLET_STATUS_LABEL } from "./shared";

type Row = { o: Outlet; balance: number; overdue: number; lastOrder?: string; orders: number };

export function OutletsList() {
  return (
    <Guard perms={["outlets.view"]}>
      <List />
    </Guard>
  );
}

function List() {
  usePageTitle("Outlets");
  const db = useDb();
  const now = useNow();
  const canEdit = useCan("outlets.edit");
  const navigate = useNavigate();
  const track = db.settings.outlets.trackPayments;
  const [tab, setTab] = useState<Outlet["status"] | "all">("all");

  const rows = useMemo<Row[]>(
    () =>
      db.outlets.map((o) => {
        const orders = db.outletOrders.filter((x) => x.outletId === o.id);
        const lastOrder = orders.reduce<string | undefined>((m, x) => (!m || x.createdAt > m ? x.createdAt : m), undefined);
        return { o, balance: outletBalance(db, o.id), overdue: overdueAmount(db, now, o.id), lastOrder, orders: orders.length };
      }),
    [db, now],
  );
  const shown = rows.filter((r) => tab === "all" || r.o.status === tab);

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Outlet",
      value: (r) => r.o.name,
      cell: (r) => (
        <span>
          <span className="block font-medium">{r.o.name}</span>
          <span className="block text-xs font-normal text-muted-foreground">
            {r.o.id} · {r.o.type}
          </span>
        </span>
      ),
    },
    { key: "city", className: "whitespace-nowrap", header: "City", value: (r) => r.o.city, cell: (r) => r.o.city },
    {
      key: "contact", className: "whitespace-nowrap",
      header: "Contact",
      value: (r) => r.o.contactPerson,
      hideOnMobile: true,
      cell: (r) => (
        <span>
          <span className="block">{r.o.contactPerson}</span>
          <span className="block text-xs text-muted-foreground">{r.o.mobile}</span>
        </span>
      ),
    },
    { key: "terms", className: "whitespace-nowrap", header: "Terms", value: (r) => r.o.paymentTerms, cell: (r) => r.o.paymentTerms },
    { key: "limit", className: "whitespace-nowrap", header: "Credit limit", align: "right", value: (r) => r.o.creditLimit, cell: (r) => (r.o.creditLimit ? lkr(r.o.creditLimit) : <span className="text-muted-foreground">None</span>) },
    ...(track
      ? ([
          { key: "balance", className: "whitespace-nowrap", header: "Balance", align: "right", value: (r) => r.balance, cell: (r) => lkr(r.balance) },
          {
            key: "overdue", className: "whitespace-nowrap",
            header: "Overdue",
            align: "right",
            value: (r) => r.overdue,
            cell: (r) => (r.overdue > 0 ? <span className="font-medium text-destructive">{lkr(r.overdue)}</span> : <span className="text-muted-foreground">None</span>),
          },
        ] as Column<Row>[])
      : []),
    { key: "last", className: "whitespace-nowrap", header: "Last order", value: (r) => r.lastOrder ?? "", cell: (r) => (r.lastOrder ? date(r.lastOrder) : <span className="text-muted-foreground">No orders</span>) },
    { key: "status", className: "whitespace-nowrap", header: "Status", value: (r) => OUTLET_STATUS_LABEL[r.o.status], cell: (r) => <Status>{OUTLET_STATUS_LABEL[r.o.status]}</Status> },
  ];

  return (
    <div className="animate-rise space-y-4">
      <PageHeader
        title="Outlets"
        description="Retail outlets, wholesalers and distributors who buy from FemmeCare."
        actions={
          canEdit && (
            <Button nativeButton={false} render={<Link to="/staff/outlets/new" />}>
              <Plus className="size-4" /> New outlet
            </Button>
          )
        }
      />
      <SimpleTable
        rows={shown}
        columns={columns}
        rowKey={(r) => r.o.id}
        rowHref={(r) => `/staff/outlets/${r.o.id}`}
        onRowClick={(r) => navigate(`/staff/outlets/${r.o.id}`)}
        searchText={(r) => `${r.o.id} ${r.o.name} ${r.o.city} ${r.o.district} ${r.o.contactPerson} ${r.o.mobile} ${r.o.taxId}`}
        exportName="outlets"
        defaultSort={{ key: "name", dir: "asc" }}
        toolbar={
          <FilterTabs
            value={tab}
            onChange={setTab}
            options={[
              { value: "all" as const, label: "All", count: rows.length },
              ...(["active", "on_hold", "inactive"] as const).map((k) => ({ value: k, label: OUTLET_STATUS_LABEL[k], count: rows.filter((r) => r.o.status === k).length })),
            ]}
          />
        }
        empty={<EmptyState icon={<Store className="size-5" />} title={tab === "all" ? "No outlets yet" : `No ${OUTLET_STATUS_LABEL[tab].toLowerCase()} outlets`} description="Register an outlet to start entering its orders." />}
      />
    </div>
  );
}
