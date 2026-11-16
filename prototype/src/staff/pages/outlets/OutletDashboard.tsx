// S3 Outlet dashboard: the retail channel at a glance.

import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ClipboardList, Hourglass, ReceiptText, TrendingDown, Wallet } from "lucide-react";
import { useDb } from "@/domain/db";
import { available, weeksOfCover } from "@/domain/stock";
import { invoiceBalance, daysOverdue, orderValue, outletName, orderTotals, waitingQueue } from "@/domain/outlets";
import { dayKey, lkr, lkrShort, monthKey, monthLabel, num, prevMonthKey, relative } from "@/domain/format";
import { invoiced, lostSales, openUnits, overdueAmount, overdueInvoices } from "@/domain/ext/outlets";
import { useNow } from "@/lib/fc";
import { workbookKpis } from "@/domain/lists";
import { usePageTitle } from "@/lib/title";
import { Guard } from "../../guard";
import { EmptyState, FilterTabs, Kpi, PageHeader, Panel, StatusBadge } from "@/components/fc/ui";
import { ProductPack } from "@/components/fc/brand";
import { Button } from "@/components/ui/button";
import { OrderStatusBadge, useTrackPayments } from "./shared";

type Period = "month" | "last" | "ytd";

export function OutletDashboard() {
  return (
    <Guard perms={["dashboard.outlet"]}>
      <Dashboard />
    </Guard>
  );
}

