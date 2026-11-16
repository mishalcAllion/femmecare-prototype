// S10 Lost sales: balances outlets declined while waiting for stock.

import { useMemo, useState } from "react";
import { Link } from "react-router";
import { TrendingDown } from "lucide-react";
import { useDb } from "@/domain/db";
import { outletName } from "@/domain/outlets";
import { productName } from "@/domain/stock";
import { date, lkr, lkrShort, monthKey, monthLabel, num } from "@/domain/format";
import { lostSales, type LostSale } from "@/domain/ext/outlets";
import { useNow } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { Guard } from "../../guard";
import { EmptyState, FilterTabs, Kpi, PageHeader, SimpleTable } from "@/components/fc/ui";

export function LostSales() {
  return (
    <Guard perms={["outletOrders.edit", "reports.outlet"]}>
      <Page />
    </Guard>
  );
}

function Page() {
  usePageTitle("Lost sales");
  const db = useDb();
  const now = useNow();
  const month = monthKey(now);
  const [period, setPeriod] = useState<"all" | "month">("all");
  const all = useMemo(() => lostSales(db), [db]);
  const rows = period === "month" ? all.filter((l) => monthKey(l.date) === month) : all;
  const total = rows.reduce((s, l) => s + l.value, 0);
  const units = rows.reduce((s, l) => s + l.qty, 0);
  const byProduct = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of rows) m.set(l.productId, (m.get(l.productId) ?? 0) + l.value);
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0];
  }, [rows]);

  return (
    <div className="animate-rise space-y-6">
      <PageHeader title="Lost sales" description="Balances an outlet declined while waiting for stock. Each one is recorded from the back-order list with a reason." />
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Value lost" value={lkrShort(total)} sub={lkr(total)} tone="danger" icon={<TrendingDown className="size-5" />} />
        <Kpi label="Units declined" value={num(units)} sub={`${rows.length} balance${rows.length === 1 ? "" : "s"}`} tone="warning" />
        <Kpi label="Most lost" value={byProduct ? byProduct[0] : "None"} sub={byProduct ? `${productName(db, byProduct[0])}, ${lkr(byProduct[1])}` : "No lost sales"} tone="neutral" />
      </div>
      <SimpleTable<LostSale>
        rows={rows}
        rowKey={(l) => `${l.order.id}-${l.productId}`}
        exportName="lost-sales"
        defaultSort={{ key: "date", dir: "desc" }}
        searchText={(l) => `${l.order.id} ${l.order.poNumber} ${outletName(db, l.order.outletId)} ${l.productId} ${productName(db, l.productId)} ${l.reason}`}
        toolbar={
          <FilterTabs
            value={period}
            onChange={setPeriod}
            options={[
              { value: "all", label: "All", count: all.length },
              { value: "month", label: monthLabel(month), count: all.filter((l) => monthKey(l.date) === month).length },
            ]}
          />
        }
        columns={[
          { key: "date", className: "whitespace-nowrap", header: "Recorded", value: (l) => l.date, cell: (l) => date(l.date) },
          {
            key: "outlet",
            header: "Outlet",
            value: (l) => outletName(db, l.order.outletId),
            cell: (l) => (
              <Link to={`/staff/outlets/${l.order.outletId}`} className="font-medium hover:text-primary">
                {outletName(db, l.order.outletId)}
              </Link>
            ),
          },
          {
            key: "order",
            header: "Order",
            value: (l) => l.order.id,
            cell: (l) => (
              <Link to={`/staff/outlet-orders/${l.order.id}`} className="hover:text-primary">
                {l.order.id}
                <span className="block text-xs text-muted-foreground">PO {l.order.poNumber}</span>
              </Link>
            ),
          },
          { key: "product", header: "Product", value: (l) => `${l.productId} ${productName(db, l.productId)}`, cell: (l) => <span>{productName(db, l.productId)}<span className="block text-xs text-muted-foreground">{l.productId}</span></span> },
          { key: "qty", className: "whitespace-nowrap", header: "Units", align: "right", value: (l) => l.qty, cell: (l) => num(l.qty) },
          { key: "value", className: "whitespace-nowrap", header: "Value", align: "right", value: (l) => l.value, cell: (l) => <span className="font-medium">{lkr(l.value)}</span> },
          { key: "reason", header: "Reason", value: (l) => l.reason, cell: (l) => <span className="text-muted-foreground">{l.reason}</span> },
        ]}
        empty={<EmptyState icon={<TrendingDown className="size-5" />} title="No lost sales" description={period === "month" ? `No balance was declined in ${monthLabel(month)}.` : "When an outlet declines a back-ordered balance, it is recorded here."} />}
      />
    </div>
  );
}
