// S8 Outlet order page: the order lines in the workbook's columns, then what
// is allocated, on the road, delivered, waiting and lost per line; place in
// line; revised dates; New and On Hold; related documents and timeline.

import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { AlertTriangle, CalendarClock, CheckCircle2, FileText, Paperclip, PackagePlus, PauseCircle, PlayCircle, ReceiptText, Truck, XCircle } from "lucide-react";
import { useDb } from "@/domain/db";
import { actions } from "@/domain/actions";
import { orderTotals, orderValue, outstanding, pickableQty, queuePosition } from "@/domain/outlets";
import { dispatchStatusLabel, orderStatusLabel } from "@/domain/lists";
import { productOf } from "@/domain/stock";
import { addressLine, date, dateTime, lkr, num, round2 } from "@/domain/format";
import { isOrderOverdue, ordinal, releaseHold } from "@/domain/ext/outlets";
import { act, actorName, useCan, useNow } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { Guard, NotFound } from "../../guard";
import { KeyValue, PageHeader, Panel, ReasonDialog, Status, StatusBadge, Timeline } from "@/components/fc/ui";
import { ProductPack } from "@/components/fc/brand";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Db, OutletOrderLine } from "@/domain/types";
import { OrderStatusBadge, ReviseDateDialog, done, shownInvoiceStatus } from "./shared";

export function OutletOrderPage() {
  return (
    <Guard perms={["outletOrders.view"]}>
      <Page />
    </Guard>
  );
}

/** Money columns of the workbook's Order Lines sheet. */
function money(db: Db, l: OutletOrderLine) {
  const gross = round2(l.qty * l.unitPrice);
  const discount = round2(gross * (l.discountPct / 100));
  const rate = productOf(db, l.productId)?.taxRate ?? 0;
  const tax = round2((gross - discount) * (rate / 100));
  return { gross, discount, tax, net: round2(gross - discount + tax), rate };
}