function Dashboard() {
  usePageTitle("Outlet dashboard");
  const db = useDb();
  const now = useNow();
  const track = useTrackPayments();
  const [period, setPeriod] = useState<Period>("month");
  const today = dayKey(now);
  const month = monthKey(now);
  const last = prevMonthKey(month);
  const year = month.slice(0, 4);

  const f = useMemo(() => {
    const live = db.outletOrders.filter((o) => o.status !== "cancelled");
    const todays = db.outletOrders.filter((o) => dayKey(o.createdAt) === today);
    const open = live.filter((o) => openUnits(o) > 0);
    const backUnits = live.reduce((s, o) => s + orderTotals(o).backordered, 0);
    const backOutlets = new Set(live.filter((o) => orderTotals(o).backordered > 0).map((o) => o.outletId)).size;
    const lost = lostSales(db).filter((l) => monthKey(l.date) === month);
    return {
      todays,
      todaysValue: todays.reduce((s, o) => s + orderValue(o), 0),
      openUnits: open.reduce((s, o) => s + openUnits(o), 0),
      openOrders: open.length,
      backUnits,
      backOutlets,
      revenueMonth: invoiced(db, (i) => monthKey(i.date) === month),
      lostValue: lost.reduce((s, l) => s + l.value, 0),
      lostUnits: lost.reduce((s, l) => s + l.qty, 0),
      overdue: overdueInvoices(db, now),
      overdueAmt: overdueAmount(db, now),
    };
  }, [db, now, today, month]);

  const chart = useMemo(() => {
    const test = (iso: string) => (period === "month" ? monthKey(iso) === month : period === "last" ? monthKey(iso) === last : monthKey(iso).startsWith(year));
    return db.outlets
      .map((o) => ({ name: o.name, id: o.id, value: invoiced(db, (i) => i.outletId === o.id && test(i.date)) }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [db, period, month, last, year]);
  const chartTotal = chart.reduce((s, r) => s + r.value, 0);

  const stock = useMemo(
    () =>
      db.products
        .filter((p) => p.status === "active")
        .map((p) => ({ p, avail: available(db, p.id, "outlet"), cover: weeksOfCover(db, p.id, "outlet", now), waiting: waitingQueue(db, p.id).reduce((s, x) => s + x.line.backordered, 0) }))
        .sort((a, b) => Number(b.avail <= b.p.reorder.outlet) - Number(a.avail <= a.p.reorder.outlet) || a.avail - b.avail),
    [db, now],
  );
  const lowCount = stock.filter((s) => s.avail <= s.p.reorder.outlet).length;

  const recent = useMemo(() => [...db.outletOrders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6), [db]);

  return (
    <div className="animate-rise space-y-6">
      <PageHeader
        title="Outlet dashboard"
        description={`Retail outlet sales for ${monthLabel(month)}. Revenue is the value invoiced, cancelled invoices left out.`}
        actions={
          <>
            <Button variant="outline" nativeButton={false} render={<Link to="/staff/backorders" />}>
              <Hourglass className="size-4" /> Back-orders
            </Button>
            <Button nativeButton={false} render={<Link to="/staff/outlet-orders/new" />}>New outlet order</Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <Kpi label="Orders today" value={num(f.todays.length)} sub={f.todays.length ? lkr(f.todaysValue) : "None entered yet"} icon={<ClipboardList className="size-5" />} to="/staff/outlet-orders" />
        <Kpi label="Open units" value={num(f.openUnits)} sub={`On ${f.openOrders} open order${f.openOrders === 1 ? "" : "s"}`} icon={<ClipboardList className="size-5" />} tone="info" to="/staff/outlet-orders" />
        <Kpi label="Back-ordered units" value={num(f.backUnits)} sub={f.backUnits ? `${f.backOutlets} outlet${f.backOutlets === 1 ? "" : "s"} waiting` : "Nothing waiting"} icon={<Hourglass className="size-5" />} tone="warning" to="/staff/backorders" />
        <Kpi label={`Revenue, ${monthLabel(month, false)}`} value={lkrShort(f.revenueMonth)} sub={lkr(f.revenueMonth)} icon={<ReceiptText className="size-5" />} tone="success" to="/staff/invoices" />
        <Kpi label={`Lost sales, ${monthLabel(month, false)}`} value={lkrShort(f.lostValue)} sub={f.lostUnits ? `${num(f.lostUnits)} units declined` : "No balances declined"} icon={<TrendingDown className="size-5" />} tone="danger" to="/staff/lost-sales" />
        {track && (
          <Kpi label="Overdue invoices" value={lkrShort(f.overdueAmt)} sub={`${f.overdue.length} invoice${f.overdue.length === 1 ? "" : "s"} past due`} icon={<Wallet className="size-5" />} tone="danger" to="/staff/invoices?status=Overdue" />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          title="Revenue by outlet"
          description={`${lkr(chartTotal)} invoiced ${period === "month" ? `in ${monthLabel(month)}` : period === "last" ? `in ${monthLabel(last)}` : `in ${year} to date`}`}
          actions={
            <FilterTabs<Period>
              value={period}
              onChange={setPeriod}
              options={[
                { value: "month", label: monthLabel(month, false) },
                { value: "last", label: monthLabel(last, false) },
                { value: "ytd", label: "Year to date" },
              ]}
            />
          }
        >
          {chart.length ? (
            <div style={{ height: Math.max(320, chart.length * 44 + 30) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barCategoryGap={6}>
                  <CartesianGrid horizontal={false} stroke="var(--border)" strokeOpacity={0.6} />
                  <XAxis type="number" tickFormatter={(v: number) => lkrShort(v).replace("LKR ", "")} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12, fill: "var(--foreground)" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                    content={({ active, payload }) =>
                      active && payload?.length ? (
                        <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-soft">
                          <div className="font-medium">{payload[0].payload.name}</div>
                          <div className="tabular text-muted-foreground">{lkr(Number(payload[0].value))}</div>
                          <div className="text-muted-foreground">{chartTotal ? Math.round((Number(payload[0].value) / chartTotal) * 100) : 0}% of the period</div>
                        </div>
                      ) : null
                    }
                  />
                  <Bar dataKey="value" fill="var(--chart-1)" radius={[0, 4, 4, 0]} maxBarSize={26} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="Nothing invoiced yet" description="Revenue appears here once invoices are issued for the period." />
          )}
        </Panel>

        <Panel
          title="Outlet stock"
          description={lowCount ? `${lowCount} product${lowCount === 1 ? "" : "s"} at or below the reorder level for retail outlets` : "Every product is above its reorder level for retail outlets"}
          bodyClassName="p-0"
        >
          <ul className="divide-y divide-border/60">
            {stock.map(({ p, avail, cover, waiting }) => {
              const low = avail <= p.reorder.outlet;
              return (
                <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                  <ProductPack product={p} className="size-9 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Reorder at {num(p.reorder.outlet)}
                      {cover !== null && ` · ${cover.toFixed(1)} weeks of cover`}
                      {waiting > 0 && ` · ${num(waiting)} waiting`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`tabular text-sm font-semibold ${low ? "text-destructive" : ""}`}>{num(avail)}</div>
                    {low ? (
                      <StatusBadge tone="danger" className="mt-0.5">
                        Low
                      </StatusBadge>
                    ) : (
                      <div className="text-[0.7rem] text-muted-foreground">available</div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <KeyFigures now={now} track={track} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Latest orders"
          actions={
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/staff/outlet-orders" />}>
              All orders
            </Button>
          }
          bodyClassName="p-0"
        >
          {recent.length ? (
            <ul className="divide-y divide-border/60">
              {recent.map((o) => (
                <li key={o.id}>
                  <Link to={`/staff/outlet-orders/${o.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-accent/40">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">
                        {outletName(db, o.outletId)} <span className="font-normal text-muted-foreground">· PO {o.poNumber}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {o.id} · {relative(o.createdAt, now)} · {num(orderTotals(o).qty)} units
                      </div>
                    </div>
                    <div className="tabular text-sm">{lkr(orderValue(o))}</div>
                    <OrderStatusBadge order={o} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-5">
              <EmptyState title="No outlet orders yet" description="Orders appear here as soon as a PO is entered." />
            </div>
          )}
        </Panel>

        {track ? (
          <Panel
            title="Overdue invoices"
            description={f.overdue.length ? `${lkr(f.overdueAmt)} past the due date` : undefined}
            actions={
              <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/staff/invoices?status=Overdue" />}>
                All overdue
              </Button>
            }
            bodyClassName="p-0"
          >
            {f.overdue.length ? (
              <ul className="divide-y divide-border/60">
                {[...f.overdue]
                  .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
                  .map((i) => (
                    <li key={i.id}>
                      <Link to={`/staff/invoices/${i.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-accent/40">
                        <AlertTriangle className="size-4 shrink-0 text-destructive" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium">{outletName(db, i.outletId)}</div>
                          <div className="text-xs text-muted-foreground">
                            {i.id} · {daysOverdue(i, now)} days overdue
                          </div>
                        </div>
                        <div className="tabular text-sm font-semibold">{lkr(invoiceBalance(db, i))}</div>
                      </Link>
                    </li>
                  ))}
              </ul>
            ) : (
              <div className="p-5">
                <EmptyState title="Nothing overdue" description="Every outlet invoice is paid or within its terms." />
              </div>
            )}
          </Panel>
        ) : (
          <Panel title="Outlet payments">
            <p className="text-sm text-muted-foreground">Outlet payments are not tracked in this system, so balances and overdue invoices are followed up outside it.</p>
          </Panel>
        )}
      </div>
    </div>
  );
}

function KeyFigures({ now, track }: { now: string; track: boolean }) {
  const db = useDb();
  const k = useMemo(() => workbookKpis(db, now), [db, now]);
  const items: { label: string; value: string; to?: string; tone?: "danger" | "warning" }[] = [
    { label: "Active customers", value: num(k.activeCustomers), to: "/staff/outlets" },
    { label: "Active products", value: num(k.activeProducts), to: "/staff/products" },
    { label: "Orders recorded", value: num(k.ordersRecorded), to: "/staff/outlet-orders" },
    { label: "Invoices recorded", value: num(k.invoicesRecorded), to: "/staff/invoices" },
    { label: "Total invoiced", value: lkr(k.totalInvoiced) },
    ...(track
      ? [
          { label: "Payments received", value: lkr(k.paymentsReceived), to: "/staff/outlet-payments" },
          { label: "Outstanding receivables", value: lkr(k.outstandingReceivables), to: "/staff/outlet-payments" },
        ]
      : []),
    { label: "Inventory value (at cost)", value: lkr(k.inventoryValue), to: "/staff/stock" },
    { label: "Products at reorder level, any channel", value: num(k.itemsAtReorderLevel), to: "/staff/stock?filter=low", tone: k.itemsAtReorderLevel ? ("warning" as const) : undefined },
    ...(track ? [{ label: "Overdue invoices", value: num(k.overdueInvoices), to: "/staff/invoices?status=Overdue", tone: k.overdueInvoices ? ("danger" as const) : undefined }] : []),
  ];
  return (
    <Panel title="Key figures" description="Totals across all outlets and both stock allocations, as of today" bodyClassName="p-0">
      <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((i) => {
          const body = (
            <>
              <dt className="text-xs text-muted-foreground">{i.label}</dt>
              <dd className={`mt-1 font-display text-lg font-semibold tabular ${i.tone === "danger" ? "text-destructive" : i.tone === "warning" ? "text-warning" : ""}`}>{i.value}</dd>
            </>
          );
          return (
            <div key={i.label} className="border-b border-r border-border/60 [&:nth-child(5n)]:lg:border-r-0">
              {i.to ? (
                <Link to={i.to} className="block px-5 py-4 transition hover:bg-accent/40">
                  {body}
                </Link>
              ) : (
                <div className="px-5 py-4">{body}</div>
              )}
            </div>
          );
        })}
      </dl>
    </Panel>
  );
}
