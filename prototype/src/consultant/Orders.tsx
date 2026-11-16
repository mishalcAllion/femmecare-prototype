// C5 Orders list and order page: payment and delivery tracks, payment attempts,
// courier and tracking with a "Track parcel" sheet, "I received it", cancel before
// dispatch (paid orders become a refund request), upload the slip again, receipt.

import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { CircleCheck, CreditCard, FileText, Landmark, MapPin, Package, PackageCheck, Printer, Truck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ProductPack, Logo } from "@/components/fc/brand";
import { EmptyState, FilterTabs, PageHeader, ReasonDialog, Status, Steps, Timeline } from "@/components/fc/ui";
import { useDb } from "@/domain/db";
import { actions } from "@/domain/actions";
import { canCancel, fullName } from "@/domain/consultants";
import { addMinutes, addressLine, consultantCode, date, dateShort, dateTime, lkr, round2 } from "@/domain/format";
import type { ConsultantOrder, Dispatch } from "@/domain/types";
import { act, actorName, useConsultant, useNow } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { cn } from "@/lib/utils";
import { Card, done, phone, itemCount, METHOD_LABEL, needsPayment, OrderChips, paymentLabel, SectionTitle } from "./bits";
import { AppNotFound } from "./Blocked";
import { SlipPreview } from "./Pay";

type Filter = "all" | "to_pay" | "in_progress" | "delivered" | "cancelled";

function bucket(o: ConsultantOrder): Filter {
  if (o.deliveryStatus === "cancelled") return "cancelled";
  if (o.deliveryStatus === "delivered") return "delivered";
  if (needsPayment(o) || o.paymentStatus === "proof_uploaded") return "to_pay";
  return "in_progress";
}

