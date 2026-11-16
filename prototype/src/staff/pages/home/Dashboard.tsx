// S2 Management dashboard: both channels side by side, read-only, with filters,
// KPIs, charts, recent activity and quick links to reports.

import { useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight, BadgeDollarSign, Boxes, ClipboardList, Clock, PackageCheck, RotateCcw, ShoppingBag, Store, TrendingUp, UserPlus, Users } from "lucide-react";
import { useDb } from "@/domain/db";
import { fullName } from "@/domain/consultants";
import { consultantCode, dateTime, lkr, lkrShort, monthLabel, num, relative } from "@/domain/format";
import { actorName, useNow, useReviewNotes, useStaffUser } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { Guard } from "@/staff/guard";
import { EmptyState, Kpi, PageHeader, Panel, StatusBadge } from "@/components/fc/ui";
import { NativeSelect } from "@/components/fc/docs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { reportsFor } from "@/domain/ext/reports";
import { workbookKpis } from "@/domain/lists";
import { dashboard, defaultRange, RANGES, type DashFilters, type FulfilmentBucket, type PayBucket, type RangeId } from "./dashboardData";

export function DashboardPage() {
  return (
    <Guard perms={["dashboard.management"]}>
      <Dashboard />
    </Guard>
  );
}

const C_OUTLET = "var(--chart-5)";
const C_CONS = "var(--chart-2)";
const BUCKET_COLOR: Record<FulfilmentBucket, string> = {
  Delivered: "var(--success)",
  Processing: "var(--info)",
  "On hold": "var(--warning)",
  Cancelled: "var(--destructive)",
};

function money(v: unknown) {
  return lkr(Number(v));
}

