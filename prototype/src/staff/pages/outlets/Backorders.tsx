// S9 Back-orders and restock allocation: waiting outlets per product, oldest
// first, with the stock available to give them. First in, first out is enforced.

import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { CalendarClock, Check, Hourglass, PackageCheck, UserX } from "lucide-react";
import { useDb } from "@/domain/db";
import { actions } from "@/domain/actions";
import { lineValue, outletName, waitingQueue } from "@/domain/outlets";
import { available, productOf } from "@/domain/stock";
import { date, dateShort, lkr, num, relative } from "@/domain/format";
import { ordinal } from "@/domain/ext/outlets";
import { act, useCan, useNow } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { Guard } from "../../guard";
import { EmptyState, FilterTabs, PageHeader, Panel, ReasonDialog, StatusBadge } from "@/components/fc/ui";
import { ProductPack } from "@/components/fc/brand";
import { Button } from "@/components/ui/button";
import type { OutletOrder } from "@/domain/types";
import { ReviseDateDialog, done } from "./shared";

export function Backorders() {
  return (
    <Guard perms={["outletOrders.edit", "reports.outlet"]}>
      <Page />
    </Guard>
  );
}

function Page() {
  usePageTitle("Back-orders");
  const db = useDb();
  const now = useNow();
  const canEdit = useCan("outletOrders.edit");
  const [params, setParams] = useSearchParams();
  const product = params.get("product") ?? "";
  const closeMode = db.settings.outlets.backorderMode === "close_and_reconfirm";
  const [decline, setDecline] = useState<{ order: OutletOrder; productId: string; qty: number }>();
  const [revise, setRevise] = useState<{ order: OutletOrder; productId: string }>();

  const groups = useMemo(
    () =>
      db.products
        .map((p) => ({ p, queue: waitingQueue(db, p.id), avail: available(db, p.id, "outlet"), grns: db.grns.filter((g) => g.productId === p.id && g.status === "expected") }))
        .filter((g) => g.queue.length > 0),
    [db],
  );
  const shown = groups.filter((g) => !product || g.p.id === product);
  const totalUnits = groups.reduce((s, g) => s + g.queue.reduce((t, x) => t + x.line.backordered, 0), 0);

  return (
    <div className="animate-rise space-y-6">
      <PageHeader
        title="Back-orders"
        description={
          closeMode
            ? "Orders close at partial delivery. When stock arrives, ask the outlet to reconfirm the balance, then allocate it, oldest order first."
            : "Balances stay open and are served from new stock, oldest order first. Call the outlet before allocating, and record a lost sale if they no longer want it."
        }
        actions={
          <Button variant="outline" nativeButton={false} render={<Link to="/staff/lost-sales" />}>
            Lost sales
          </Button>
        }
      />

      {groups.length > 0 && (
        <FilterTabs
          value={product || "all"}
          onChange={(v) => {
            const next = new URLSearchParams(params);
            if (v === "all") next.delete("product");
            else next.set("product", v);
            setParams(next, { replace: true });
          }}
          options={[
            { value: "all", label: "All products", count: totalUnits },
            ...groups.map((g) => ({ value: g.p.id, label: `${g.p.id} ${g.p.name}`, count: g.queue.reduce((s, x) => s + x.line.backordered, 0) })),
          ]}
        />
      )}

      {shown.length === 0 ? (
        <EmptyState
          icon={<Hourglass className="size-5" />}
          title={product ? `Nothing is waiting for ${productOf(db, product)?.name ?? product}` : "No outlet is waiting for stock"}
          description="When an order can't be filled in full, the balance waits here until new stock arrives."
          action={
            product ? (
              <Button variant="outline" onClick={() => setParams({}, { replace: true })}>
                Show all products
              </Button>
            ) : undefined
          }
        />
      ) : (
        shown.map(({ p, queue, avail, grns }) => {
          const waiting = queue.reduce((s, x) => s + x.line.backordered, 0);
          let ahead = 0;
          return (
            <Panel
              key={p.id}
              title={
                <span className="flex items-center gap-3">
                  <ProductPack product={p} className="size-10" />
                  <span>
                    {p.name}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {p.id} · {num(waiting)} units waiting for {queue.length} order{queue.length === 1 ? "" : "s"}
                    </span>
                  </span>
                </span>
              }
              actions={
                <div className="text-right">
                  <div className={`font-display text-2xl font-semibold tabular ${avail ? "text-success" : "text-muted-foreground"}`}>{num(avail)}</div>
                  <div className="text-xs text-muted-foreground">available for outlets</div>
                </div>
              }
              bodyClassName="p-0"
            >
              {grns.length > 0 && avail === 0 && (
                <div className="flex items-center gap-2 border-b border-border/60 bg-info-soft/50 px-5 py-2.5 text-xs">
                  <PackageCheck className="size-4 text-info" />
                  {grns.map((g) => `${g.id}: ${num(g.qty)} arrived from production ${relative(g.ts, now)}, waiting for Stores to record it`).join(". ")}
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="border-b border-border/70 bg-muted/40 text-left text-xs text-muted-foreground">
                      <th className="px-5 py-2 font-medium">In line</th>
                      <th className="px-2 py-2 font-medium">Outlet</th>
                      <th className="px-2 py-2 font-medium">Order</th>
                      <th className="px-2 py-2 font-medium">Ordered</th>
                      <th className="px-2 py-2 text-right font-medium">Waiting</th>
                      <th className="px-2 py-2 text-right font-medium">Value</th>
                      <th className="px-2 py-2 font-medium">Expected</th>
                      <th className="px-5 py-2 text-right font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queue.map(({ order, line }, i) => {
                      const canTake = Math.max(0, Math.min(line.backordered, avail - ahead));
                      ahead += line.backordered;
                      return (
                        <tr key={order.id} className="border-b border-border/50 last:border-0">
                          <td className="px-5 py-3">
                            <StatusBadge tone={i === 0 ? "brand" : "neutral"}>{ordinal(i + 1)}</StatusBadge>
                          </td>
                          <td className="px-2 py-3">
                            <Link to={`/staff/outlets/${order.outletId}`} className="font-medium hover:text-primary">
                              {outletName(db, order.outletId)}
                            </Link>
                          </td>
                          <td className="px-2 py-3">
                            <Link to={`/staff/outlet-orders/${order.id}`} className="hover:text-primary">
                              {order.id}
                            </Link>
                            <span className="block text-xs text-muted-foreground">PO {order.poNumber}</span>
                            {order.onHold && (
                              <StatusBadge tone="warning" className="mt-1">
                                On Hold
                              </StatusBadge>
                            )}
                          </td>
                          <td className="px-2 py-3">
                            {date(order.createdAt)}
                            <span className="block text-xs text-muted-foreground">{relative(order.createdAt, now)}</span>
                          </td>
                          <td className="px-2 py-3 text-right">
                            <span className="font-semibold tabular">{num(line.backordered)}</span>
                            <span className="block text-xs text-muted-foreground">of {num(line.qty)}</span>
                          </td>
                          <td className="px-2 py-3 text-right tabular">{lkr(lineValue(line, line.backordered))}</td>
                          <td className="px-2 py-3">
                            {line.expectedDate ? dateShort(line.expectedDate) : <span className="text-muted-foreground">Not set</span>}
                            {canEdit && (
                              <Button variant="link" size="xs" className="ml-1 h-auto px-0" onClick={() => setRevise({ order, productId: p.id })}>
                                <CalendarClock /> Revise
                              </Button>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            {canEdit ? (
                              <div className="flex flex-col items-end gap-1">
                                <div className="flex justify-end gap-2">
                                  <Button
                                    size="sm"
                                    disabled={avail === 0 || !!order.onHold}
                                    title={order.onHold ? `On hold: ${order.onHold.reason}` : avail === 0 ? "No stock available for outlets yet" : undefined}
                                    onClick={() => act(actions.allocateBackorder(order.id, p.id), (n) => `${num(n)} × ${p.id} allocated to ${outletName(db, order.outletId)}. Stores can pick it now.`)}
                                  >
                                    <Check className="size-4" /> {closeMode ? "Reconfirmed, allocate" : "Allocate"}
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => setDecline({ order, productId: p.id, qty: line.backordered })}>
                                    <UserX className="size-4" /> Outlet declined
                                  </Button>
                                </div>
                                <span className="text-[0.7rem] text-muted-foreground">
                                  {order.onHold
                                    ? "Release the hold on the order first"
                                    : avail === 0
                                    ? closeMode
                                      ? "Ask the outlet to reconfirm when stock arrives"
                                      : "Waiting for stock"
                                    : canTake > 0
                                      ? `${closeMode ? "Ask the outlet to reconfirm. " : ""}Can take ${num(canTake)} now`
                                      : "Older orders come first"}
                                </span>
                              </div>
                            ) : (
                              <span className="block text-right text-xs text-muted-foreground">{canTake > 0 ? `Can take ${num(canTake)} now` : "Waiting"}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          );
        })
      )}

      <ReasonDialog
        open={!!decline}
        onOpenChange={(v) => !v && setDecline(undefined)}
        title="Record a lost sale"
        description={
          decline
            ? `${outletName(db, decline.order.outletId)} no longer wants the ${num(decline.qty)} × ${productOf(db, decline.productId)?.name} still due on PO ${decline.order.poNumber}. The balance leaves the waiting list and is recorded as a lost sale.`
            : undefined
        }
        confirmLabel="Record lost sale"
        destructive
        placeholder="For example: bought from another supplier while waiting"
        onConfirm={(reason) => (decline ? done(actions.declineBackorder(decline.order.id, decline.productId, reason), "Lost sale recorded") : false)}
      />
      {revise && <ReviseDateDialog open={!!revise} onOpenChange={(v) => !v && setRevise(undefined)} order={revise.order} productId={revise.productId} />}
    </div>
  );
}
