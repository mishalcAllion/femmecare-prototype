// S20 Goods received: stock arriving from production, recorded with batch,
// dates and the split between the two channel allocations.

import { DateInput } from "@/components/fc/date-input";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { ArrowRight, BellRing, CheckCircle2, Factory, PackageCheck, Plus } from "lucide-react";
import { useDb } from "@/domain/db";
import { actions } from "@/domain/actions";
import { CHANNEL_LABEL, productName } from "@/domain/stock";
import { waitingQueue } from "@/domain/outlets";
import { addDays, date, dateTime, dayKey, num, relative } from "@/domain/format";
import type { Grn } from "@/domain/types";
import { act, actorName, useCan, useNow } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { Guard, NotFound } from "@/staff/guard";
import { EmptyState, KeyValue, PageHeader, Panel, SimpleTable, Status, StatusBadge } from "@/components/fc/ui";
import { NativeSelect } from "@/components/fc/docs";
import { ProductPack } from "@/components/fc/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, ProductCell, channelName } from "./shared";
import { previewBatchId } from "@/domain/ext/inventory";
import { MOVEMENT_LABEL } from "@/domain/lists";

export function GrnListPage() {
  return (
    <Guard perms={["grn.record", "grn.view"]}>
      <GrnList />
    </Guard>
  );
}

