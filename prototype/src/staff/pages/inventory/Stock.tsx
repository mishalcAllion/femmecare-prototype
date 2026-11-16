// S19 Stock overview: per product and channel allocation, with batches, cover and alerts.

import { Fragment, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { AlertTriangle, Boxes, CalendarClock, ChevronDown, ChevronRight, PackageCheck, ScrollText, Wallet } from "lucide-react";
import { useDb } from "@/domain/db";
import { available, batchOf, CHANNEL_LABEL, onHand, reserved, soldLast4Weeks, stockAlerts, weeksOfCover } from "@/domain/stock";
import { canAny, stockChannels } from "@/domain/permissions";
import { waitingQueue } from "@/domain/outlets";
import { date, daysBetween, num } from "@/domain/format";
import type { Channel } from "@/domain/types";
import { useCan, useNow, useStaffUser } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { Guard } from "@/staff/guard";
import { EmptyState, FilterTabs, Kpi, PageHeader, Panel, StatusBadge } from "@/components/fc/ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChannelBadge, ProductCell, channelName, daysLeftTone } from "./shared";
import { inventorySummary } from "@/domain/ext/inventory";
import { lkr, lkrShort as short } from "@/domain/format";

type Filter = "all" | "low" | "expiring";

export function StockPage() {
  return (
    <Guard perms={["stock.view.all", "stock.view.outlet", "stock.view.consultant"]}>
      <StockOverview />
    </Guard>
  );
}

function StockOverview() {
  usePageTitle("Stock");
  const db = useDb();
  const now = useNow();
  const user = useStaffUser();
  const [params, setParams] = useSearchParams();
  const filter = (params.get("filter") as Filter) || "all";
  const allowed = useMemo(() => stockChannels(user?.roles ?? []), [user]);
  const [chFilter, setChFilter] = useState<"both" | Channel>("both");
  const channels = chFilter === "both" ? allowed : allowed.filter((c) => c === chFilter);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const canGrnView = useCan("grn.view");
  const canGrnRecord = useCan("grn.record");
  const canGrn = canGrnView || canGrnRecord;
  const canLedger = useCan("stock.view.all");
  const canBackorders = canAny(user?.roles, ["outletOrders.edit", "reports.outlet"]);
  const warnDays = db.settings.stock.expiryWarnDays;

  const alerts = useMemo(() => stockAlerts(db, now), [db, now]);
  const rows = useMemo(
    () =>
      db.products
        .filter((p) => p.status === "active")
        .flatMap((p) =>
          channels.map((ch) => {
            const have = available(db, p.id, ch);
            const cover = weeksOfCover(db, p.id, ch, now);
            const sold = soldLast4Weeks(db, p.id, ch, now);
            const lots = db.stockLots
              .filter((l) => l.productId === p.id && l.channel === ch && l.onHand > 0)
              .map((l) => ({ ...l, expiry: batchOf(db, l.batchId)?.expiryDate ?? "" }))
              .sort((a, b) => a.expiry.localeCompare(b.expiry));
            const nearExpiry = lots.some((l) => daysBetween(now, l.expiry) <= warnDays);
            const sum = inventorySummary(db, p.id, ch);
            return {
              sum,
              key: `${p.id}:${ch}`,
              product: p,
              channel: ch,
              onHand: onHand(db, p.id, ch),
              reserved: reserved(db, p.id, ch),
              available: have,
              cover,
              sold,
              reorder: p.reorder[ch],
              low: have <= p.reorder[ch],
              nearExpiry,
              lots,
              waiting: ch === "outlet" ? waitingQueue(db, p.id).reduce((s, x) => s + x.line.backordered, 0) : 0,
            };
          }),
        ),
    [db, channels, now, warnDays],
  );
  const shown = rows.filter((r) => (filter === "low" ? r.low : filter === "expiring" ? r.nearExpiry : true));
  const lowCount = alerts.filter((a) => a.kind === "low" && a.channel && channels.includes(a.channel)).length;
  const expiring = alerts.filter((a) => a.kind === "expiry");
  const expiringVisible = rows.filter((r) => r.nearExpiry).length;
  const units = rows.reduce((s, r) => s + r.onHand, 0);
  const value = rows.reduce((s, r) => s + r.sum.value, 0);
  const waitingUnits = rows.reduce((s, r) => s + r.waiting, 0);
  const label = db.settings.labels.consultant;
  const restricted = allowed.length === 1;

  return (
    <div className="animate-rise">
      <PageHeader
        title="Stock"
        description={
          restricted
            ? `Stock held for ${channelName(db, allowed[0]).toLowerCase()}. Each channel has its own allocation in the warehouse.`
            : "One warehouse, with separate allocations for retail outlets and consultants. Available is on hand less what is reserved for orders."
        }
        actions={
          <>
            {canLedger && (
              <Button variant="outline" size="sm" nativeButton={false} render={<Link to="/staff/stock-ledger" />}>
                <ScrollText className="size-4" /> Stock ledger
              </Button>
            )}
            {canGrn && (
              <Button variant="outline" size="sm" nativeButton={false} render={<Link to="/staff/grn" />}>
                <PackageCheck className="size-4" /> Goods received
              </Button>
            )}
          </>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Units on hand" value={num(units)} sub={channels.map((c) => channelName(db, c)).join(" and ")} icon={<Boxes className="size-5" />} />
        <Kpi label="Inventory value" value={short(value)} sub={`${lkr(value)} at unit cost`} icon={<Wallet className="size-5" />} tone="plum" />
        <Kpi
          label="Low stock"
          value={lowCount}
          sub={`At or below the reorder level: ${channels.map((c) => `${alerts.filter((a) => a.kind === "low" && a.channel === c).length} for ${channelName(db, c).toLowerCase()}`).join(", ")}${channels.includes("outlet") && waitingUnits ? `; ${num(waitingUnits)} units back-ordered` : ""}`}
          icon={<AlertTriangle className="size-5" />}
          tone={lowCount ? "danger" : "success"}
          to="/staff/stock?filter=low"
        />
        <Kpi
          label="Batches close to expiry"
          value={expiring.length}
          sub={`Within ${warnDays} days (set in Settings)`}
          icon={<CalendarClock className="size-5" />}
          tone={expiring.length ? "warning" : "success"}
          to="/staff/stock?filter=expiring"
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <FilterTabs<Filter>
          value={filter}
          onChange={(v) => setParams(v === "all" ? {} : { filter: v })}
          options={[
            { value: "all", label: "All products", count: rows.length },
            { value: "low", label: "Low stock", count: rows.filter((r) => r.low).length },
            { value: "expiring", label: "Expiring soon", count: expiringVisible },
          ]}
        />
        {allowed.length > 1 && (
          <div className="ml-auto">
            <FilterTabs<"both" | Channel>
              value={chFilter}
              onChange={setChFilter}
              options={[
                { value: "both", label: "Both channels" },
                { value: "outlet", label: CHANNEL_LABEL.outlet },
                { value: "consultant", label: `${label}s` },
              ]}
            />
          </div>
        )}
      </div>

      {filter === "expiring" && expiring.length > 0 && (
        <Panel title="Batches close to expiry" description={`Stock in these batches should go out first. The warning starts ${warnDays} days before expiry.`} className="mb-4">
          <div className="grid gap-3 md:grid-cols-2">
            {expiring.map((a) => {
              const b = batchOf(db, a.batchId!);
              const days = b ? daysBetween(now, b.expiryDate) : 0;
              return (
                <Link key={a.batchId} to={`/staff/batches/${a.batchId}`} className="rounded-xl border border-warning/30 bg-warning-soft/60 p-4 transition hover:shadow-soft">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">Batch {a.batchId}</div>
                    <StatusBadge tone={daysLeftTone(days, warnDays)}>{days} days left</StatusBadge>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">{a.text}. Expires {date(b?.expiryDate)}.</div>
                </Link>
              );
            })}
          </div>
        </Panel>
      )}

      <div className="overflow-x-auto rounded-xl border border-border/70 bg-card shadow-soft">
        <table className="w-full min-w-[1180px] text-sm [&_td]:!px-2.5 [&_th]:!px-2.5">
          <thead>
            <tr className="border-b border-border/70 bg-muted/50 text-left text-xs text-muted-foreground [&>th]:whitespace-nowrap">
              <th className="w-8 px-3 py-2.5" />
              <th className="px-3 py-2.5 font-medium">Product</th>
              <th className="px-3 py-2.5 font-medium">Channel</th>
              <th className="px-3 py-2.5 text-right font-medium">Opening Stock</th>
              <th className="px-3 py-2.5 text-right font-medium">Total In</th>
              <th className="px-3 py-2.5 text-right font-medium">Total Out</th>
              <th className="px-3 py-2.5 text-right font-medium">On Hand</th>
              <th className="px-3 py-2.5 text-right font-medium">Reserved</th>
              <th className="px-3 py-2.5 text-right font-medium">Available</th>
              <th className="px-3 py-2.5 text-right font-medium" title="On hand ÷ average weekly sales over the last 4 weeks">
                Weeks of cover
              </th>
              <th className="px-3 py-2.5 text-right font-medium">Reorder Level</th>
              <th className="px-3 py-2.5 font-medium">Stock Status</th>
              <th className="px-3 py-2.5 text-right font-medium">Unit Cost</th>
              <th className="px-3 py-2.5 text-right font-medium">Stock Value</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const isOpen = !!open[r.key];
              return (
                <Fragment key={r.key}>
                  <tr className={cn("cursor-pointer border-b border-border/50 hover:bg-accent/40", isOpen && "bg-accent/30")} onClick={() => setOpen((o) => ({ ...o, [r.key]: !o[r.key] }))}>
                    <td className="px-3 py-3 text-muted-foreground">{isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</td>
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <ProductCell db={db} id={r.product.id} />
                    </td>
                    <td className="px-3 py-3">
                      <ChannelBadge channel={r.channel} />
                    </td>
                    <td className="px-3 py-3 text-right tabular text-muted-foreground">{num(r.sum.opening)}</td>
                    <td className="px-3 py-3 text-right tabular text-muted-foreground">{num(r.sum.totalIn)}</td>
                    <td className="px-3 py-3 text-right tabular text-muted-foreground">{num(r.sum.totalOut)}</td>
                    <td className="px-3 py-3 text-right tabular">{num(r.onHand)}</td>
                    <td className="px-3 py-3 text-right tabular text-muted-foreground">{num(r.reserved)}</td>
                    <td className={cn("px-3 py-3 text-right font-semibold tabular", r.low && "text-destructive")}>{num(r.available)}</td>
                    <td className="px-3 py-3 text-right tabular">
                      {r.cover === null ? <span className="text-muted-foreground">No sales</span> : r.cover.toFixed(1)}
                      <div className="whitespace-nowrap text-[0.7rem] text-muted-foreground">{num(r.sold)} sold, 4 wks</div>
                    </td>
                    <td className="px-3 py-3 text-right tabular text-muted-foreground">{num(r.reorder)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {r.low ? <StatusBadge tone="danger">{r.available === 0 ? "Reorder: none left" : "Reorder"}</StatusBadge> : <StatusBadge tone="success">OK</StatusBadge>}
                        {r.nearExpiry && <StatusBadge tone="warning">Expiring batch</StatusBadge>}
                        {r.waiting > 0 &&
                          (canBackorders ? (
                            <Link to={`/staff/backorders?product=${r.product.id}`} onClick={(e) => e.stopPropagation()}>
                              <StatusBadge tone="warning">{num(r.waiting)} back-ordered</StatusBadge>
                            </Link>
                          ) : (
                            <StatusBadge tone="warning">{num(r.waiting)} back-ordered</StatusBadge>
                          ))}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular text-muted-foreground">{lkr(r.sum.unitCost, { prefix: false })}</td>
                    <td className="px-3 py-3 text-right font-medium tabular">{lkr(r.sum.value, { prefix: false })}</td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-border/50 bg-muted/20">
                      <td />
                      <td colSpan={13} className="px-3 pb-4 pt-1">
                        {r.lots.length ? (
                          <div className="overflow-x-auto rounded-lg border border-border/60 bg-card">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-border/60 text-left text-muted-foreground">
                                  <th className="px-3 py-2 font-medium">Batch (earliest expiry first)</th>
                                  <th className="px-3 py-2 font-medium">Expiry</th>
                                  <th className="px-3 py-2 font-medium">Days left</th>
                                  <th className="px-3 py-2 text-right font-medium">On hand</th>
                                  <th className="px-3 py-2 text-right font-medium">Reserved</th>
                                  <th className="px-3 py-2 text-right font-medium">Available</th>
                                </tr>
                              </thead>
                              <tbody>
                                {r.lots.map((l, i) => {
                                  const days = daysBetween(now, l.expiry);
                                  return (
                                    <tr key={l.id} className="border-b border-border/40 last:border-0">
                                      <td className="px-3 py-2">
                                        <Link to={`/staff/batches/${l.batchId}`} className="font-medium text-primary hover:underline">
                                          {l.batchId}
                                        </Link>
                                        {i === 0 && <span className="ml-2 text-muted-foreground">picked first</span>}
                                      </td>
                                      <td className="px-3 py-2">{date(l.expiry)}</td>
                                      <td className="px-3 py-2">
                                        <StatusBadge tone={daysLeftTone(days, warnDays)} dot={false}>
                                          {num(days)} days
                                        </StatusBadge>
                                      </td>
                                      <td className="px-3 py-2 text-right tabular">{num(l.onHand)}</td>
                                      <td className="px-3 py-2 text-right tabular">{num(l.reserved)}</td>
                                      <td className="px-3 py-2 text-right tabular">{num(l.onHand - l.reserved)}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="py-2 text-sm text-muted-foreground">No stock in this allocation.</p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          {shown.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/60 font-semibold">
                <td />
                <td className="px-3 py-2.5" colSpan={2}>
                  Total ({shown.length} rows)
                </td>
                <td className="px-3 py-2.5 text-right tabular">{num(shown.reduce((s, r) => s + r.sum.opening, 0))}</td>
                <td className="px-3 py-2.5 text-right tabular">{num(shown.reduce((s, r) => s + r.sum.totalIn, 0))}</td>
                <td className="px-3 py-2.5 text-right tabular">{num(shown.reduce((s, r) => s + r.sum.totalOut, 0))}</td>
                <td className="px-3 py-2.5 text-right tabular">{num(shown.reduce((s, r) => s + r.onHand, 0))}</td>
                <td className="px-3 py-2.5 text-right tabular">{num(shown.reduce((s, r) => s + r.reserved, 0))}</td>
                <td className="px-3 py-2.5 text-right tabular">{num(shown.reduce((s, r) => s + r.available, 0))}</td>
                <td colSpan={4} />
                <td className="px-3 py-2.5 text-right tabular">{lkr(shown.reduce((s, r) => s + r.sum.value, 0), { prefix: false })}</td>
              </tr>
            </tfoot>
          )}
        </table>
        {!shown.length && (
          <div className="p-6">
            <EmptyState
              title={filter === "low" ? "No product is low on stock" : filter === "expiring" ? "No batch is close to expiry" : "No products yet"}
              description={filter === "all" ? "Add products and record goods received to see stock here." : "Alerts appear here when a level set in Settings is reached."}
            />
          </div>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Opening stock is the first goods received for each allocation; on hand = opening + total in - total out. Weeks of cover uses the last 4 weeks' sales. Stock status turns to Reorder when available stock is at or below the reorder level. Values are in LKR at unit cost.
      </p>
    </div>
  );
}
