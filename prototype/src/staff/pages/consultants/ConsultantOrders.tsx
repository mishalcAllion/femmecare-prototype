// S31 Consultant orders: list with payment and delivery tabs, and the order page
// with both tracks, payment attempts and slips, timeline and Operations' actions.

import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { AlertTriangle, Ban, CreditCard, PackageCheck, PackageOpen, RotateCcw, ShieldCheck, ShoppingBag, Truck, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { EmptyState, FilterTabs, KeyValue, PageHeader, Panel, ReasonDialog, SimpleTable, Status, StatusBadge, Steps, Timeline, type Column } from "@/components/fc/ui";
import { BankSlipImage } from "@/components/fc/docs";
import { ProductPack } from "@/components/fc/brand";
import { useDb } from "@/domain/db";
import { actions } from "@/domain/actions";
import { canCancel, consultantById, fullName, DELIVERY_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "@/domain/consultants";
import { productOf } from "@/domain/stock";
import { addressLine, consultantCode, date, dateTime, lkr, relative } from "@/domain/format";
import type { ConsultantOrder, Db } from "@/domain/types";
import { refundEffect } from "@/domain/ext/finance";
import { act, actorName, useCan, useNow } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { cn } from "@/lib/utils";
import { Guard, NotFound } from "../../guard";
import { ConsultantCell, METHOD_LABEL, useLabel } from "./shared";

type Tab = "all" | "unpaid" | "slips" | "problem" | "to_pack" | "packed" | "dispatched" | "delivered" | "cancelled" | "refunds";

const packs = (o: ConsultantOrder) => o.lines.reduce((a, l) => a + l.qty, 0);

function inTab(o: ConsultantOrder, t: Tab) {
  switch (t) {
    case "unpaid":
      return (o.paymentStatus === "awaiting" || o.paymentStatus === "proof_uploaded") && o.deliveryStatus !== "cancelled";
    case "slips":
      return o.paymentStatus === "proof_uploaded" && o.deliveryStatus !== "cancelled";
    case "problem":
      return (o.paymentStatus === "failed" || o.paymentStatus === "rejected") && o.deliveryStatus !== "cancelled";
    case "to_pack":
      return (o.paymentStatus === "paid" || o.paymentStatus === "cod_pending") && o.deliveryStatus === "placed";
    case "packed":
      return o.deliveryStatus === "packed";
    case "dispatched":
      return o.deliveryStatus === "dispatched";
    case "delivered":
      return o.deliveryStatus === "delivered";
    case "cancelled":
      return o.deliveryStatus === "cancelled";
    case "refunds":
      return !!o.refund || o.paymentStatus === "refunded";
    default:
      return true;
  }
}

export function ConsultantOrdersPage() {
  return (
    <Guard perms={["consultantOrders.view"]}>
      <ConsultantOrdersList />
    </Guard>
  );
}

function ConsultantOrdersList() {
  const L = useLabel();
  usePageTitle(`${L.one} orders`);
  const db = useDb();
  const now = useNow();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("payment") === "problem" ? "problem" : ((params.get("tab") as Tab) ?? "all");
  const setTab = (t: Tab) => setParams(t === "all" ? {} : t === "problem" ? { payment: "problem" } : { tab: t }, { replace: true });
  const rows = useMemo(() => db.consultantOrders.filter((o) => inTab(o, tab)), [db, tab]);
  const count = (t: Tab) => db.consultantOrders.filter((o) => inTab(o, t)).length;
  const cols: Column<ConsultantOrder>[] = [
    { key: "id", header: "Order", cell: (o) => <span className="tabular">{o.id}</span>, value: (o) => o.id },
    {
      key: "who",
      header: L.one,
      cell: (o) => <ConsultantCell c={consultantById(db, o.consultantId)} />,
      value: (o) => {
        const c = consultantById(db, o.consultantId);
        return c ? `${fullName(c)} ${consultantCode(c.number)}` : "";
      },
    },
    { key: "placed", header: "Placed", cell: (o) => <span title={dateTime(o.createdAt)}>{relative(o.createdAt, now)}</span>, value: (o) => o.createdAt },
    { key: "packs", header: "Packs", align: "right", className: "whitespace-nowrap", cell: (o) => packs(o), value: (o) => packs(o), hideOnMobile: true },
    { key: "total", header: "Total", align: "right", className: "whitespace-nowrap", cell: (o) => lkr(o.total), value: (o) => o.total },
    { key: "method", header: "Paid by", cell: (o) => METHOD_LABEL[o.paymentMethod], value: (o) => METHOD_LABEL[o.paymentMethod], hideOnMobile: true },
    {
      key: "pay",
      header: "Payment",
      cell: (o) => (
        <span className="inline-flex items-center gap-1.5">
          <Status>{PAYMENT_STATUS_LABEL[o.paymentStatus]}</Status>
          {o.payments.some((p) => p.status === "pending" && p.duplicateOf) && <AlertTriangle className="size-4 text-warning" aria-label="Possible duplicate" />}
        </span>
      ),
      value: (o) => PAYMENT_STATUS_LABEL[o.paymentStatus],
    },
    {
      key: "del",
      header: "Delivery",
      cell: (o) => (
        <span className="inline-flex items-center gap-1.5">
          <Status>{DELIVERY_STATUS_LABEL[o.deliveryStatus]}</Status>
          {o.refund?.status === "requested" && <StatusBadge tone="warning">Refund requested</StatusBadge>}
        </span>
      ),
      value: (o) => DELIVERY_STATUS_LABEL[o.deliveryStatus],
    },
  ];
  const opts: { value: Tab; label: string }[] = [
    { value: "all", label: "All" },
    { value: "unpaid", label: "Awaiting payment" },
    { value: "slips", label: "Slip uploaded, to verify" },
    { value: "problem", label: "Failed or rejected" },
    { value: "to_pack", label: "Paid, to pack" },
    { value: "packed", label: "Packed" },
    { value: "dispatched", label: "Dispatched" },
    { value: "delivered", label: "Delivered" },
    { value: "cancelled", label: "Cancelled" },
    { value: "refunds", label: "Refunds" },
  ];
  return (
    <div className="animate-rise">
      <PageHeader title={`${L.one} orders`} description={`Orders placed by ${L.lowerMany} in the app. Each has a payment track and a delivery track.`} />
      <div className="mb-3">
        <FilterTabs value={tab} onChange={setTab} options={opts.map((o) => ({ ...o, count: count(o.value) }))} />
      </div>
      <SimpleTable
        rows={rows}
        columns={cols}
        rowKey={(o) => o.id}
        rowHref={(o) => `/staff/consultant-orders/${o.id}`}
        onRowClick={(o) => nav(`/staff/consultant-orders/${o.id}`)}
        exportName={`${L.lower}-orders-${tab}`}
        empty={
          <EmptyState
            icon={<ShoppingBag className="size-5" />}
            title={tab === "problem" ? "No failed or rejected payments" : "No orders here"}
            description={tab === "problem" ? `When a card is declined or a slip is rejected, the order waits here until the ${L.lower} pays again.` : undefined}
          />
        }
      />
    </div>
  );
}

// ---------- order page ----------

function paymentTrack(o: ConsultantOrder): { steps: string[]; current: number; failed: boolean } {
  const steps = o.paymentMethod === "bank_transfer" ? ["Awaiting payment", "Slip uploaded", "Paid"] : o.paymentMethod === "cod" ? ["Pay on delivery", "Paid"] : ["Awaiting payment", "Paid"];
  const paidIdx = steps.length - 1;
  if (o.paymentStatus === "refunded") return { steps: [...steps, "Refunded"], current: steps.length, failed: false };
  if (o.paymentStatus === "paid") return { steps, current: paidIdx, failed: false };
  if (o.paymentStatus === "proof_uploaded") return { steps, current: 1, failed: false };
  if (o.paymentStatus === "rejected") return { steps: ["Awaiting payment", "Slip rejected", "Paid"], current: 1, failed: true };
  if (o.paymentStatus === "failed") return { steps: ["Awaiting payment", "Card declined", "Paid"], current: 1, failed: true };
  return { steps, current: 0, failed: false };
}

function deliveryTrack(o: ConsultantOrder) {
  const steps = ["Placed", "Packed", "Dispatched", "Delivered"];
  const idx = { placed: 0, packed: 1, dispatched: 2, delivered: 3, cancelled: 0 }[o.deliveryStatus];
  return { steps: o.deliveryStatus === "cancelled" ? ["Placed", "Cancelled"] : steps, current: o.deliveryStatus === "cancelled" ? 1 : idx, failed: o.deliveryStatus === "cancelled" };
}

export function ConsultantOrderPage() {
  return (
    <Guard perms={["consultantOrders.view"]}>
      <ConsultantOrderDetail />
    </Guard>
  );
}

function ConsultantOrderDetail() {
  const { id } = useParams();
  const db = useDb();
  const nav = useNavigate();
  const L = useLabel();
  const o = db.consultantOrders.find((x) => x.id === id);
  usePageTitle(o ? `Order ${o.id}` : "Order");
  const canManage = useCan("consultantOrders.manage");
  const canPick = useCan("dispatch.consultant");
  const canVerify = useCan("payments.verify");
  const canRequestRefund = useCan("refunds.request");
  const canApproveRefund = useCan("refunds.approve");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState<"cancel" | "delivered">();
  const [restock, setRestock] = useState(false);
  if (!o) return <NotFound />;
  const c = consultantById(db, o.consultantId);
  const sponsor = consultantById(db, c?.sponsorId);
  const pay = paymentTrack(o);
  const del = deliveryTrack(o);
  const dispatch = db.dispatches.find((x) => x.id === o.dispatchId);
  const unpaid = ["awaiting", "failed", "rejected", "proof_uploaded"].includes(o.paymentStatus);
  const paid = o.paymentStatus === "paid";
  const openRefund = o.refund?.status === "requested";
  const canCreatePick = canPick && (paid || o.paymentStatus === "cod_pending") && o.deliveryStatus === "placed" && !o.dispatchId && !openRefund;

  const createPick = () => {
    const r = actions.createConsultantDispatch(o.id);
    const dId = act(r, "Pick list created");
    if (r.ok && dId) nav(`/staff/dispatch/${dId}`);
  };

  return (
    <div className="animate-rise">
      <PageHeader
        back={{ to: "/staff/consultant-orders", label: `${L.one} orders` }}
        eyebrow={`Placed ${dateTime(o.createdAt)}`}
        title={`Order ${o.id}`}
        description={c ? `${fullName(c)} · ${consultantCode(c.number)} · ${METHOD_LABEL[o.paymentMethod]}` : undefined}
        actions={
          <>
            {canCreatePick && (
              <Button onClick={createPick}>
                <PackageOpen className="size-4" /> Create pick list
              </Button>
            )}
            {dispatch && (
              <Button variant="outline" render={<Link to={`/staff/dispatch/${dispatch.id}`} />}>
                <Truck className="size-4" /> {dispatch.id}
              </Button>
            )}
            {canVerify && o.paymentStatus === "proof_uploaded" && (
              <Button variant="outline" render={<Link to="/staff/payments" />}>
                <ShieldCheck className="size-4" /> Verify payment
              </Button>
            )}
            {canManage && o.deliveryStatus === "dispatched" && (
              <Button variant="outline" onClick={() => act(actions.markDelivered(o.id, "staff"), "Marked delivered")}>
                <PackageCheck className="size-4" /> Mark delivered
              </Button>
            )}
            {canManage && unpaid && canCancel(o) && (
              <Button variant="destructive" onClick={() => setCancelOpen(true)}>
                <Ban className="size-4" /> Cancel order
              </Button>
            )}
            {canRequestRefund && paid && canCancel(o) && !o.refund && (
              <Button variant="destructive" onClick={() => setRefundOpen("cancel")}>
                <RotateCcw className="size-4" /> Cancel and refund
              </Button>
            )}
            {canRequestRefund && paid && o.deliveryStatus === "delivered" && !o.refund && (
              <Button variant="outline" onClick={() => setRefundOpen("delivered")}>
                <Undo2 className="size-4" /> Refund
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <Panel title="Payment" actions={<Status>{PAYMENT_STATUS_LABEL[o.paymentStatus]}</Status>}>
              <Steps steps={pay.steps} current={pay.current} failed={pay.failed} />
              <p className="mt-4 text-sm text-muted-foreground">
                {o.paymentStatus === "paid" && `Paid ${dateTime(o.paidAt)}. Stock ${o.stockReserved ? "is reserved" : o.deliveryStatus === "placed" ? "could not be reserved yet" : "has been issued"}.`}
                {o.paymentStatus === "awaiting" && `Waiting for the ${L.lower} to pay ${lkr(o.total)}.`}
                {o.paymentStatus === "proof_uploaded" && "A bank slip is waiting for Operations to verify."}
                {o.paymentStatus === "failed" && `The card was declined. The ${L.lower} can try again from the app.`}
                {o.paymentStatus === "rejected" && `The slip was not accepted. The ${L.lower} was asked to upload it again.`}
                {o.paymentStatus === "cod_pending" && "Paid in cash when the courier delivers."}
                {o.paymentStatus === "refunded" && `${lkr(o.total)} refunded.`}
              </p>
            </Panel>
            <Panel title="Delivery" actions={<Status>{DELIVERY_STATUS_LABEL[o.deliveryStatus]}</Status>}>
              <Steps steps={del.steps} current={del.current} failed={del.failed} />
              <p className="mt-4 text-sm text-muted-foreground">
                {dispatch?.trackingNo ? (
                  <>
                    {dispatch.courier}, tracking <span className="tabular font-medium text-foreground">{dispatch.trackingNo}</span>
                    {dispatch.dispatchedAt && `, handed over ${date(dispatch.dispatchedAt)}`}
                    {dispatch.deliveredAt && `, delivered ${date(dispatch.deliveredAt)}`}
                  </>
                ) : o.deliveryStatus === "cancelled" ? (
                  `Cancelled${o.cancelReason ? `: ${o.cancelReason}` : ""}`
                ) : (
                  `To ${addressLine(o.address, o.city)}`
                )}
              </p>
            </Panel>
          </div>

          {o.refund && <RefundPanel db={db} o={o} canApprove={canApproveRefund} />}

          <Panel title="Items" bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/70 bg-muted/50 text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Product</th>
                    <th className="px-4 py-2.5 text-right font-medium">Qty</th>
                    <th className="px-4 py-2.5 text-right font-medium">MRP</th>
                    <th className="px-4 py-2.5 text-right font-medium">{L.one} price</th>
                    <th className="px-4 py-2.5 text-right font-medium">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {o.lines.map((l) => {
                    const p = productOf(db, l.productId);
                    return (
                      <tr key={l.productId} className="border-b border-border/50">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-3">
                            {p && <ProductPack product={p} className="size-10" />}
                            <div>
                              <div className="font-medium">{p?.name ?? l.productId}</div>
                              <div className="text-xs text-muted-foreground">{l.productId}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular">{l.qty}</td>
                        <td className="px-4 py-2.5 text-right tabular">{lkr(l.mrp)}</td>
                        <td className="px-4 py-2.5 text-right tabular">{lkr(l.price)}</td>
                        <td className="px-4 py-2.5 text-right tabular">{lkr(l.qty * l.price)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="text-sm">
                  <tr>
                    <td colSpan={4} className="px-4 pt-3 text-right text-muted-foreground">
                      Subtotal
                    </td>
                    <td className="px-4 pt-3 text-right tabular">{lkr(o.subtotal)}</td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="px-4 pt-1 text-right text-muted-foreground">
                      Delivery
                    </td>
                    <td className="px-4 pt-1 text-right tabular">{o.deliveryCharge ? lkr(o.deliveryCharge) : "Free"}</td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="px-4 pb-3 pt-1 text-right font-semibold">
                      Total
                    </td>
                    <td className="px-4 pb-3 pt-1 text-right font-semibold tabular">{lkr(o.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="border-t border-border/60 px-4 py-3 text-xs text-muted-foreground">
              MRP value {lkr(o.mrpValue)}. Her margin when she sells at MRP: {lkr(o.mrpValue - o.subtotal)}. Delivery is not counted for commission.
            </div>
          </Panel>

          <Panel title="Payment attempts" description={o.payments.length ? undefined : "No payment has been made yet"}>
            {o.payments.length ? (
              <div className="space-y-4">
                {[...o.payments].reverse().map((p) => (
                  <div key={p.id} className="grid gap-4 rounded-xl border border-border/70 p-4 md:grid-cols-[220px_minmax(0,1fr)]">
                    {p.proofImage ? (
                      <BankSlipImage variant={p.proofImage} amount={p.amount} reference={p.reference} payer={c ? fullName(c) : ""} when={p.ts} />
                    ) : (
                      <div className="flex h-24 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                        <CreditCard className="size-8" />
                      </div>
                    )}
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium tabular">{p.id}</span>
                        <Status>{{ success: "Paid", failed: "Failed", pending: "Waiting for verification", verified: "Verified", rejected: "Rejected" }[p.status]}</Status>
                      </div>
                      <KeyValue
                        items={[
                          ["Method", METHOD_LABEL[p.method]],
                          ["Amount", <span className={cn("tabular", p.amount < o.total && p.method === "bank_transfer" && "text-destructive")}>{lkr(p.amount)}</span>],
                          ["Reference", <span className="tabular">{p.reference}</span>],
                          ["When", dateTime(p.ts)],
                        ]}
                      />
                      {p.duplicateOf && (
                        <p className="flex items-center gap-1.5 text-sm text-warning">
                          <AlertTriangle className="size-4" /> Same reference as order{" "}
                          <Link className="font-medium underline" to={`/staff/consultant-orders/${p.duplicateOf}`}>
                            {p.duplicateOf}
                          </Link>
                        </p>
                      )}
                      {p.decidedBy && (
                        <p className="text-xs text-muted-foreground">
                          {p.status === "verified" ? "Verified" : "Rejected"} by {actorName(db, p.decidedBy)} {dateTime(p.decidedAt)}
                          {p.rejectReason && `: ${p.rejectReason}`}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing yet.</p>
            )}
          </Panel>
        </div>
        <div className="space-y-5">
          <Panel title={L.one}>
            <ConsultantCell c={c} />
            <div className="mt-4">
              <KeyValue
                cols={1}
                items={[
                  ["Deliver to", addressLine(o.address, o.city)],
                  ["Mobile", c?.mobile],
                  ["Sponsor (earns commission on this order)", sponsor ? `${fullName(sponsor)} (${consultantCode(sponsor.number)})` : "None"],
                ]}
              />
            </div>
          </Panel>
          <Panel title="Timeline">
            <Timeline events={o.events} nameOf={(x) => actorName(db, x)} />
          </Panel>
        </div>
      </div>

      <ReasonDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={`Cancel order ${o.id}`}
        description={`Nothing has been paid, so it is cancelled at once${o.stockReserved ? " and the reserved stock is released" : ""}. The ${L.lower} sees the reason in the app.`}
        confirmLabel="Cancel order"
        destructive
        placeholder="For example: the consultant asked to cancel by phone"
        onConfirm={(reason) => {
          const r = actions.cancelConsultantOrder(o.id, reason);
          act(r, "Order cancelled");
          return r.ok;
        }}
      />
      <ReasonDialog
        open={!!refundOpen}
        onOpenChange={(v) => !v && setRefundOpen(undefined)}
        title={refundOpen === "cancel" ? `Cancel and refund ${o.id}` : `Refund ${o.id}`}
        description={
          refundOpen === "cancel"
            ? `The order is paid, so cancelling needs a refund of ${lkr(o.total)}. Finance approves it; until then the order is held and not packed.`
            : `The order was delivered. Finance approves a refund of ${lkr(o.total)}.`
        }
        confirmLabel="Ask Finance to approve"
        placeholder={refundOpen === "cancel" ? "For example: ordered the wrong pack size" : "For example: 4 packs water-damaged in transit"}
        onConfirm={(reason) => {
          const r = refundOpen === "cancel" ? actions.cancelConsultantOrder(o.id, reason) : actions.requestRefund(o.id, reason, restock);
          act(r, "Refund sent to Finance for approval");
          if (r.ok) setRestock(false);
          return r.ok;
        }}
      >
        {refundOpen === "delivered" && (
          <div className="grid gap-2">
            <Label>The goods</Label>
            {(
              [
                [true, "Came back in good condition: return them to stock"],
                [false, "Damaged or not returned: do not return to stock"],
              ] as const
            ).map(([v, text]) => (
              <label key={String(v)} className={cn("flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm", restock === v ? "border-primary bg-brand-soft" : "border-border")}>
                <input type="radio" name="restock" checked={restock === v} onChange={() => setRestock(v)} className="accent-[var(--primary)]" />
                {text}
              </label>
            ))}
          </div>
        )}
      </ReasonDialog>
    </div>
  );
}

function RefundPanel({ db, o, canApprove }: { db: Db; o: ConsultantOrder; canApprove: boolean }) {
  const r = o.refund!;
  const eff = refundEffect(db, o);
  return (
    <Panel
      title={r.status === "requested" ? "Refund waiting for Finance" : r.status === "approved" ? "Refund approved" : "Refund not approved"}
      actions={
        r.status === "requested" && canApprove ? (
          <Button size="sm" render={<Link to="/staff/refunds" />}>
            Review refund
          </Button>
        ) : (
          <Status>{r.status === "requested" ? "Requested" : r.status === "approved" ? "Approved" : "Rejected"}</Status>
        )
      }
      className={cn(r.status === "requested" && "ring-1 ring-warning/40")}
    >
      <KeyValue
        items={[
          ["Reason", r.reason],
          ["Asked by", `${actorName(db, r.requestedBy)}, ${dateTime(r.requestedAt)}`],
          ["Stock", eff.stock],
          ["Commission", eff.commission],
          ...(r.decidedBy ? ([["Decided by", `${actorName(db, r.decidedBy)}, ${dateTime(r.decidedAt)}`]] as [string, string][]) : []),
        ]}
      />
    </Panel>
  );
}