function Page() {
  const { id } = useParams();
  const db = useDb();
  const now = useNow();
  const navigate = useNavigate();
  const canEdit = useCan("outletOrders.edit");
  const canPick = useCan("dispatch.outlet");
  const canInvoice = useCan("invoices.view");
  const [revise, setRevise] = useState<string>();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [holdOpen, setHoldOpen] = useState(false);
  const order = db.outletOrders.find((o) => o.id === id);
  usePageTitle(order ? `Order ${order.id}` : "Outlet order");
  if (!order) return <NotFound />;

  const outlet = db.outlets.find((o) => o.id === order.outletId);
  const address = outlet?.deliveryAddresses.find((a) => a.id === order.deliveryAddressId);
  const label = orderStatusLabel(db, order);
  const t = orderTotals(order);
  const overdue = isOrderOverdue(order, now);
  const dispatches = db.dispatches.filter((x) => x.channel === "outlet" && x.orderId === order.id);
  const invoices = db.invoices.filter((i) => i.orderId === order.id);
  const live = order.status !== "cancelled";
  const pickable = !live || order.onHold || order.draft ? 0 : order.lines.reduce((s, l) => s + pickableQty(db, order, l.productId), 0);
  const canCancel = canEdit && live && !order.lines.some((l) => l.dispatched > 0 || l.delivered > 0) && !dispatches.some((x) => x.status !== "delivered" && x.status !== "returned");
  const canHold = canEdit && live && !order.onHold && label !== "Completed";
  const showCancelled = order.lines.some((l) => l.cancelled > 0);
  const showDiff = order.lines.some((l) => l.difference > 0);
  const closeMode = db.settings.outlets.backorderMode === "close_and_reconfirm";
  const totals = order.lines.reduce(
    (s, l) => {
      const m = money(db, l);
      return { gross: s.gross + m.gross, discount: s.discount + m.discount, tax: s.tax + m.tax, net: s.net + m.net, sent: s.sent + l.dispatched + l.delivered + l.difference, out: s.out + outstanding(l) };
    },
    { gross: 0, discount: 0, tax: 0, net: 0, sent: 0, out: 0 },
  );

  return (
    <div className="animate-rise space-y-6">
      <PageHeader
        back={{ to: "/staff/outlet-orders", label: "Outlet orders" }}
        eyebrow={
          <Link to={`/staff/outlets/${order.outletId}`} className="hover:underline">
            {outlet?.name ?? order.outletId}
          </Link>
        }
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            {order.id}
            <OrderStatusBadge order={order} />
            {overdue && <StatusBadge tone="danger">Past required date</StatusBadge>}
          </span>
        }
        description={`PO ${order.poNumber} · entered ${date(order.createdAt)} by ${actorName(db, order.salespersonId)}${order.source === "upload" ? " from an uploaded file" : ""}`}
        actions={
          <>
            {canCancel && (
              <Button variant="destructive" onClick={() => setCancelOpen(true)}>
                <XCircle className="size-4" /> Cancel order
              </Button>
            )}
            {canHold && (
              <Button variant="outline" onClick={() => setHoldOpen(true)}>
                <PauseCircle className="size-4" /> Put on hold
              </Button>
            )}
            {canEdit && live && order.onHold && (
              <Button variant="outline" onClick={() => act(releaseHold(order.id), (m) => m)}>
                <PlayCircle className="size-4" /> Release hold
              </Button>
            )}
            {canEdit && live && order.draft && !order.onHold && (
              <Button onClick={() => done(actions.confirmOutletOrder(order.id), "Order confirmed and stock checked")}>
                <CheckCircle2 className="size-4" /> Confirm order
              </Button>
            )}
            {canPick && pickable > 0 && (
              <Button
                onClick={() => {
                  const x = act(actions.createOutletDispatch(order.id), (v) => `Pick list ${v} created`);
                  if (x) navigate(`/staff/dispatch/${x}`);
                }}
              >
                <PackagePlus className="size-4" /> Create pick list
              </Button>
            )}
          </>
        }
      />

      {order.status === "cancelled" && (
        <div className="rounded-2xl border border-destructive/20 bg-danger-soft px-4 py-3 text-sm">
          This order was cancelled. {order.events.filter((e) => e.text.startsWith("Order cancelled")).at(-1)?.text.replace("Order cancelled: ", "Reason: ")}
        </div>
      )}
      {live && order.draft && (
        <div className="rounded-2xl border border-border bg-muted/50 px-4 py-3 text-sm">
          <span className="font-medium">New, not yet confirmed.</span> No stock is set aside for this order. Confirm it to check stock and allocate, first in, first out from the time you confirm.
        </div>
      )}
      {live && order.onHold && (
        <div className="rounded-2xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm">
          <span className="font-medium">On hold:</span> {order.onHold.reason}.{" "}
          <span className="text-muted-foreground">
            Since {dateTime(order.onHold.ts)}, by {actorName(db, order.onHold.by)}. Nothing is picked or allocated until the hold is released.
          </span>
        </div>
      )}

      <div className="space-y-6">
        <Panel title="Order">
          <KeyValue
            cols={3}
            items={[
              ["Outlet", outlet ? <Link to={`/staff/outlets/${outlet.id}`} className="hover:text-primary">{outlet.name} ({outlet.id})</Link> : order.outletId],
              ["Status", label],
              ["PO number", order.poNumber],
              ["PO date", date(order.poDate)],
              ["Required by", <span className={cn(overdue && "text-destructive")}>{date(order.requiredDate)}{overdue ? " (past due)" : ""}</span>],
              ["Delivery method", order.deliveryMethod ?? "Own vehicle"],
              ["Deliver to", address ? <span>{address.label}<span className="block text-xs font-normal text-muted-foreground">{addressLine(address.address, address.city)}</span></span> : ""],
              ["Salesperson", actorName(db, order.salespersonId)],
              ["Payment terms", outlet?.paymentTerms],
              [
                "PO copy",
                order.hasPoPhoto ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Paperclip className="size-3.5" /> Photo of the PO on file
                  </span>
                ) : order.source === "upload" ? (
                  "Uploaded file"
                ) : (
                  "No copy attached"
                ),
              ],
              ["Order value", lkr(orderValue(order))],
              ["Notes", order.notes],
            ]}
          />
        </Panel>
        <Panel title="Order lines" bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-muted/50 text-right text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 text-left font-medium">Product</th>
                  <th className="px-2 py-2.5 font-medium">Qty Ordered</th>
                  <th className="px-2 py-2.5 font-medium">Unit Price</th>
                  <th className="px-2 py-2.5 font-medium">Gross Amount</th>
                  <th className="px-2 py-2.5 font-medium">Line Discount</th>
                  <th className="px-2 py-2.5 font-medium">Tax</th>
                  <th className="px-2 py-2.5 font-medium">Net Line Total</th>
                  <th className="px-2 py-2.5 font-medium">Qty Dispatched</th>
                  <th className="px-4 py-2.5 font-medium">Qty Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((l) => {
                  const p = productOf(db, l.productId);
                  const m = money(db, l);
                  return (
                    <tr key={l.productId} className="border-b border-border/50 align-top last:border-0">
                      <td className="px-4 py-3">
                        <div className="flex gap-3">
                          {p && <ProductPack product={p} className="size-9 shrink-0" />}
                          <div className="min-w-0">
                            <div className="font-medium">{p?.name ?? l.productId}</div>
                            <div className="text-xs text-muted-foreground">{l.productId}</div>
                            {l.notes && <div className="mt-1 text-xs italic text-muted-foreground">{l.notes}</div>}
                          </div>
                        </div>
                      </td>
                      <Num v={l.qty} strong />
                      <Money v={l.unitPrice} />
                      <Money v={m.gross} />
                      <Money v={m.discount} sub={l.discountPct ? `${l.discountPct}%` : undefined} />
                      <Money v={m.tax} sub={`${m.rate}%`} />
                      <Money v={m.net} strong />
                      <Num v={l.dispatched + l.delivered + l.difference} />
                      <Num v={outstanding(l)} tone="warning" last />
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border/70 bg-muted/30 font-medium">
                  <td className="px-4 py-2.5">Total</td>
                  <Num v={t.qty} strong />
                  <td />
                  <Money v={totals.gross} />
                  <Money v={totals.discount} />
                  <Money v={totals.tax} />
                  <Money v={totals.net} strong />
                  <Num v={totals.sent} />
                  <Num v={totals.out} tone="warning" last />
                </tr>
              </tfoot>
            </table>
          </div>
        </Panel>

        <Panel title="Stock and delivery" description="Qty Ordered = delivered + allocated + on the road + back-ordered + lost + difference + cancelled" bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-muted/50 text-right text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 text-left font-medium">Product</th>
                  <th className="px-2 py-2.5 font-medium">Ordered</th>
                  <th className="px-2 py-2.5 font-medium">Allocated</th>
                  <th className="px-2 py-2.5 font-medium">On the road</th>
                  <th className="px-2 py-2.5 font-medium">Delivered</th>
                  <th className="px-2 py-2.5 font-medium">Back-ordered</th>
                  <th className="px-2 py-2.5 font-medium">Lost</th>
                  {showDiff && <th className="px-2 py-2.5 font-medium">Difference</th>}
                  {showCancelled && <th className="px-2 py-2.5 font-medium">Cancelled</th>}
                  <th className="w-2" />
                </tr>
              </thead>
              <tbody>
                {order.lines.map((l) => {
                  const p = productOf(db, l.productId);
                  const pos = l.backordered > 0 && live ? queuePosition(db, order.id, l.productId) : 0;
                  return (
                    <tr key={l.productId} className="border-b border-border/50 align-top last:border-0">
                      <td className="px-4 py-3">
                        <div className="font-medium">{p?.name ?? l.productId}</div>
                        {l.backordered > 0 && live && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            <StatusBadge tone="warning">
                              {ordinal(pos)} in line for {l.productId}
                            </StatusBadge>
                            <span className="text-xs text-muted-foreground">Expected {l.expectedDate ? date(l.expectedDate) : "date not set"}</span>
                            {canEdit && (
                              <Button variant="link" size="xs" className="h-auto px-0" onClick={() => setRevise(l.productId)}>
                                <CalendarClock /> Revise date
                              </Button>
                            )}
                          </div>
                        )}
                        {l.lost > 0 && <div className="mt-1 text-xs text-destructive">Lost sale: {l.lostReason}</div>}
                      </td>
                      <Num v={l.qty} strong />
                      <Num v={l.allocated} />
                      <Num v={l.dispatched} />
                      <Num v={l.delivered} tone="success" />
                      <Num v={l.backordered} tone="warning" />
                      <Num v={l.lost} tone="danger" />
                      {showDiff && <Num v={l.difference} tone="danger" />}
                      {showCancelled && <Num v={l.cancelled} />}
                      <td />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {t.backordered > 0 && live && (
            <div className="flex items-start gap-2 border-t border-border/60 bg-warning-soft/40 px-4 py-3 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
              <span>
                {closeMode
                  ? "The balance closes with the delivery. When stock arrives, ask the outlet to reconfirm before allocating it."
                  : "The balance stays open and is served from new stock, oldest order first."}{" "}
                <Link to={`/staff/backorders?product=${order.lines.find((l) => l.backordered > 0)?.productId}`} className="font-medium text-primary hover:underline">
                  See the waiting list
                </Link>
              </span>
            </div>
          )}
        </Panel>

        <div className="grid gap-6 xl:grid-cols-3">
          <div className="min-w-0 xl:col-span-2">
          <Panel title="Dispatches and documents" bodyClassName="p-0">
            {dispatches.length ? (
              <ul className="divide-y divide-border/60">
                {dispatches.map((x) => {
                  const inv = invoices.find((i) => i.dispatchId === x.id);
                  return (
                    <li key={x.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                      <Truck className="size-4 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <Link to={`/staff/dispatch/${x.id}`} className="font-medium hover:text-primary">
                          {x.id}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {num(x.lines.reduce((s, l) => s + l.qty, 0))} units
                          {x.dispatchedAt ? ` · dispatched ${date(x.dispatchedAt)}` : ` · created ${date(x.createdAt)}`}
                          {x.vehicle && ` · ${x.vehicle}`}
                          {x.receivedBy && ` · received by ${x.receivedBy}`}
                          {x.failReason && ` · ${x.failReason}`}
                        </div>
                      </div>
                      <Status>{dispatchStatusLabel(x)}</Status>
                      {inv && (
                        <>
                          {canInvoice && (
                            <Button variant="outline" size="sm" nativeButton={false} render={<Link to={`/staff/invoices/${inv.id}`} />}>
                              <ReceiptText className="size-4" /> {inv.id}
                              <span className="ml-1 text-xs text-muted-foreground">{shownInvoiceStatus(db, inv, now)}</span>
                            </Button>
                          )}
                          <Button variant="outline" size="sm" nativeButton={false} render={<Link to={`/staff/delivery-notes/${inv.deliveryNoteId}`} />}>
                            <FileText className="size-4" /> {inv.deliveryNoteId}
                          </Button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-5 py-4 text-sm text-muted-foreground">
                {!live
                  ? "Nothing was dispatched."
                  : order.draft
                    ? "Nothing is allocated until the order is confirmed."
                    : order.onHold
                      ? "Nothing is picked while the order is on hold."
                      : pickable > 0
                        ? `${num(pickable)} allocated units are waiting for Stores to pick.`
                        : "Nothing is allocated yet. The order is waiting for stock."}
              </p>
            )}
          </Panel>
          </div>
          <div>
          <Panel title="Timeline">
            <Timeline events={order.events} nameOf={(x) => actorName(db, x)} />
          </Panel>
          </div>
        </div>
      </div>

      {revise && <ReviseDateDialog open={!!revise} onOpenChange={(v) => !v && setRevise(undefined)} order={order} productId={revise} />}
      <ReasonDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={`Cancel ${order.id}?`}
        description={`Allocated stock goes back to the outlet allocation and any back-orders leave the waiting list. PO ${order.poNumber} from ${outlet?.name}.`}
        confirmLabel="Cancel order"
        destructive
        placeholder="For example: the outlet cancelled the PO by phone"
        onConfirm={(reason) => done(actions.cancelOutletOrder(order.id, reason), "Order cancelled")}
      />
      <ReasonDialog
        open={holdOpen}
        onOpenChange={setHoldOpen}
        title={`Put ${order.id} on hold?`}
        description="Nothing is picked or allocated from new stock while the order is on hold. Stock already set aside stays set aside."
        confirmLabel="Put on hold"
        placeholder="For example: waiting for the outlet to settle overdue invoices"
        onConfirm={(reason) => done(actions.holdOutletOrder(order.id, reason), "Order put on hold")}
      />
    </div>
  );
}

function Num({ v, tone, strong, last }: { v: number; tone?: "success" | "warning" | "danger"; strong?: boolean; last?: boolean }) {
  return (
    <td
      className={cn(
        "py-3 text-right tabular",
        last ? "px-4" : "px-2",
        !v && "text-muted-foreground/60",
        v > 0 && tone === "success" && "text-success",
        v > 0 && tone === "warning" && "font-medium text-warning",
        v > 0 && tone === "danger" && "text-destructive",
        strong && "font-semibold",
      )}
    >
      {num(v)}
    </td>
  );
}

function Money({ v, strong, sub }: { v: number; strong?: boolean; sub?: string }) {
  return (
    <td className={cn("whitespace-nowrap px-2 py-3 text-right tabular", !v && "text-muted-foreground/60", strong && "font-semibold")}>
      {lkr(v, { prefix: false })}
      {sub && <div className="text-[0.7rem] font-normal text-muted-foreground">{sub}</div>}
    </td>
  );
}