export function OrdersList() {
  usePageTitle("Orders");
  const c = useConsultant()!;
  const db = useDb();
  const [filter, setFilter] = useState<Filter>("all");
  const orders = useMemo(() => db.consultantOrders.filter((o) => o.consultantId === c.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [db, c.id]);
  const counts = (f: Filter) => orders.filter((o) => f === "all" || bucket(o) === f).length;
  const shown = orders.filter((o) => filter === "all" || bucket(o) === filter);
  const [limit, setLimit] = useState(20);
  return (
    <div>
      <PageHeader title="My orders" description={`${orders.length} order${orders.length === 1 ? "" : "s"} placed`} />
      <FilterTabs
        value={filter}
        onChange={(v) => {
          setFilter(v);
          setLimit(20);
        }}
        options={[
          { value: "all", label: "All", count: counts("all") },
          { value: "to_pay", label: "To pay", count: counts("to_pay") },
          { value: "in_progress", label: "In progress", count: counts("in_progress") },
          { value: "delivered", label: "Delivered", count: counts("delivered") },
          { value: "cancelled", label: "Cancelled", count: counts("cancelled") },
        ]}
      />
      <div className="mt-4 grid gap-2">
        {shown.slice(0, limit).map((o) => (
          <Link key={o.id} to={`/app/orders/${o.id}`} className="block rounded-2xl bg-card p-4 shadow-soft ring-1 ring-inset ring-border/60 transition hover:shadow-lift">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold">{o.id}</div>
                <div className="text-xs text-muted-foreground">
                  {dateTime(o.createdAt)} · {itemCount(o)} items · {METHOD_LABEL[o.paymentMethod]}
                </div>
              </div>
              <div className="shrink-0 text-right font-semibold tabular">{lkr(o.total)}</div>
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-2">
              <OrderChips o={o} />
              <div className="flex -space-x-2">
                {o.lines.slice(0, 3).map((l) => {
                  const p = db.products.find((x) => x.id === l.productId);
                  return p ? <ProductPack key={l.productId} product={p} className="size-8 rounded-lg bg-card ring-2 ring-card" /> : null;
                })}
              </div>
            </div>
          </Link>
        ))}
        {!shown.length && (
          <EmptyState
            icon={<Package className="size-5" />}
            title={filter === "all" ? "No orders yet" : "Nothing here"}
            description={filter === "all" ? "Your orders appear here once you place them." : "No orders in this group."}
            action={
              filter === "all" ? (
                <Button nativeButton={false} render={<Link to="/app/shop" />} className="rounded-full">
                  Go to the shop
                </Button>
              ) : undefined
            }
          />
        )}
        {shown.length > limit && (
          <Button variant="outline" className="mt-2 rounded-full" onClick={() => setLimit((n) => n + 20)}>
            Show more ({shown.length - limit} older)
          </Button>
        )}
      </div>
    </div>
  );
}

const PAY_STEPS = ["Order placed", "Payment", "Paid"];
const DELIVERY_STEPS = ["Placed", "Packed", "Dispatched", "Delivered"];

function paymentStep(o: ConsultantOrder) {
  switch (o.paymentStatus) {
    case "paid":
    case "refunded":
      return { current: 2, failed: false };
    case "proof_uploaded":
    case "cod_pending":
      return { current: 1, failed: false };
    case "failed":
    case "rejected":
      return { current: 1, failed: true };
    default:
      return { current: 0, failed: false };
  }
}

function deliveryStep(o: ConsultantOrder) {
  return { placed: 0, packed: 1, dispatched: 2, delivered: 3, cancelled: 0 }[o.deliveryStatus];
}

function nextStepText(o: ConsultantOrder, label: string): string | undefined {
  if (o.deliveryStatus === "cancelled") return undefined;
  if (o.refund?.status === "requested") return "FemmeCare is reviewing your refund request. We'll text you the outcome.";
  if (o.paymentStatus === "awaiting") return o.paymentMethod === "card" ? "Next: pay by card to confirm the order." : "Next: transfer the amount and upload your bank slip.";
  if (o.paymentStatus === "failed") return "The card payment didn't go through. No money was taken. Try again to confirm the order.";
  if (o.paymentStatus === "rejected") {
    const why = [...o.payments].reverse().find((p) => p.status === "rejected")?.rejectReason;
    return `Your bank slip wasn't accepted${why ? `: ${why}` : ""}. Upload it again to confirm the order.`;
  }
  if (o.paymentStatus === "proof_uploaded") return "Next: FemmeCare checks your slip, usually within one working day.";
  if (o.deliveryStatus === "placed") return `Next: we pack your order, usually the next working day. You can still cancel until it leaves the warehouse.`;
  if (o.deliveryStatus === "packed") return "Packed and waiting for the courier. We'll text you the tracking number.";
  if (o.deliveryStatus === "dispatched") return `On its way with the courier. Tap "I received it" once it arrives.`;
  void label;
  return undefined;
}

export function OrderPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const db = useDb();
  const c = useConsultant()!;
  const o = db.consultantOrders.find((x) => x.id === id && x.consultantId === c.id);
  usePageTitle(o ? `Order ${o.id}` : "Order");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [trackOpen, setTrackOpen] = useState(false);
  if (!o) return <AppNotFound />;
  const dispatch = db.dispatches.find((x) => x.id === o.dispatchId);
  const ps = paymentStep(o);
  const next = nextStepText(o, db.settings.labels.consultant);
  const paid = o.paymentStatus === "paid" || o.paymentStatus === "refunded";
  const cancellable = canCancel(o) && o.deliveryStatus !== "cancelled" && o.refund?.status !== "requested" && o.paymentStatus !== "refunded";
  const lastSlip = o.payments.filter((p) => p.method === "bank_transfer").slice(-1)[0];

  return (
    <div>
      <PageHeader title={o.id} description={`Placed ${dateTime(o.createdAt)}`} back={{ to: "/app/orders", label: "My orders" }} />

      {params.get("placed") && o.paymentMethod === "cod" && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-success-soft px-4 py-3 text-sm">
          <CircleCheck className="animate-pop size-5 text-success" /> Order placed. Pay {lkr(o.total)} to the courier on delivery.
        </div>
      )}

      {/* tracks */}
      <Card className="space-y-5">
        <div>
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">Payment</span>
            {(o.deliveryStatus !== "cancelled" || o.paymentStatus === "refunded") && <Status>{paymentLabel(o)}</Status>}
          </div>
          <Steps steps={o.paymentMethod === "bank_transfer" ? ["Order placed", "Slip sent", "Paid"] : o.paymentMethod === "cod" ? ["Order placed", "Pay on delivery", "Paid"] : PAY_STEPS} current={ps.current} failed={ps.failed} />
        </div>
        <div className="border-t border-border pt-4">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">Delivery</span>
            <Status>{o.deliveryStatus === "cancelled" ? "Cancelled" : DELIVERY_STEPS[deliveryStep(o)]}</Status>
          </div>
          {o.deliveryStatus === "cancelled" ? (
            <div className="flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2.5 text-sm">
              <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span>
                Cancelled{o.cancelReason ? `: ${o.cancelReason}` : ""}.{o.paymentStatus === "refunded" ? ` ${lkr(o.total)} is being refunded to your bank account.` : ""}
              </span>
            </div>
          ) : (
            <Steps steps={DELIVERY_STEPS} current={deliveryStep(o)} />
          )}
        </div>
        {next && <p className="rounded-xl bg-muted/60 px-3 py-2.5 text-sm text-muted-foreground">{next}</p>}
        {o.refund?.status === "approved" && o.deliveryStatus !== "cancelled" && <p className="rounded-xl bg-success-soft px-3 py-2.5 text-sm">Refund of {lkr(o.total)} approved. It reaches your bank within 5 working days.</p>}
        {o.refund?.status === "rejected" && <p className="rounded-xl bg-muted px-3 py-2.5 text-sm">Your refund request was not approved. Call FemmeCare on {db.settings.company.phone} if you have questions.</p>}

        {/* actions */}
        <div className="grid gap-2">
          {needsPayment(o) && (
            <Button nativeButton={false} render={<Link to={`/app/orders/${o.id}/pay`} />} className="h-11 rounded-full">
              {o.paymentMethod === "card" ? <CreditCard className="size-4" /> : <Landmark className="size-4" />}
              {o.paymentStatus === "rejected" ? "Upload the slip again" : o.paymentStatus === "failed" ? "Try the payment again" : o.paymentMethod === "card" ? `Pay ${lkr(o.total)} now` : "Pay and upload the slip"}
            </Button>
          )}
          {o.paymentStatus === "proof_uploaded" && (
            <Button variant="outline" nativeButton={false} render={<Link to={`/app/orders/${o.id}/pay`} />} className="h-11 rounded-full">
              View the slip I sent
            </Button>
          )}
          {o.deliveryStatus === "dispatched" && (
            <Button className="h-11 rounded-full" onClick={() => act(actions.markDelivered(o.id, "consultant"), "Thanks. Order marked as received")}>
              <PackageCheck className="size-4" /> I received it
            </Button>
          )}
          {dispatch?.trackingNo && (
            <Button variant="outline" className="h-11 rounded-full" onClick={() => setTrackOpen(true)}>
              <Truck className="size-4" /> Track parcel
            </Button>
          )}
          {paid && (
            <Button variant="ghost" nativeButton={false} render={<Link to={`/app/orders/${o.id}/receipt`} />} className="h-11 rounded-full">
              <FileText className="size-4" /> Receipt
            </Button>
          )}
          {cancellable && (
            <Button variant="ghost" className="h-11 rounded-full text-destructive hover:text-destructive" onClick={() => setCancelOpen(true)}>
              Cancel order
            </Button>
          )}
        </div>
      </Card>

      {/* courier */}
      {dispatch?.trackingNo && (
        <>
          <SectionTitle>Courier</SectionTitle>
          <Card className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-info-soft text-info">
              <Truck className="size-5" />
            </div>
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-semibold">{dispatch.courier}</div>
              <div className="font-mono text-xs text-muted-foreground">{dispatch.trackingNo}</div>
            </div>
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => setTrackOpen(true)}>
              Track
            </Button>
          </Card>
        </>
      )}

      {/* items */}
      <SectionTitle>Items</SectionTitle>
      <Card className="p-0">
        <ul className="divide-y divide-border">
          {o.lines.map((l) => {
            const p = db.products.find((x) => x.id === l.productId);
            return (
              <li key={l.productId} className="flex items-center gap-3 p-3">
                {p && <ProductPack product={p} className="size-12 shrink-0" />}
                <div className="min-w-0 flex-1 text-sm">
                  <div className="truncate font-medium">{p?.name ?? l.productId}</div>
                  <div className="text-xs text-muted-foreground tabular">
                    {l.qty} × {lkr(l.price)} <span className="whitespace-nowrap line-through">MRP {lkr(l.mrp)}</span>
                  </div>
                </div>
                <div className="text-sm font-semibold tabular">{lkr(round2(l.qty * l.price))}</div>
              </li>
            );
          })}
        </ul>
        <dl className="grid gap-1.5 border-t border-border p-3 text-sm">
          <Row k="Subtotal" v={lkr(o.subtotal)} />
          <Row k="Delivery" v={o.deliveryCharge ? lkr(o.deliveryCharge) : "Free"} />
          <Row k={<span className="font-semibold text-foreground">Total</span>} v={<span className="font-semibold">{lkr(o.total)}</span>} />
          <Row k={<span className="text-success">Your margin at MRP</span>} v={<span className="text-success">{lkr(round2(o.mrpValue - o.subtotal))}</span>} />
        </dl>
      </Card>

      {/* delivery */}
      <SectionTitle>Delivery address</SectionTitle>
      <Card className="flex gap-3 text-sm">
        <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
        <div>
          <div className="font-medium">{fullName(c)}</div>
          <div className="text-muted-foreground">{addressLine(o.address, o.city)}</div>
          <div className="text-muted-foreground">{phone(c.mobile)}</div>
        </div>
      </Card>

      {/* payments */}
      <SectionTitle>Payments</SectionTitle>
      {o.payments.length ? (
        <div className="grid gap-2">
          {[...o.payments].reverse().map((p) => (
            <Card key={p.id} className="text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium">
                    {METHOD_LABEL[p.method]} · {lkr(p.amount)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {dateTime(p.ts)} · Ref <span className="font-mono">{p.reference}</span>
                  </div>
                </div>
                <Status>{p.status === "success" ? "Paid" : p.status === "verified" ? "Verified" : p.status === "pending" ? "Waiting for verification" : p.status === "failed" ? "Declined" : "Not accepted"}</Status>
              </div>
              {p.rejectReason && <p className="mt-2 text-xs text-destructive">Reason: {p.rejectReason}</p>}
              {p.method === "bank_transfer" && p === lastSlip && p.proofImage && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-medium text-primary">Show slip</summary>
                  <SlipPreview image={p.proofImage} amount={p.amount} reference={p.reference} payer={fullName(c)} when={p.ts} className="mt-2" />
                </details>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <Card className="text-sm text-muted-foreground">{o.paymentMethod === "cod" ? "You pay the courier on delivery." : "No payment yet."}</Card>
      )}

      {/* history */}
      <SectionTitle>History</SectionTitle>
      <Card>
        <Timeline events={o.events} nameOf={(x) => (x === c.id ? "You" : x === "system" ? "FemmeCare" : actorName(db, x))} />
      </Card>

      <ReasonDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={paid ? "Cancel and ask for a refund?" : "Cancel this order?"}
        description={
          paid
            ? `This order is paid. FemmeCare will review the cancellation and refund ${lkr(o.total)} to your bank account once approved.`
            : "The order is cancelled straight away. Nothing has been charged."
        }
        confirmLabel={paid ? "Ask for a refund" : "Cancel order"}
        destructive
        placeholder="For example: ordered the wrong product"
        onConfirm={(reason) => done(actions.cancelConsultantOrder(o.id, reason), paid ? "Refund requested. We'll text you the outcome." : "Order cancelled")}
      />

      {dispatch && <TrackSheet open={trackOpen} onOpenChange={setTrackOpen} o={o} x={dispatch} />}
    </div>
  );
}

function Row({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="tabular">{v}</dd>
    </div>
  );
}

/** The courier's own tracking view, built from the dispatch time. */
function courierEvents(o: ConsultantOrder, x: Dispatch, now: string) {
  if (!x.dispatchedAt) return [];
  const hub = x.courier === "Koombiyo" ? "Koombiyo hub, Colombo 10" : x.courier === "Pronto Lanka" ? "Pronto Lanka hub, Peliyagoda" : "Domex hub, Colombo 14";
  const t0 = x.dispatchedAt;
  const steps = [
    { ts: t0, text: "Picked up from FemmeCare warehouse, Kurunegala" },
    { ts: addMinutes(t0, 150), text: `Arrived at ${hub}` },
    { ts: addMinutes(t0, 600), text: `Left ${hub.split(",")[0]} for ${o.city || "your area"}` },
    { ts: addMinutes(t0, 1080), text: `Arrived at the ${o.city || "local"} delivery centre` },
    { ts: addMinutes(t0, 1200), text: "Out for delivery with a rider" },
  ];
  const end = x.deliveredAt ?? now;
  const shown = steps.filter((s) => s.ts <= end);
  if (x.deliveredAt) shown.push({ ts: x.deliveredAt, text: "Delivered" });
  return shown.reverse();
}

function TrackSheet({ open, onOpenChange, o, x }: { open: boolean; onOpenChange: (v: boolean) => void; o: ConsultantOrder; x: Dispatch }) {
  const now = useNow();
  const events = courierEvents(o, x, now);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-h-[85svh] max-w-xl gap-0 overflow-y-auto rounded-t-3xl p-0">
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-border" />
        <SheetHeader className="px-5 pb-2 pt-3">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <Truck className="size-5 text-primary" /> {x.courier}
          </SheetTitle>
          <SheetDescription>
            Tracking number <span className="font-mono text-foreground">{x.trackingNo}</span>
          </SheetDescription>
        </SheetHeader>
        <div className="px-5 pb-8">
          <div className={cn("mb-4 rounded-2xl px-4 py-3", x.deliveredAt ? "bg-success-soft" : "bg-info-soft")}>
            <div className="text-xs text-muted-foreground">Status</div>
            <div className="font-semibold">{x.deliveredAt ? `Delivered ${dateTime(x.deliveredAt)}` : events[0]?.text ?? "Waiting for pick-up"}</div>
            {!x.deliveredAt && x.dispatchedAt && <div className="mt-0.5 text-xs text-muted-foreground">Expected by {date(addMinutes(x.dispatchedAt, 2 * 1440))}</div>}
          </div>
          <ol className="relative space-y-4 border-l border-border pl-5">
            {events.map((e, i) => (
              <li key={e.ts + e.text} className="relative">
                <span className={cn("absolute -left-[1.6rem] top-1 size-2.5 rounded-full ring-4 ring-popover", i === 0 ? "bg-primary" : "bg-muted-foreground/40")} />
                <div className={cn("text-sm", i === 0 && "font-medium")}>{e.text}</div>
                <div className="text-xs text-muted-foreground">{dateTime(e.ts)}</div>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-xs text-muted-foreground">Updates from {x.courier}. The courier also texts you on the day of delivery.</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------- receipt ----------

export function Receipt() {
  const { id } = useParams();
  const db = useDb();
  const c = useConsultant()!;
  const o = db.consultantOrders.find((x) => x.id === id && x.consultantId === c.id);
  usePageTitle(o ? `Receipt ${o.id}` : "Receipt");
  if (!o) return <AppNotFound />;
  const pay = [...o.payments].reverse().find((p) => p.status === "success" || p.status === "verified");
  const co = db.settings.company;
  if (!pay)
    return (
      <div>
        <PageHeader title="Receipt" back={{ to: `/app/orders/${o.id}`, label: o.id }} />
        <Card className="text-sm text-muted-foreground">A receipt is available once the order is paid.</Card>
      </div>
    );
  return (
    <div>
      <div className="no-print">
        <PageHeader
          title="Receipt"
          back={{ to: `/app/orders/${o.id}`, label: o.id }}
          actions={
            <Button variant="outline" className="rounded-full" onClick={() => window.print()}>
              <Printer className="size-4" /> Print or save as PDF
            </Button>
          }
        />
      </div>
      <div className="print-page overflow-x-auto rounded-2xl bg-white p-5 text-[0.82rem] text-neutral-800 shadow-soft ring-1 ring-border sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Logo />
            <div className="mt-2 text-xs text-neutral-500">
              {co.name}
              <br />
              {co.address}
              <br />
              {co.phone} · {co.email}
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold tracking-wide">PAYMENT RECEIPT</div>
            <div className="text-xs text-neutral-500">Receipt {pay.id}</div>
            <div className="text-xs text-neutral-500">{date(pay.decidedAt ?? pay.ts)}</div>
          </div>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-[0.68rem] uppercase tracking-wider text-neutral-500">Received from</div>
            <div className="font-medium">{fullName(c)}</div>
            <div className="text-neutral-600">
              {db.settings.labels.consultant} {consultantCode(c.number)}
            </div>
          </div>
          <div className="sm:text-right">
            <div className="text-[0.68rem] uppercase tracking-wider text-neutral-500">For order</div>
            <div className="font-medium">{o.id}</div>
            <div className="text-neutral-600">Placed {dateShort(o.createdAt)}</div>
          </div>
        </div>
        <table className="mt-6 w-full">
          <thead>
            <tr className="border-b border-neutral-300 text-left text-[0.7rem] uppercase tracking-wider text-neutral-500">
              <th className="py-2 font-medium">Item</th>
              <th className="py-2 text-right font-medium">Qty</th>
              <th className="py-2 text-right font-medium">Price</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {o.lines.map((l) => (
              <tr key={l.productId} className="border-b border-neutral-100">
                <td className="py-2">
                  {db.products.find((p) => p.id === l.productId)?.name} <span className="text-neutral-400">{l.productId}</span>
                </td>
                <td className="py-2 text-right tabular">{l.qty}</td>
                <td className="py-2 text-right tabular">{lkr(l.price, { prefix: false })}</td>
                <td className="py-2 text-right tabular">{lkr(round2(l.qty * l.price), { prefix: false })}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="pt-3 text-right text-neutral-500">
                Subtotal
              </td>
              <td className="pt-3 text-right tabular">{lkr(o.subtotal, { prefix: false })}</td>
            </tr>
            <tr>
              <td colSpan={3} className="text-right text-neutral-500">
                Delivery
              </td>
              <td className="text-right tabular">{lkr(o.deliveryCharge, { prefix: false })}</td>
            </tr>
            <tr className="text-base font-semibold">
              <td colSpan={3} className="pt-2 text-right">
                Total paid
              </td>
              <td className="pt-2 text-right tabular">{lkr(o.total)}</td>
            </tr>
          </tfoot>
        </table>
        <div className="mt-6 rounded-lg bg-neutral-50 p-3 text-xs text-neutral-600">
          Paid by {METHOD_LABEL[pay.method].toLowerCase()} on {dateTime(pay.ts)}, reference {pay.reference}.
          {o.paymentStatus === "refunded" && " This payment has since been refunded."}
        </div>
        <div className="mt-6 text-center text-[0.7rem] text-neutral-400">Thank you for being part of FemmeCare. This receipt was issued electronically and needs no signature.</div>
      </div>
    </div>
  );
}