function GrnList() {
  usePageTitle("Goods received");
  const db = useDb();
  const now = useNow();
  const canRecord = useCan("grn.record");
  const expected = db.grns.filter((g) => g.status === "expected");
  const recorded = useMemo(() => db.grns.filter((g) => g.status === "recorded"), [db.grns]);
  return (
    <div className="animate-rise">
      <PageHeader
        title="Goods received"
        description="Stock arriving from production. Recording a GRN creates the batch, puts the stock into each channel's allocation and tells outlet sales staff if outlets are waiting."
        actions={
          canRecord && (
            <Button nativeButton={false} render={<Link to="/staff/grn/new" />}>
              <Plus className="size-4" /> Record goods received
            </Button>
          )
        }
      />
      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Factory className="size-4 text-primary" /> Stock arrived from production
          {expected.length > 0 && <StatusBadge tone="brand">{expected.length} to record</StatusBadge>}
        </h2>
        {expected.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {expected.map((g) => {
              const p = db.products.find((x) => x.id === g.productId);
              const waiting = new Set(waitingQueue(db, g.productId).map((x) => x.order.outletId)).size;
              return (
                <Link key={g.id} to={`/staff/grn/${g.id}`} className="group rounded-2xl border border-primary/25 bg-brand-soft/50 p-4 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift">
                  <div className="flex items-start gap-3">
                    {p && <ProductPack product={p} className="size-14 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-primary">{g.id}</span>
                        <span className="text-xs text-muted-foreground">{relative(g.ts, now)}</span>
                      </div>
                      <div className="mt-0.5 font-display text-lg font-semibold leading-tight">
                        {num(g.qty)} × {productName(db, g.productId)}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Production ref {g.productionRef} · made {date(g.mfgDate)} · expires {date(g.expiryDate)}
                      </div>
                      {waiting > 0 && (
                        <div className="mt-2">
                          <StatusBadge tone="warning">{waiting} outlets waiting for this product</StatusBadge>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-end gap-1 text-sm font-medium text-primary">
                    {canRecord ? "Record batch and split" : "View"} <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={<Factory className="size-5" />} title="Nothing waiting" description="When production sends stock, it appears here for Stores to record." />
        )}
      </section>
      <Panel title="Recorded" description="Every goods received note, newest first" bodyClassName="p-4">
        <SimpleTable
          rows={recorded}
          rowKey={(g) => g.id}
          rowHref={(g) => `/staff/grn/${g.id}`}
          exportName="goods-received"
          columns={[
            { key: "id", header: "GRN", cell: (g) => g.id, value: (g) => g.id },
            { key: "ts", header: "Received", cell: (g) => dateTime(g.ts), value: (g) => g.ts },
            { key: "product", header: "Product", cell: (g) => <ProductCell db={db} id={g.productId} link={false} />, value: (g) => productName(db, g.productId) },
            { key: "batch", header: "Batch", cell: (g) => <Link to={`/staff/batches/${g.batchId}`} className="text-primary hover:underline">{g.batchId}</Link>, value: (g) => g.batchId },
            { key: "qty", header: "Quantity", align: "right", cell: (g) => num(g.qty), value: (g) => g.qty },
            { key: "outlet", header: "Outlets", align: "right", cell: (g) => num(g.split.outlet), value: (g) => g.split.outlet, hideOnMobile: true },
            { key: "consultant", header: `${db.settings.labels.consultant}s`, align: "right", cell: (g) => num(g.split.consultant), value: (g) => g.split.consultant, hideOnMobile: true },
            { key: "expiry", header: "Expiry", cell: (g) => date(g.expiryDate), value: (g) => g.expiryDate },
            { key: "ref", header: "Production ref", cell: (g) => g.productionRef, value: (g) => g.productionRef, hideOnMobile: true },
            { key: "by", header: "Received by", cell: (g) => actorName(db, g.receivedBy), value: (g) => actorName(db, g.receivedBy), hideOnMobile: true },
          ]}
          defaultSort={{ key: "ts", dir: "desc" }}
        />
      </Panel>
    </div>
  );
}

export function GrnNewPage() {
  return (
    <Guard perms={["grn.record"]}>
      <GrnForm />
    </Guard>
  );
}

export function GrnPage() {
  const { id } = useParams();
  const db = useDb();
  const canRecord = useCan("grn.record");
  const g = db.grns.find((x) => x.id === id);
  return (
    <Guard perms={["grn.record", "grn.view"]}>
      {!g ? <NotFound /> : g.status === "expected" && canRecord ? <GrnForm expected={g} /> : <GrnDetail grn={g} />}
    </Guard>
  );
}

function GrnForm({ expected }: { expected?: Grn }) {
  usePageTitle(expected ? `Record ${expected.id}` : "Record goods received");
  const db = useDb();
  const now = useNow();
  const navigate = useNavigate();
  const active = db.products.filter((p) => p.status === "active");
  const [productId, setProductId] = useState(expected?.productId ?? active[0]?.id ?? "");
  const [qty, setQty] = useState(String(expected?.qty ?? ""));
  const [mfg, setMfg] = useState(expected?.mfgDate ?? dayKey(addDays(now, -3)));
  const [expiry, setExpiry] = useState(expected?.expiryDate ?? dayKey(addDays(now, 727)));
  const [ref, setRef] = useState(expected?.productionRef ?? "");
  const q = Math.max(0, Math.floor(Number(qty) || 0));
  const [outletQty, setOutletQty] = useState(String(expected?.split.outlet ?? ""));
  const [consQty, setConsQty] = useState(String(expected?.split.consultant ?? ""));
  const o = Math.max(0, Math.floor(Number(outletQty) || 0));
  const c = Math.max(0, Math.floor(Number(consQty) || 0));
  const pct = q ? Math.round((o / q) * 100) : 60;
  const batchId = expected?.batchId ?? previewBatchId(db, mfg);
  const waiting = waitingQueue(db, productId);
  const waitingOutlets = [...new Set(waiting.map((x) => x.order.outletId))];
  const waitingUnits = waiting.reduce((s, x) => s + x.line.backordered, 0);

  const setQuantity = (v: string) => {
    setQty(v);
    const n = Math.max(0, Math.floor(Number(v) || 0));
    const share = q ? o / q : 0.6;
    const no = Math.round(n * share);
    setOutletQty(String(no));
    setConsQty(String(n - no));
  };
  const setSlider = (p: number) => {
    const no = Math.round((q * p) / 100);
    setOutletQty(String(no));
    setConsQty(String(q - no));
  };

  const errors: Record<string, string> = {};
  if (!q) errors.qty = "Enter the quantity received";
  if (mfg && expiry && expiry <= mfg) errors.expiry = "Expiry date must be after the manufacturing date";
  if (q && o + c !== q) errors.split = `Outlets and ${db.settings.labels.consultant.toLowerCase()}s add up to ${num(o + c)}, not ${num(q)}`;
  if (!ref.trim()) errors.ref = "Enter the production reference on the delivery docket";
  const valid = Object.keys(errors).length === 0 && !!productId && !!mfg && !!expiry;

  const save = () => {
    const savedId = act(
      actions.recordGrn({ grnId: expected?.id, productId, qty: q, batchId: expected ? undefined : batchId, mfgDate: mfg, expiryDate: expiry, split: { outlet: o, consultant: c }, productionRef: ref.trim() }),
      (gid) => `${gid} recorded: ${num(q)} × ${productName(db, productId)} in batch ${batchId}`,
    );
    if (savedId) navigate(`/staff/grn/${savedId}?saved=1`);
  };

  return (
    <div className="animate-rise">
      <PageHeader
        back={{ to: "/staff/grn", label: "Goods received" }}
        eyebrow={expected ? `${expected.id} · arrived ${dateTime(expected.ts)}` : undefined}
        title={expected ? "Record stock from production" : "Record goods received"}
        description="Check the quantity against the delivery docket, confirm the batch dates, then split the stock between the two channels."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Panel title="Receipt">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Product" htmlFor="grn-product" className="sm:col-span-2">
              <NativeSelect id="grn-product" value={productId} onChange={(e) => setProductId(e.target.value)} disabled={!!expected}>
                {active.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id} · {p.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Quantity received" htmlFor="grn-qty" error={qty !== "" ? errors.qty : undefined}>
              <Input id="grn-qty" inputMode="numeric" value={qty} onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ""))} placeholder="e.g. 1000" />
            </Field>
            <Field label="Batch number" htmlFor="grn-batch" hint="Given by the system from the month of manufacture">
              <Input id="grn-batch" value={batchId} readOnly className="bg-muted/50 font-mono" />
            </Field>
            <Field label="Manufacturing date" htmlFor="grn-mfg">
              <DateInput id="grn-mfg" value={mfg} onChange={(e) => setMfg(e.target.value)} />
            </Field>
            <Field label="Expiry date" htmlFor="grn-exp" error={errors.expiry}>
              <DateInput id="grn-exp" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
            </Field>
            <Field label="Production reference" htmlFor="grn-ref" error={ref !== "" || expected ? errors.ref : undefined} className="sm:col-span-2">
              <Input id="grn-ref" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. PRD-1214" />
            </Field>
          </div>
          <div className="mt-6 rounded-xl border border-border/70 bg-muted/30 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">Split between channels</div>
              <div className="text-xs text-muted-foreground">
                {pct}% outlets · {100 - pct}% {db.settings.labels.consultant.toLowerCase()}s
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={pct}
              disabled={!q}
              onChange={(e) => setSlider(Number(e.target.value))}
              className="w-full accent-[var(--primary)]"
              aria-label="Share for retail outlets"
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label={CHANNEL_LABEL.outlet} htmlFor="grn-o">
                <Input id="grn-o" inputMode="numeric" value={outletQty} onChange={(e) => setOutletQty(e.target.value.replace(/\D/g, ""))} />
              </Field>
              <Field label={channelName(db, "consultant")} htmlFor="grn-c">
                <Input id="grn-c" inputMode="numeric" value={consQty} onChange={(e) => setConsQty(e.target.value.replace(/\D/g, ""))} />
              </Field>
            </div>
            {errors.split && <p className="mt-2 text-xs text-destructive">{errors.split}</p>}
            {!errors.split && q > 0 && <p className="mt-2 text-xs text-success">Adds up to {num(q)}.</p>}
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" nativeButton={false} render={<Link to="/staff/grn" />}>
              Cancel
            </Button>
            <Button disabled={!valid} onClick={save}>
              <PackageCheck className="size-4" /> Record and put into stock
            </Button>
          </div>
        </Panel>
        <div className="space-y-4">
          {waitingOutlets.length > 0 && (
            <Panel title="Outlets waiting for this product" className="border-warning/40">
              <p className="text-sm text-muted-foreground">
                {waitingOutlets.length} outlet{waitingOutlets.length > 1 ? "s are" : " is"} waiting for {num(waitingUnits)} units of {productName(db, productId)}. Saving alerts outlet sales staff, who serve them oldest first.
              </p>
              <ul className="mt-3 space-y-1.5 text-sm">
                {waiting.map((w, i) => (
                  <li key={w.order.id} className="flex justify-between gap-2">
                    <span>
                      {i + 1}. {db.outlets.find((x) => x.id === w.order.outletId)?.name}
                      <span className="text-xs text-muted-foreground"> · PO {w.order.poNumber}</span>
                    </span>
                    <span className="tabular text-muted-foreground">{num(w.line.backordered)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          <Panel title="What happens on save">
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>Batch {batchId || "number"} is created with its expiry date, so picking takes the earliest expiry first.</li>
              <li>{num(o)} units go to retail outlets and {num(c)} to {db.settings.labels.consultant.toLowerCase()}s.</li>
              <li>The stock ledger and audit log record who received it and when.</li>
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function GrnDetail({ grn: g }: { grn: Grn }) {
  usePageTitle(g.id);
  const db = useDb();
  const [params] = useSearchParams();
  const saved = params.get("saved") === "1";
  const waiting = waitingQueue(db, g.productId);
  const waitingOutlets = [...new Set(waiting.map((x) => x.order.outletId))];
  const moves = db.movements.filter((m) => m.refType === "GRN" && m.refId === g.id);
  const canServe = useCan("outletOrders.edit");
  const canOutletReports = useCan("reports.outlet");
  const canWaitingList = canServe || canOutletReports;
  return (
    <div className="animate-rise">
      <PageHeader
        back={{ to: "/staff/grn", label: "Goods received" }}
        eyebrow={g.id}
        title={`${num(g.qty)} × ${productName(db, g.productId)}`}
        description={g.status === "recorded" ? `Received ${dateTime(g.ts)} by ${actorName(db, g.receivedBy)}` : "Arrived from production, waiting for Stores to record it"}
        actions={<Status>{g.status === "recorded" ? "Recorded" : "Expected"}</Status>}
      />
      {saved && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-success/30 bg-success-soft p-4">
          <CheckCircle2 className="animate-pop mt-0.5 size-5 shrink-0 text-success" />
          <div className="text-sm">
            <div className="font-medium">Stock recorded in batch {g.batchId}</div>
            <div className="text-muted-foreground">
              {num(g.split.outlet)} to retail outlets and {num(g.split.consultant)} to {db.settings.labels.consultant.toLowerCase()}s.
            </div>
          </div>
        </div>
      )}
      {g.status === "recorded" && waitingOutlets.length > 0 && (
        <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-warning/40 bg-warning-soft p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <BellRing className="mt-0.5 size-5 shrink-0 text-warning" />
            <div className="text-sm">
              <div className="font-medium">
                {waitingOutlets.length} outlet{waitingOutlets.length > 1 ? "s are" : " is"} waiting for {productName(db, g.productId)}
              </div>
              <div className="text-muted-foreground">Outlet sales staff have been alerted. They serve the oldest order first, or record a lost sale if an outlet no longer wants it.</div>
            </div>
          </div>
          {canWaitingList && (
            <Button variant="outline" nativeButton={false} render={<Link to={`/staff/backorders?product=${g.productId}`} />}>
              Open the waiting list <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Panel title="Details">
          <KeyValue
            items={[
              ["Product", <ProductCell db={db} id={g.productId} />],
              ["Batch", <Link to={`/staff/batches/${g.batchId}`} className="text-primary hover:underline">{g.batchId}</Link>],
              ["Quantity", num(g.qty)],
              ["Production reference", g.productionRef],
              ["Manufacturing date", date(g.mfgDate)],
              ["Expiry date", date(g.expiryDate)],
              [CHANNEL_LABEL.outlet, num(g.split.outlet)],
              [channelName(db, "consultant"), num(g.split.consultant)],
            ]}
          />
        </Panel>
        <Panel title="Stock ledger entries">
          {moves.length ? (
            <ul className="space-y-2 text-sm">
              {moves.map((m) => (
                <li key={m.id} className="flex justify-between gap-2">
                  <span>
                    {MOVEMENT_LABEL[m.type] ?? m.type} · {CHANNEL_LABEL[m.channel]}
                  </span>
                  <span className="tabular font-medium text-success">+{num(m.qtyIn)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing is in stock from this note yet.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