function axisMoney(v: number) {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}m`;
  if (Math.abs(v) >= 1000) return `${Math.round(v / 1000)}k`;
  return String(v);
}

const tooltipStyle = {
  contentStyle: { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12, color: "var(--popover-foreground)" },
  labelStyle: { color: "var(--muted-foreground)", marginBottom: 4 },
  cursor: { fill: "var(--muted)", opacity: 0.6 },
};

function Dashboard() {
  usePageTitle("Management dashboard");
  const db = useDb();
  const now = useNow();
  const user = useStaffUser();
  const [params, setParams] = useSearchParams();
  const label = db.settings.labels.consultant;
  const notes = useReviewNotes();
  const f: DashFilters = {
    range: (params.get("range") as RangeId) || defaultRange(now),
    channel: (params.get("channel") ?? "") as DashFilters["channel"],
    outletId: params.get("outlet") ?? "",
    consultantId: params.get("consultant") ?? "",
    sponsorId: params.get("sponsor") ?? "",
    productId: params.get("product") ?? "",
    orderStatus: (params.get("order") ?? "") as DashFilters["orderStatus"],
    paymentStatus: (params.get("payment") ?? "") as DashFilters["paymentStatus"],
  };
  const key = params.toString();
  const d = useMemo(() => dashboard(db, now, f), [db, now.slice(0, 13), key]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  const filtered = ["channel", "outlet", "consultant", "sponsor", "product", "order", "payment"].some((k) => params.get(k));
  const k = d.kpi;
  const sponsors = useMemo(() => db.consultants.filter((c) => c.number !== undefined && db.consultants.some((x) => x.sponsorId === c.id)).sort((a, b) => (a.number ?? 0) - (b.number ?? 0)), [db.consultants]);
  const sellers = useMemo(() => db.consultants.filter((c) => c.number !== undefined && c.number !== 1).sort((a, b) => (a.number ?? 0) - (b.number ?? 0)), [db.consultants]);
  const activity = useMemo(() => db.audit.filter((a) => a.area !== "Sign-in").slice(0, 8), [db.audit]);
  const reports = reportsFor(db, user?.roles ?? []);
  const quick = ["sales-by-outlet", "consultant-sales", "commissions", "stock-on-hand", "teams-recruitment", "consultant-orders", "payouts", "reconciliation"].map((id) => reports.find((r) => r.id === id)).filter(Boolean);
  const periodQuery = `from=${d.from}&to=${d.to}`;
  const scope = !d.showOutlet ? `${label}s only` : !d.showCons ? "Retail outlets only" : "Both channels";
  const totalOrders = Object.values(d.buckets).reduce((a, b) => a + b, 0);
  const wb = useMemo(() => workbookKpis(db, now), [db, now.slice(0, 13)]); // eslint-disable-line react-hooks/exhaustive-deps
  const summary: { label: string; value: string; to: string; tone?: "danger" | "warning" }[] = [
    { label: "Active customers", value: num(wb.activeCustomers), to: "/staff/outlets" },
    { label: "Active products", value: num(wb.activeProducts), to: "/staff/products" },
    { label: "Orders recorded", value: num(wb.ordersRecorded), to: "/staff/outlet-orders" },
    { label: "Invoices recorded", value: num(wb.invoicesRecorded), to: "/staff/invoices" },
    { label: "Total invoiced", value: lkrShort(wb.totalInvoiced), to: "/staff/reports/invoices?from=2000-01-01" },
    { label: "Payments received", value: lkrShort(wb.paymentsReceived), to: "/staff/outlet-payments" },
    { label: "Outstanding receivables", value: lkrShort(wb.outstandingReceivables), to: "/staff/reports/ageing", tone: "warning" },
    { label: "Inventory value", value: lkrShort(wb.inventoryValue), to: "/staff/reports/inventory-summary" },
    { label: "Products at reorder level, any channel", value: num(wb.itemsAtReorderLevel), to: "/staff/stock?filter=low", tone: wb.itemsAtReorderLevel ? "danger" : undefined },
    { label: "Overdue invoices", value: num(wb.overdueInvoices), to: "/staff/invoices?status=Overdue", tone: wb.overdueInvoices ? "danger" : undefined },
  ];

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Management dashboard"
        title="How both channels are doing"
        description={`${d.label}. ${scope}. Figures come straight from orders, invoices, stock and commission records.`}
        actions={
          filtered && (
            <Button variant="outline" size="sm" onClick={() => setParams(params.get("range") ? { range: params.get("range")! } : {}, { replace: true })}>
              <RotateCcw className="size-4" /> Clear filters
            </Button>
          )
        }
      />

      <div className="mb-6 grid gap-3 rounded-2xl border border-border/70 bg-card p-4 shadow-soft sm:grid-cols-2 lg:grid-cols-4">
        <FilterSelect label="Date range" value={f.range} onChange={(v) => set("range", v)}>
          {RANGES.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Channel" value={f.channel} onChange={(v) => set("channel", v)}>
          <option value="">Both channels</option>
          <option value="outlet">Retail outlets</option>
          <option value="consultant">{label}s</option>
        </FilterSelect>
        <FilterSelect label="Outlet" value={f.outletId} onChange={(v) => set("outlet", v)}>
          <option value="">All outlets</option>
          {db.outlets.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label={label} value={f.consultantId} onChange={(v) => set("consultant", v)}>
          <option value="">All {label.toLowerCase()}s</option>
          {sellers.map((c) => (
            <option key={c.id} value={c.id}>
              {consultantCode(c.number)} {fullName(c)}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Sponsor" value={f.sponsorId} onChange={(v) => set("sponsor", v)}>
          <option value="">All sponsors</option>
          {sponsors.map((c) => (
            <option key={c.id} value={c.id}>
              {c.number === 1 ? "FemmeCare (No. 1)" : `${consultantCode(c.number)} ${fullName(c)}`}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Product" value={f.productId} onChange={(v) => set("product", v)}>
          <option value="">All products</option>
          {db.products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id} {p.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Order status" value={f.orderStatus} onChange={(v) => set("order", v)}>
          <option value="">All statuses</option>
          {(["Delivered", "Processing", "On hold", "Cancelled"] as FulfilmentBucket[]).map((s) => (
            <option key={s}>{s}</option>
          ))}
        </FilterSelect>
        <FilterSelect label="Payment status" value={f.paymentStatus} onChange={(v) => set("payment", v)}>
          <option value="">All statuses</option>
          {(["Paid", "Pending", "Failed or overdue", "Refunded"] as PayBucket[]).map((s) => (
            <option key={s}>{s}</option>
          ))}
        </FilterSelect>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {d.showCons && (
          <>
            <Kpi label={`Registered ${label.toLowerCase()}s`} value={num(k.registered)} sub={`${k.pendingApps} applications waiting`} icon={<Users className="size-5" />} to="/staff/consultants" />
            <Kpi label={`Active ${label.toLowerCase()}s`} value={num(k.active)} sub={`${k.registered ? Math.round((k.active / k.registered) * 100) : 0}% of registered`} icon={<Users className="size-5" />} tone="success" to="/staff/consultants" />
            <Kpi label={`New recruits, ${d.label}`} value={num(k.recruits)} trend={k.recruitsTrend !== undefined ? { value: k.recruitsTrend, label: "vs previous period" } : undefined} icon={<UserPlus className="size-5" />} tone="plum" to={`/staff/reports/teams-recruitment?${periodQuery}`} />
            <Kpi
              label={`${label} sales (net)`}
              value={lkrShort(k.consultantSales)}
              sub={`${lkrShort(k.mrpValue)} at MRP value`}
              trend={k.consultantSalesTrend !== undefined ? { value: k.consultantSalesTrend, label: "vs previous period" } : undefined}
              icon={<ShoppingBag className="size-5" />}
              tone="plum"
              to={f.range === "this_month" || f.range === "last_month" ? `/staff/reports/consultant-sales?month=${d.from.slice(0, 7)}` : `/staff/reports/consultant-orders?${periodQuery}&status=Paid`}
            />
          </>
        )}
        {d.showOutlet && (
          <Kpi
            label="Outlet revenue (invoiced)"
            value={lkrShort(k.outletRevenue)}
            trend={k.outletRevenueTrend !== undefined ? { value: k.outletRevenueTrend, label: "vs previous period" } : undefined}
            icon={<Store className="size-5" />}
            tone="info"
            to={`/staff/reports/sales-by-outlet?${periodQuery}${f.outletId ? `&outlet=${f.outletId}` : ""}${f.productId ? `&product=${f.productId}` : ""}`}
          />
        )}
        <Kpi label="Orders" value={num(k.orders)} sub={d.showCons && d.showOutlet ? `${num(k.consultantOrders)} ${label.toLowerCase()}, ${num(k.outletOrders)} outlet` : undefined} trend={k.ordersTrend !== undefined ? { value: k.ordersTrend, label: "vs previous period" } : undefined} icon={<ClipboardList className="size-5" />} />
        <Kpi label="Fulfilment rate" value={`${k.fulfilment.toFixed(0)}%`} sub={`${num(k.delivered)} delivered of ${num(k.orders - d.buckets.Cancelled)} not cancelled`} icon={<PackageCheck className="size-5" />} tone="success" />
        {d.showCons && (
          <>
            <Kpi
              label="Commission liability"
              value={lkrShort(k.liability)}
              sub={`${lkrShort(k.provisional)} provisional (${k.openMonths.map((m) => monthLabel(m, false).split(" ")[0]).join(", ")}), ${lkrShort(k.approvedUnpaid)} approved, not paid`}
              icon={<BadgeDollarSign className="size-5" />}
              tone="warning"
              to="/staff/commission"
            />
            <Kpi label="Pending payments" value={lkrShort(k.pendingValue)} sub={`${k.pendingCount} orders from ${k.pendingPeople} ${label.toLowerCase()}s`} icon={<Clock className="size-5" />} tone="warning" to="/staff/consultant-orders" />
          </>
        )}
        {d.showOutlet && <Kpi label="Open outlet quantity" value={num(k.openQty)} sub={`${num(k.backQty)} back-ordered, waiting for stock`} icon={<Boxes className="size-5" />} tone={k.backQty ? "danger" : "info"} to={`/staff/reports/open-orders${f.outletId ? `?outlet=${f.outletId}` : ""}`} />}
      </div>

      <Panel
        title="Business summary"
        description={`${notes ? "The ten figures from FemmeCare's ERP dashboard sheet: all" : "All"} outlets and stock as of today, whatever the filters above`}
        className="mb-6"
        bodyClassName="p-0"
      >
        <div className="grid grid-cols-2 divide-border/60 sm:grid-cols-3 lg:grid-cols-5 [&>*]:border-b [&>*]:border-r [&>*]:border-border/60">
          {summary.map((t) => (
            <Link key={t.label} to={t.to} className="group px-4 py-3 transition hover:bg-accent/40">
              <div className="text-xs text-muted-foreground group-hover:text-foreground">{t.label}</div>
              <div className={cn("mt-1 font-display text-xl font-semibold tabular", t.tone === "danger" && "text-destructive", t.tone === "warning" && "text-warning")}>{t.value}</div>
            </Link>
          ))}
        </div>
      </Panel>

      <div className="mb-6 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <ChartPanel title="Monthly sales by channel" description={`Outlet invoices and paid ${label.toLowerCase()} orders (net), LKR`}>
          {d.trend.some((t) => t.outlets || t.consultants) ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={d.trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
                <YAxis tickFormatter={axisMoney} tickLine={false} axisLine={false} width={44} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
                <Tooltip {...tooltipStyle} formatter={(v, n) => [money(v), n]} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                {d.showOutlet && <Bar dataKey="outlets" name="Retail outlets" fill={C_OUTLET} radius={[4, 4, 0, 0]} maxBarSize={28} />}
                {d.showCons && <Bar dataKey="consultants" name={`${label}s`} fill={C_CONS} radius={[4, 4, 0, 0]} maxBarSize={28} />}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </ChartPanel>
        <ChartPanel title="Orders by fulfilment status" description={`${num(totalOrders)} orders placed, ${d.label}`}>
          {totalOrders ? (
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <div className="relative h-[200px] w-[200px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={Object.entries(d.buckets).map(([name, value]) => ({ name, value }))} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={1.5} stroke="var(--card)" strokeWidth={2}>
                      {Object.keys(d.buckets).map((b) => (
                        <Cell key={b} fill={BUCKET_COLOR[b as FulfilmentBucket]} />
                      ))}
                    </Pie>
                    <Tooltip {...tooltipStyle} formatter={(v, n) => [`${num(Number(v))} orders`, n]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <div className="font-display text-2xl font-semibold tabular">{num(totalOrders)}</div>
                  <div className="text-xs text-muted-foreground">orders</div>
                </div>
              </div>
              <ul className="w-full space-y-2 text-sm">
                {(Object.entries(d.buckets) as [FulfilmentBucket, number][]).map(([b, n]) => (
                  <li key={b} className="flex items-center justify-between gap-3">
                    <button type="button" onClick={() => set("order", f.orderStatus === b ? "" : b)} className="flex items-center gap-2 hover:underline">
                      <span className="size-2.5 rounded-full" style={{ background: BUCKET_COLOR[b] }} />
                      {b}
                    </button>
                    <span className="tabular">
                      <span className="font-medium">{num(n)}</span> <span className="text-muted-foreground">({totalOrders ? ((n / totalOrders) * 100).toFixed(0) : 0}%)</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <EmptyChart />
          )}
        </ChartPanel>
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-3">
        {d.showCons && (
          <ChartPanel title="Commission" description="Provisional while the month is open; payable once it is locked" action={<Link to="/staff/commission" className="text-xs font-medium text-primary hover:underline">Open</Link>}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={d.commissionTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
                <YAxis tickFormatter={axisMoney} tickLine={false} axisLine={false} width={40} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
                <Tooltip {...tooltipStyle} formatter={(v, n) => [money(v), n]} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="provisional" name="Calculated" fill="var(--chart-4)" radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Bar dataKey="payable" name="Payable (locked)" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>
        )}
        {d.showCons && (
          <ChartPanel title={`${label} recruitment`} description="New recruits approved each month" action={<Link to={`/staff/reports/teams-recruitment?${periodQuery}`} className="text-xs font-medium text-primary hover:underline">Report</Link>}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={d.recruitTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(v, _n, item) => [`${num(Number(v))} new, ${num((item?.payload as { total: number })?.total ?? 0)} registered by month end`, "Recruits"]}
                />
                <Bar dataKey="recruits" name="New recruits" fill={C_CONS} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>
        )}
        <ChartPanel title="Stock by channel" description="Units on hand in each allocation" action={<Link to="/staff/stock" className="text-xs font-medium text-primary hover:underline">Stock</Link>}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={d.stock} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }} barGap={2}>
              <CartesianGrid horizontal={false} stroke="var(--border)" />
              <XAxis type="number" tickFormatter={axisMoney} tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={96} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
              <Tooltip {...tooltipStyle} formatter={(v, n) => [`${num(Number(v))} units`, n]} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              {d.showOutlet && <Bar dataKey="outlets" name="Retail outlets" fill={C_OUTLET} radius={[0, 4, 4, 0]} maxBarSize={10} />}
              {d.showCons && <Bar dataKey="consultants" name={`${label}s`} fill={C_CONS} radius={[0, 4, 4, 0]} maxBarSize={10} />}
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Panel title="Best-selling products" description={`${d.label}, both channels at the price charged`} bodyClassName="p-0">
          {d.bestSellers.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                    <th className="px-5 py-2.5 font-medium">#</th>
                    <th className="px-2 py-2.5 font-medium">Product</th>
                    <th className="px-2 py-2.5 text-right font-medium">Units</th>
                    <th className="px-2 py-2.5 text-right font-medium">Sales</th>
                    <th className="px-5 py-2.5 font-medium">Share of sales</th>
                  </tr>
                </thead>
                <tbody>
                  {d.bestSellers.map((p, i) => (
                    <tr key={p.id} className="border-b border-border/50 last:border-0">
                      <td className="px-5 py-2.5 text-muted-foreground">{i + 1}</td>
                      <td className="px-2 py-2.5">
                        <Link to={`/staff/products/${p.id}`} className="font-medium hover:text-primary">
                          {p.name}
                        </Link>
                        <span className="ml-1.5 text-xs text-muted-foreground">{p.id}</span>
                      </td>
                      <td className="px-2 py-2.5 text-right tabular">{num(p.units)}</td>
                      <td className="px-2 py-2.5 text-right tabular">{lkr(p.value)}</td>
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${p.share}%` }} />
                          </div>
                          <span className="w-10 text-right text-xs tabular text-muted-foreground">{p.share.toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-5">
              <EmptyState icon={<TrendingUp className="size-5" />} title="No sales in this period" description="Choose a longer date range." />
            </div>
          )}
        </Panel>
        <Panel title="Recent activity" actions={<Link to="/staff/audit" className="text-xs font-medium text-primary hover:underline">Audit log</Link>} bodyClassName="p-0">
          <ul className="divide-y divide-border/50">
            {activity.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3 px-5 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{a.action}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {actorName(db, a.by)} · {a.area}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground" title={dateTime(a.ts)}>
                  {relative(a.ts, now)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {quick.length > 0 && (
        <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-soft">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold">Quick reports</div>
            <Link to="/staff/reports" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              All reports <ArrowRight className="size-3.5" />
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {quick.map((r) => (
              <Button key={r!.id} variant="outline" size="sm" nativeButton={false} render={<Link to={`/staff/reports/${r!.id}`} />}>
                {r!.group === "consultant" ? `${label} ${r!.title.toLowerCase()}` : r!.title}
              </Button>
            ))}
          </div>
        </div>
      )}
      <div className="mt-3 flex justify-end">
        <StatusBadge tone="neutral" dot={false}>
          Updated {dateTime(now)}
        </StatusBadge>
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <label className="grid min-w-0 gap-1 text-xs font-medium text-muted-foreground">
      {label}
      <NativeSelect value={value} onChange={(e) => onChange(e.target.value)} className={cn("text-foreground", value && "border-primary/40 bg-brand-soft/40")}>
        {children}
      </NativeSelect>
    </label>
  );
}

function ChartPanel({ title, description, action, children }: { title: string; description?: string; action?: ReactNode; children: ReactNode }) {
  const [, force] = useState(0);
  void force;
  return (
    <Panel title={title} description={description} actions={action}>
      {children}
    </Panel>
  );
}

function EmptyChart() {
  return <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">No figures for these filters</div>;
}
