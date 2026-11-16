// S15, S16, S18 Dispatch page: FEFO pick list, pack by scan, then the
// invoice and delivery note and vehicle (outlets) or the courier handover
// (consultants), with a timeline.

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { AlertTriangle, CheckCircle2, ClipboardCheck, FileText, PackageCheck, ReceiptText, ScanBarcode, Truck, Undo2, XCircle } from "lucide-react";
import { useDb } from "@/domain/db";
import { actions } from "@/domain/actions";
import { batchOf, productOf, productName, CHANNEL_LABEL } from "@/domain/stock";
import { DELIVERY_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "@/domain/consultants";
import { date, dateTime, daysBetween, lkr, num, plural } from "@/domain/format";
import { scanMany } from "@/domain/ext/outlets";
import { act, actorName, useCan, useNow } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { Guard, NotFound } from "../../guard";
import { KeyValue, PageHeader, Panel, ProgressBar, ReasonDialog, Status, StatusBadge, Steps, Timeline } from "@/components/fc/ui";
import { dispatchStatusLabel } from "@/domain/lists";
import { NativeSelect, SignedNoteImage } from "@/components/fc/docs";
import { ProductPack } from "@/components/fc/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Dispatch } from "@/domain/types";
import { DISPATCH_LABEL, DISPATCH_STEPS, beep, partyOf, scannedUnits, units } from "./shared";

export function DispatchPage() {
  return (
    <Guard perms={["dispatch.view"]}>
      <Page />
    </Guard>
  );
}

function Page() {
  const { id } = useParams();
  const db = useDb();
  const x = db.dispatches.find((d) => d.id === id);
  usePageTitle(x ? `Dispatch ${x.id}` : "Dispatch");
  if (!x) return <NotFound />;
  return <DispatchView x={x} />;
}

function DispatchView({ x }: { x: Dispatch }) {
  const db = useDb();
  const now = useNow();
  const canPack = useCan(x.channel === "outlet" ? "dispatch.outlet" : "dispatch.consultant");
  const canPod = useCan("pod.confirm");
  const canInvoice = useCan("invoices.view");
  const canFail = canPack || (x.channel === "outlet" && canPod);
  const [failOpen, setFailOpen] = useState(false);
  const party = partyOf(db, x);
  const problem = x.status === "failed" || x.status === "returned";
  const step = problem ? 3 : DISPATCH_STEPS.findIndex((s) => s.key === x.status);
  const inv = db.invoices.find((i) => i.id === x.invoiceId);
  const label = db.settings.labels.consultant;
  const total = units(x);
  const packing = x.status === "to_pick" || x.status === "packing";

  return (
    <div className="animate-rise space-y-6">
      <PageHeader
        back={{ to: "/staff/dispatch", label: "Dispatch" }}
        eyebrow={x.channel === "outlet" ? CHANNEL_LABEL.outlet : `${label}s`}
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            {x.id}
            <Status>{dispatchStatusLabel(x)}</Status>
            {dispatchStatusLabel(x) === "Prepared" && <StatusBadge tone="neutral" dot={false}>{DISPATCH_LABEL[x.status]}</StatusBadge>}
            {x.status === "dispatched" && x.channel === "outlet" && <StatusBadge tone="warning">Waiting for signed note</StatusBadge>}
          </span>
        }
        description={
          <>
            {plural(total, "unit")} for{" "}
            {party.partyHref ? (
              <Link to={party.partyHref} className="font-medium text-foreground hover:text-primary">
                {party.name}
              </Link>
            ) : (
              party.name
            )}{" "}
            · order{" "}
            <Link to={party.orderHref} className="font-medium text-foreground hover:text-primary">
              {x.orderId}
            </Link>
          </>
        }
        actions={
          <>
            {x.status === "dispatched" && canFail && (
              <Button variant="destructive" onClick={() => setFailOpen(true)}>
                <AlertTriangle className="size-4" /> Delivery failed
              </Button>
            )}
            {x.status === "failed" && canPack && (
              <Button onClick={() => act(actions.returnToStock(x.id), "Back in stock and ready to send again")}>
                <Undo2 className="size-4" /> Returned to stock
              </Button>
            )}
          </>
        }
      />

      <Panel bodyClassName="px-5 py-4">
        <Steps steps={DISPATCH_STEPS.map((s, i) => (problem && i === 3 ? dispatchStatusLabel(x) : s.label))} current={step} failed={problem} />
      </Panel>

      {problem && (
        <div className={`rounded-2xl border px-4 py-3 text-sm ${x.status === "failed" ? "border-destructive/20 bg-danger-soft" : "border-border bg-muted/50"}`}>
          {x.status === "failed" ? (
            <>
              <span className="font-medium">Delivery failed:</span> {x.failReason}. When the goods are back in the warehouse, record them as returned to stock so the order can be sent again.
            </>
          ) : (
            <>
              <span className="font-medium">Returned to stock.</span> {x.failReason ? `${x.failReason}. ` : ""}The goods are back in the {x.channel === "outlet" ? "outlet" : label.toLowerCase()} allocation and the order is waiting to be picked again.
              {inv && inv.status === "issued" && (
                <>
                  {" "}
                  Invoice{" "}
                  {canInvoice ? (
                    <Link to={`/staff/invoices/${inv.id}`} className="font-medium text-primary hover:underline">
                      {inv.id}
                    </Link>
                  ) : (
                    <span className="font-medium">{inv.id}</span>
                  )}{" "}
                  for this delivery is still open; Finance can cancel it.
                </>
              )}
            </>
          )}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          {packing && canPack && <PackByScan x={x} />}
          <PickList x={x} now={now} />
          {x.channel === "outlet" ? <OutletSteps x={x} /> : <CourierSteps x={x} />}
        </div>
        <div className="space-y-6">
          <Panel title="Delivery">
            <KeyValue
              cols={1}
              items={[
                ["Deliver to", <span>{party.name}<span className="block text-xs font-normal text-muted-foreground">{party.address}</span></span>],
                ["Phone", party.phone],
                ["Pick list created", dateTime(x.createdAt)],
                ...(x.channel === "consultant"
                  ? (() => {
                      const o = db.consultantOrders.find((y) => y.id === x.orderId);
                      return o
                        ? ([
                            ["Payment", `${PAYMENT_STATUS_LABEL[o.paymentStatus]}, ${lkr(o.total)}`],
                            ["Order status", DELIVERY_STATUS_LABEL[o.deliveryStatus]],
                          ] as [string, string][])
                        : [];
                    })()
                  : []),
                ...(x.vehicle ? ([["Vehicle and driver", `${x.vehicle}, ${x.driver}`]] as [string, string][]) : []),
                ...(x.courier ? ([["Courier", `${x.courier}, tracking ${x.trackingNo}`]] as [string, string][]) : []),
                ...(x.dispatchedAt ? ([["Dispatched", dateTime(x.dispatchedAt)]] as [string, string][]) : []),
                ...(x.deliveredAt ? ([["Delivered", dateTime(x.deliveredAt)]] as [string, string][]) : []),
                ...(x.receivedBy ? ([["Received by", x.receivedBy]] as [string, string][]) : []),
                ...(x.failReason ? ([["Failed delivery", x.failReason]] as [string, string][]) : []),
                ...(x.notes ? ([["Notes", x.notes]] as [string, string][]) : []),
              ]}
            />
          </Panel>
          <Panel title="Timeline">
            <Timeline events={x.events} nameOf={(i) => actorName(db, i)} />
          </Panel>
        </div>
      </div>
      <ReasonDialog
        open={failOpen}
        onOpenChange={setFailOpen}
        title="Record a failed delivery"
        description={`${x.id} to ${party.name} could not be delivered. The goods stay with the ${x.channel === "outlet" ? "driver" : "courier"} until they are returned to the warehouse.`}
        confirmLabel="Delivery failed"
        destructive
        placeholder="For example: outlet closed, nobody to receive it"
        onConfirm={(reason) => {
          const r = actions.failDelivery(x.id, reason);
          act(r, "Delivery recorded as failed");
          return r.ok;
        }}
      />
    </div>
  );
}

// ---------- pick list ----------

function PickList({ x, now }: { x: Dispatch; now: string }) {
  const db = useDb();
  const warnDays = db.settings.stock.expiryWarnDays;
  const firstBatch = new Map<string, string>();
  for (const l of x.lines) if (!firstBatch.has(l.productId)) firstBatch.set(l.productId, l.batchId);
  const total = units(x);
  const scanned = scannedUnits(x);
  return (
    <Panel
      title="Pick list"
      description="Take each line from the batch shown. Batches are listed earliest expiry first."
      actions={<span className="text-sm tabular text-muted-foreground">{num(scanned)} of {num(total)} packed</span>}
      bodyClassName="p-0"
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b border-border/70 bg-muted/50 text-left text-xs text-muted-foreground">
              <th className="px-5 py-2.5 font-medium">Product</th>
              <th className="px-2 py-2.5 font-medium">Batch</th>
              <th className="px-2 py-2.5 font-medium">Expiry</th>
              <th className="px-2 py-2.5 text-right font-medium">Pick</th>
              <th className="w-48 px-5 py-2.5 font-medium">Packed</th>
            </tr>
          </thead>
          <tbody>
            {x.lines.map((l, i) => {
              const p = productOf(db, l.productId);
              const b = batchOf(db, l.batchId);
              const days = b ? daysBetween(now, b.expiryDate) : undefined;
              const done = l.scanned >= l.qty;
              return (
                <tr key={`${l.productId}-${l.batchId}-${i}`} className="border-b border-border/50 last:border-0">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      {p && <ProductPack product={p} className="size-9 shrink-0" />}
                      <div>
                        <div className="font-medium">{p?.name}</div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {l.productId} · {p?.barcode}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-3">
                    <Link to={`/staff/batches/${l.batchId}`} className="font-mono text-sm hover:text-primary">
                      {l.batchId}
                    </Link>
                    {firstBatch.get(l.productId) === l.batchId && (
                      <div className="mt-0.5">
                        <StatusBadge tone="brand" dot={false} className="px-1.5 text-[0.65rem]">
                          Earliest expiry
                        </StatusBadge>
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-3">
                    {b ? date(b.expiryDate) : ""}
                    {days !== undefined && <div className={cn("text-xs", days <= warnDays ? "font-medium text-warning" : "text-muted-foreground")}>in {num(days)} days</div>}
                  </td>
                  <td className="px-2 py-3 text-right text-base font-semibold tabular">{num(l.qty)}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <ProgressBar value={Math.min(l.scanned, l.qty)} max={l.qty} tone={done ? "success" : "brand"} />
                      <span className={cn("w-16 shrink-0 text-right text-xs tabular", done ? "font-medium text-success" : "text-muted-foreground")}>
                        {done ? <CheckCircle2 className="ml-auto size-4" /> : `${num(l.scanned)}/${num(l.qty)}`}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

// ---------- pack by scan ----------

function PackByScan({ x }: { x: Dispatch }) {
  const db = useDb();
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [perScan, setPerScan] = useState(1);
  const [last, setLast] = useState<{ ok: boolean; message: string; n: number }>();
  const onOrder = useMemo(() => new Set(x.lines.map((l) => l.productId)), [x.lines]);
  const products = db.products.filter((p) => p.status === "active");
  const total = units(x);
  const scanned = scannedUnits(x);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const scan = (value: string) => {
    const v = value.trim();
    if (!v) return;
    const r = scanMany(x.id, v, perScan);
    setCode("");
    if (!r.ok) {
      beep("error");
      setLast({ ok: false, message: r.error, n: Date.now() });
      return;
    }
    beep(r.value.ok ? "ok" : "error");
    setLast({
      ok: r.value.ok,
      message: !r.value.ok || perScan === 1 ? r.value.message : r.value.count < perScan ? `${r.value.count} scanned, all that was still needed. ${r.value.message}` : `${r.value.count} scanned. ${r.value.message}`,
      n: Date.now(),
    });
    const after = db.dispatches.find((d) => d.id === x.id);
    if (r.value.ok && after) {
      const left = after.lines.reduce((s, l) => s + Math.max(0, l.qty - l.scanned), 0) - r.value.count;
      if (left <= 0) toast.success("Every item is packed and checked");
    }
    inputRef.current?.focus();
  };

  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-2">
          <ScanBarcode className="size-4 text-primary" /> Pack by scan
        </span>
      }
      description="Scan each pack as it goes into the box. Wrong items are refused."
      actions={<span className="font-display text-xl font-semibold tabular">{Math.round((scanned / Math.max(1, total)) * 100)}%</span>}
    >
      <ProgressBar value={scanned} max={total} className="mb-4 h-2.5" />
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          scan(code);
        }}
      >
        <div className="grid min-w-[240px] flex-1 gap-1.5">
          <Label htmlFor="scan" className="text-xs text-muted-foreground">
            Barcode
          </Label>
          <Input
            id="scan"
            ref={inputRef}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Scan a barcode, or type it and press Enter"
            autoComplete="off"
            className="h-11 font-mono text-base"
          />
        </div>
        <div className="grid w-36 gap-1.5">
          <Label className="text-xs text-muted-foreground">Units per scan</Label>
          <NativeSelect value={perScan} onChange={(e) => setPerScan(Number(e.target.value))} className="h-11">
            <option value={1}>1 pack</option>
            <option value={10}>10 (inner box)</option>
            <option value={50}>50 (carton)</option>
          </NativeSelect>
        </div>
        <Button type="submit" className="h-11">
          Scan
        </Button>
      </form>

      {last && (
        <div
          key={last.n}
          role="status"
          className={cn(
            "animate-pop mt-4 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium",
            last.ok ? "bg-success-soft text-success" : "bg-danger-soft text-destructive ring-2 ring-destructive/30",
          )}
        >
          {last.ok ? <CheckCircle2 className="size-5 shrink-0" /> : <XCircle className="size-5 shrink-0" />}
          {last.message}
        </div>
      )}

      <div className="mt-5">
        <div className="mb-2 text-xs text-muted-foreground">No scanner to hand? Click a product to scan its barcode.</div>
        <div className="flex flex-wrap gap-2">
          {products.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => scan(p.barcode)}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left text-xs transition hover:-translate-y-0.5 hover:shadow-soft",
                onOrder.has(p.id) ? "border-primary/30 bg-brand-soft/50" : "border-border bg-background",
              )}
            >
              <ProductPack product={p} className="size-7" />
              <span>
                <span className="block font-medium">{p.id}</span>
                <span className="block font-mono text-[0.65rem] text-muted-foreground">{p.barcode}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </Panel>
  );
}

// ---------- outlet: invoice, delivery note, vehicle, signed note ----------

function OutletSteps({ x }: { x: Dispatch }) {
  const db = useDb();
  const canIssue = useCan("invoices.issue");
  const canInvoice = useCan("invoices.view");
  const canDispatch = useCan("dispatch.outlet");
  const canPod = useCan("pod.confirm");
  const order = db.outletOrders.find((o) => o.id === x.orderId);
  const outlet = db.outlets.find((o) => o.id === order?.outletId);
  const inv = db.invoices.find((i) => i.id === x.invoiceId);
  const known = useMemo(() => {
    const vehicles = new Set<string>();
    const drivers = new Set<string>();
    for (const d of db.dispatches) {
      if (d.vehicle) vehicles.add(d.vehicle);
      if (d.driver) drivers.add(d.driver);
    }
    return { vehicles: [...vehicles].sort(), drivers: [...drivers].sort() };
  }, [db.dispatches]);
  const [vehicle, setVehicle] = useState(known.vehicles[0] ?? "");
  const [driver, setDriver] = useState(known.drivers[0] ?? "");
  const ready = x.status === "ready";

  return (
    <>
      <Panel
        title={
          <span className="inline-flex items-center gap-2">
            <ReceiptText className="size-4 text-primary" /> Invoice and delivery note
          </span>
        }
        description="One invoice and one delivery note for what is in this box, released only when every item is scanned."
      >
        {inv ? (
          <div className="flex flex-wrap items-center gap-3">
            {canInvoice && (
              <Button variant="outline" nativeButton={false} render={<Link to={`/staff/invoices/${inv.id}`} />}>
                <ReceiptText className="size-4" /> Invoice {inv.id}
              </Button>
            )}
            <Button variant="outline" nativeButton={false} render={<Link to={`/staff/delivery-notes/${inv.deliveryNoteId}`} />}>
              <FileText className="size-4" /> Delivery note {inv.deliveryNoteId}
            </Button>
            <span className="text-sm text-muted-foreground">
              {lkr(inv.total)} ·{" "}
              {inv.emailedAt ? `emailed to ${outlet?.email} as PDF on ${dateTime(inv.emailedAt)}` : "no email on file, so print both and send them with the driver"}
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {!ready
                ? `Available once all ${num(units(x))} units are scanned.`
                : outlet?.email
                  ? `Both are emailed to ${outlet.email} as PDF when issued, and printed for the driver.`
                  : `${outlet?.name} has no email address. Print both and send them with the driver.`}
            </p>
            {canIssue ? (
              <Button disabled={!ready} onClick={() => act(actions.issueInvoice(x.id), (v) => `Invoice ${v} and its delivery note issued${outlet?.email ? ` and emailed to ${outlet.name}` : ""}`)}>
                <ReceiptText className="size-4" /> Issue invoice and delivery note
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">{ready ? "Waiting for Outlet sales to issue them" : ""}</span>
            )}
          </div>
        )}
      </Panel>

      {(ready || x.status === "dispatched" || x.status === "delivered") && (
        <Panel
          title={
            <span className="inline-flex items-center gap-2">
              <Truck className="size-4 text-primary" /> Delivery
            </span>
          }
        >
          {ready ? (
            canDispatch ? (
              <div className="flex flex-wrap items-end gap-3">
                <div className="grid w-44 gap-1.5">
                  <Label htmlFor="vehicle" className="text-xs text-muted-foreground">
                    Vehicle
                  </Label>
                  <Input id="vehicle" list="fc-vehicles" value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="LP-4521" />
                  <datalist id="fc-vehicles">
                    {known.vehicles.map((v) => (
                      <option key={v} value={v} />
                    ))}
                  </datalist>
                </div>
                <div className="grid w-56 gap-1.5">
                  <Label htmlFor="driver" className="text-xs text-muted-foreground">
                    Driver
                  </Label>
                  <Input id="driver" list="fc-drivers" value={driver} onChange={(e) => setDriver(e.target.value)} />
                  <datalist id="fc-drivers">
                    {known.drivers.map((v) => (
                      <option key={v} value={v} />
                    ))}
                  </datalist>
                </div>
                <Button
                  disabled={!x.invoiceId || !vehicle.trim() || !driver.trim()}
                  title={!x.invoiceId ? "Issue the invoice and delivery note first" : undefined}
                  onClick={() => act(actions.dispatchOutlet(x.id, vehicle.trim(), driver.trim()), `Out for delivery with ${driver.trim()}`)}
                >
                  <Truck className="size-4" /> Dispatch
                </Button>
                {!x.invoiceId && <span className="text-xs text-muted-foreground">Issue the invoice and delivery note first.</span>}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Packed and ready. Stores loads it and records the vehicle and driver.</p>
            )
          ) : x.status === "dispatched" ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm">
                Out for delivery in <span className="font-medium">{x.vehicle}</span> with <span className="font-medium">{x.driver}</span> since {dateTime(x.dispatchedAt)}.
                <div className="mt-0.5 text-muted-foreground">{x.pod ? "The signed note is in. Check it and confirm the delivery." : "Waiting for the outlet's signed delivery note."}</div>
              </div>
              {canPod && (
                <Button nativeButton={false} render={<Link to={`/staff/pod/${x.id}`} />}>
                  <ClipboardCheck className="size-4" /> {x.pod ? "Check the signed note" : "Upload the signed note"}
                </Button>
              )}
            </div>
          ) : (
            <DeliveredSummary x={x} />
          )}
        </Panel>
      )}
    </>
  );
}

function DeliveredSummary({ x }: { x: Dispatch }) {
  const db = useDb();
  const inv = db.invoices.find((i) => i.id === x.invoiceId);
  const outlet = db.outlets.find((o) => o.id === inv?.outletId);
  const sent = new Map<string, number>();
  for (const l of x.lines) sent.set(l.productId, (sent.get(l.productId) ?? 0) + l.qty);
  const got = x.pod?.confirmedQty ?? x.pod?.readQty ?? {};
  return (
    <div className="grid gap-5 md:grid-cols-2">
      {x.pod && (
        <SignedNoteImage
          noteNo={x.deliveryNoteId ?? ""}
          outlet={outlet?.name ?? ""}
          lines={[...sent.entries()].map(([pid, q]) => ({ name: productName(db, pid), qty: q, received: x.pod?.readQty[pid] ?? q }))}
          difference={x.pod.docImage === "pod-difference"}
        />
      )}
      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-2 font-medium text-success">
          <PackageCheck className="size-4" /> Delivered {dateTime(x.deliveredAt)}
        </div>
        <ul className="space-y-1">
          {[...sent.entries()].map(([pid, q]) => (
            <li key={pid} className="flex justify-between gap-3">
              <span>{productName(db, pid)}</span>
              <span className="tabular">
                {num(got[pid] ?? q)} of {num(q)} received
              </span>
            </li>
          ))}
        </ul>
        {x.receivedBy && (
          <div className="text-sm">
            Received by <span className="font-medium">{x.receivedBy}</span>
          </div>
        )}
        {x.pod?.differenceNote && <div className="rounded-xl bg-danger-soft px-3 py-2 text-xs text-destructive">{x.pod.differenceNote}</div>}
        {x.pod?.confirmedBy && (
          <div className="text-xs text-muted-foreground">
            Confirmed by {actorName(db, x.pod.confirmedBy)} on {dateTime(x.pod.confirmedAt)}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- consultant: courier handover and delivery ----------

function CourierSteps({ x }: { x: Dispatch }) {
  const db = useDb();
  const canHand = useCan("dispatch.consultant");
  const couriers = db.settings.delivery.couriers;
  const [courier, setCourier] = useState(couriers[0] ?? "");
  const [tracking, setTracking] = useState("");
  const order = db.consultantOrders.find((o) => o.id === x.orderId);
  if (x.status === "to_pick" || x.status === "packing" || x.status === "failed" || x.status === "returned") return null;
  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-2">
          <Truck className="size-4 text-primary" /> Courier
        </span>
      }
      description={x.status === "ready" ? "Packed and checked. Hand it to the courier and enter their tracking number." : undefined}
    >
      {x.status === "ready" ? (
        canHand ? (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              act(actions.handToCourier(x.id, courier, tracking), `Handed to ${courier}. The ${db.settings.labels.consultant.toLowerCase()} has been sent the tracking number.`);
            }}
          >
            <div className="grid w-48 gap-1.5">
              <Label className="text-xs text-muted-foreground">Courier</Label>
              <NativeSelect value={courier} onChange={(e) => setCourier(e.target.value)}>
                {couriers.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid w-56 gap-1.5">
              <Label htmlFor="tracking" className="text-xs text-muted-foreground">
                Tracking number
              </Label>
              <Input id="tracking" value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="From the courier's slip" className="font-mono" />
            </div>
            <Button type="submit" disabled={!tracking.trim() || !courier}>
              <Truck className="size-4" /> Hand to courier
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">Ready for the courier. Operations records the handover.</p>
        )
      ) : x.status === "dispatched" ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            With <span className="font-medium">{x.courier}</span>, tracking <span className="font-mono font-medium">{x.trackingNo}</span>, since {dateTime(x.dispatchedAt)}.
            <div className="mt-0.5 text-muted-foreground">
              Mark it delivered when the courier confirms, or the {db.settings.labels.consultant.toLowerCase()} can confirm receipt in the app.
              {order?.paymentStatus === "cod_pending" && ` Cash on delivery: ${lkr(order.total)} to collect.`}
            </div>
          </div>
          {canHand && (
            <Button onClick={() => act(actions.markDelivered(x.orderId, "staff"), "Marked delivered")}>
              <PackageCheck className="size-4" /> Mark delivered
            </Button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm font-medium text-success">
          <PackageCheck className="size-4" /> Delivered {dateTime(x.deliveredAt)} · {x.courier}, tracking <span className="font-mono">{x.trackingNo}</span>
        </div>
      )}
    </Panel>
  );
}
