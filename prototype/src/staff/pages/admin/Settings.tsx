// S41 Settings: every group from the specification. Each change is saved through
// actions.updateSettings, so it is audited with the old and new value. Decision
// switches carry their decision ID and show their effect on live records.

import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Building2, Calculator, Coins, CreditCard, Eye, List, Lock, Mail, MessageSquare, Package, Plug, Store, Tag, Truck, X } from "lucide-react";
import type { Draft } from "immer";
import { useDb } from "@/domain/db";
import { actions } from "@/domain/actions";
import { computeMonth } from "@/domain/commission";
import { consultantPrice, deliveryCharge, fullName } from "@/domain/consultants";
import { outletBalance, waitingQueue } from "@/domain/outlets";
import { available, batchOf, productName, stockAlerts } from "@/domain/stock";
import { daysBetween, lkr, monthKey, monthLabel, num, prevMonthKey } from "@/domain/format";
import type { CommissionSettings, Db, Settings } from "@/domain/types";
import { act, useCan, useNow, useReviewNotes } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { Guard } from "@/staff/guard";
import { PageHeader, Panel, StatusBadge } from "@/components/fc/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { DecisionTag, Field } from "../inventory/shared";
import { CUSTOMER_TYPES, INVOICE_STATUSES, MOVEMENT_TYPES, ORDER_STATUSES, PAYMENT_METHODS, PAYMENT_TERMS, TAX_RATES, UNITS } from "@/domain/lists";

export function SettingsPage() {
  return (
    <Guard perms={["settings.view"]}>
      <SettingsView />
    </Guard>
  );
}

function save(recipe: (s: Draft<Settings>) => void, what: string) {
  act(actions.updateSettings(recipe, what), `Saved: ${what}`);
}

// ---------- building blocks ----------

function Group({ id, icon, title, description, children }: { id: string; icon: ReactNode; title: string; description: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <Panel
        title={
          <span className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-brand-soft text-primary">{icon}</span>
            {title}
          </span>
        }
        description={description}
        bodyClassName="p-0"
      >
        <div className="divide-y divide-border/60">{children}</div>
      </Panel>
    </section>
  );
}

function Setting({ title, decision, description, control, effect, wide }: { title: string; decision?: string; description?: ReactNode; control: ReactNode; effect?: ReactNode; wide?: boolean }) {
  return (
    <div className="px-5 py-4">
      <div className={cn("flex gap-4", wide ? "flex-col" : "flex-col sm:flex-row sm:items-start sm:justify-between")}>
        <div className="min-w-0 sm:max-w-md">
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {title}
            {decision && <DecisionTag id={decision} />}
          </div>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        <div className={cn("shrink-0", wide && "w-full")}>{control}</div>
      </div>
      {effect && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs">
          <Eye className="mt-0.5 size-3.5 shrink-0 text-primary" />
          <div className="min-w-0">{effect}</div>
        </div>
      )}
    </div>
  );
}

function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{checked ? "On" : "Off"}</span>
      <Switch checked={checked} onCheckedChange={(v) => onChange(!!v)} disabled={disabled} aria-label={label} />
    </label>
  );
}

function Choice<T extends string>({ value, options, onChange, disabled }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={disabled}
          onClick={() => o.value !== value && onChange(o.value)}
          className={cn("rounded-md px-3 py-1.5 text-sm transition disabled:cursor-not-allowed", value === o.value ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground disabled:hover:text-muted-foreground")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A number or text box that saves when you leave it or press Enter. */
function Commit({ value, onCommit, disabled, type = "number", prefix, suffix, className, min, max, step }: { value: string | number; onCommit: (v: string) => void; disabled?: boolean; type?: "number" | "text" | "time"; prefix?: string; suffix?: string; className?: string; min?: number; max?: number; step?: number }) {
  const [draft, setDraft] = useState<string>();
  const shown = draft ?? String(value);
  const commit = () => {
    if (draft === undefined) return;
    const v = draft.trim();
    setDraft(undefined);
    if (v === String(value) || v === "") return;
    if (type === "number") {
      const n = Number(v);
      if (!Number.isFinite(n) || (min !== undefined && n < min) || (max !== undefined && n > max)) {
        act({ ok: false, error: `Enter a number${min !== undefined ? ` from ${min}` : ""}${max !== undefined ? ` to ${max}` : ""}` });
        return;
      }
    }
    onCommit(v);
  };
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {prefix && <span className="text-sm text-muted-foreground">{prefix}</span>}
      <Input
        type={type === "time" ? "time" : "text"}
        inputMode={type === "number" ? "decimal" : undefined}
        value={shown}
        disabled={disabled}
        step={step}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setDraft(undefined);
        }}
        className={cn("h-9 tabular", type === "number" ? "w-28 text-right" : type === "time" ? "w-32" : "w-full")}
      />
      {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
    </div>
  );
}

// ---------- page ----------

const SECTIONS = [
  { id: "company", label: "Company and invoice" },
  { id: "outlets", label: "Retail outlets" },
  { id: "stock", label: "Channels and stock" },
  { id: "pricing", label: "Pricing" },
  { id: "delivery", label: "Delivery" },
  { id: "payments", label: "Payments" },
  { id: "commission", label: "Commission" },
  { id: "notifications", label: "Notifications" },
  { id: "labels", label: "Labels" },
  { id: "lists", label: "Lists" },
];

function SettingsView() {
  usePageTitle("Settings");
  const db = useDb();
  const canEdit = useCan("settings.edit");
  const notes = useReviewNotes();
  return (
    <div className="animate-rise">
      <PageHeader
        title="Settings"
        description={`Business rules for both channels. Every change is recorded in the audit log with the old and new value.${notes ? " Tags such as A2 or B3 link a setting to an open decision." : ""}`}
        actions={
          <Button variant="outline" size="sm" nativeButton={false} render={<Link to="/staff/audit?area=Settings" />}>
            Change history
          </Button>
        }
      />
      {!canEdit && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-info/30 bg-info-soft px-4 py-3 text-sm">
          <Lock className="size-4 text-info" /> You can view these settings. Only an Administrator can change them.
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav className="hidden lg:block">
          <div className="sticky top-20 space-y-0.5">
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="block rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-accent/50 hover:text-foreground">
                {s.label}
              </a>
            ))}
            {db.meta.phaseLens === "everything" && (
              <Link to="/staff/integrations" className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-accent/50 hover:text-foreground">
                <Plug className="size-3.5" /> Integrations
              </Link>
            )}
          </div>
        </nav>
        <div className="min-w-0 space-y-6">
          <CompanyGroup db={db} canEdit={canEdit} />
          <OutletGroup db={db} canEdit={canEdit} />
          <StockGroup db={db} canEdit={canEdit} />
          <PricingGroup db={db} canEdit={canEdit} />
          <DeliveryGroup db={db} canEdit={canEdit} />
          <PaymentsGroup db={db} canEdit={canEdit} />
          <CommissionGroup db={db} canEdit={canEdit} />
          <NotificationsGroup db={db} />
          <LabelsGroup db={db} canEdit={canEdit} />
          <ListsGroup />
        </div>
      </div>
    </div>
  );
}

type G = { db: Db; canEdit: boolean };

function CompanyGroup({ db, canEdit }: G) {
  const c = db.settings.company;
  const notes = useReviewNotes();
  const fields: [keyof Settings["company"], string, boolean?][] = [
    ["name", "Registered name"],
    ["brand", "Brand name"],
    ["address", "Address", true],
    ["phone", "Phone"],
    ["email", "Email"],
    ["regNo", "Company registration number"],
    ["vatNo", "VAT number"],
  ];
  return (
    <Group id="company" icon={<Building2 className="size-4" />} title="Company and invoice" description="Printed on invoices, delivery notes and statements">
      <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
        {fields.map(([k, label, wide]) => (
          <Field key={k} label={label} className={wide ? "sm:col-span-2" : undefined}>
            <Commit type="text" value={c[k]} disabled={!canEdit} onCommit={(v) => save((s) => void (s.company[k] = v), label)} />
          </Field>
        ))}
        <Field label="Terms printed on invoices" className="sm:col-span-2">
          <TermsBox value={c.invoiceTerms} disabled={!canEdit} />
        </Field>
      </div>
      <Setting
        title="Invoice layout and tax"
        decision="B1"
        description={notes ? "The layout follows FemmeCare's own invoice once the sample arrives. Tax is set per product and is 0% until the tax treatment is confirmed." : "Tax is set per product and printed on each invoice line."}
        control={
          <Button variant="outline" size="sm" nativeButton={false} render={<Link to="/staff/products" />}>
            Product tax rates
          </Button>
        }
        effect={
          <>
            Invoice numbers run INV-27-00001 upward each year, with a matching delivery note number (DN-27-00001). {c.vatNo ? `VAT number ${c.vatNo} prints on every invoice.` : "No VAT number is printed while none is set."}{" "}
            Products with tax: {db.products.filter((p) => p.taxRate > 0).length} of {db.products.length}.
          </>
        }
      />
    </Group>
  );
}

function TermsBox({ value, disabled }: { value: string; disabled: boolean }) {
  const [draft, setDraft] = useState<string>();
  return (
    <Textarea
      rows={2}
      value={draft ?? value}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== undefined && draft.trim() !== value) save((s) => void (s.company.invoiceTerms = draft.trim()), "Invoice terms");
        setDraft(undefined);
      }}
    />
  );
}

function OutletGroup({ db, canEdit }: G) {
  const o = db.settings.outlets;
  const example = useMemo(() => {
    const supplied = (l: Db["outletOrders"][number]["lines"][number]) => l.delivered + l.dispatched + l.allocated;
    const ord =
      db.outletOrders.find((x) => x.status !== "cancelled" && x.lines.some((l) => supplied(l) > 0 && l.backordered > 0)) ??
      db.outletOrders.find((x) => x.status !== "cancelled" && x.lines.some((l) => l.backordered > 0));
    if (!ord) return undefined;
    const l = ord.lines.find((x) => x.backordered > 0 && supplied(x) > 0) ?? ord.lines.find((x) => x.backordered > 0)!;
    return { outlet: db.outlets.find((x) => x.id === ord.outletId)?.name ?? "", po: ord.poNumber, supplied: supplied(l), waiting: l.backordered, product: productName(db, l.productId) };
  }, [db]);
  const waitingProduct = db.products.find((p) => waitingQueue(db, p.id).length > 0);
  const waitingOutlets = waitingProduct ? new Set(waitingQueue(db, waitingProduct.id).map((x) => x.order.outletId)).size : 0;
  const outstanding = db.outlets.reduce((s, x) => s + outletBalance(db, x.id), 0);
  const owing = db.outlets.filter((x) => outletBalance(db, x.id) > 0).length;
  const credit = db.outlets
    .filter((x) => x.creditLimit > 0)
    .map((x) => ({ x, bal: outletBalance(db, x.id) }))
    .sort((a, b) => b.bal / b.x.creditLimit - a.bal / a.x.creditLimit)[0];
  return (
    <Group id="outlets" icon={<Store className="size-4" />} title="Retail outlets" description="How outlet orders, back-orders and balances behave">
      <Setting
        title="Track outlet payments"
        decision="B2"
        description="Record receipts against invoices, with balances, days overdue and ageing."
        control={<Toggle label="Track outlet payments" checked={o.trackPayments} disabled={!canEdit} onChange={(v) => save((s) => void (s.outlets.trackPayments = v), "Track outlet payments")} />}
        effect={
          o.trackPayments ? (
            <>
              Outlet payments, balances and the ageing report are shown. {lkr(outstanding)} is outstanding across {owing} outlets.
            </>
          ) : (
            <>Outlet payments, balances and the ageing report are hidden. Invoices still show their total and due date.</>
          )
        }
      />
      <Setting
        title="Back-ordered balance after a part delivery"
        decision="B3"
        description="What happens to the part of an order that could not be supplied."
        control={
          <Choice
            value={o.backorderMode}
            disabled={!canEdit}
            onChange={(v) => save((s) => void (s.outlets.backorderMode = v), "Back-order handling")}
            options={[
              { value: "keep_open", label: "Stays open until restock" },
              { value: "close_and_reconfirm", label: "Order closes; reconfirm later" },
            ]}
          />
        }
        effect={
          example ? (
            o.backorderMode === "keep_open" ? (
              <>
                {example.outlet} PO {example.po}: {num(example.supplied)} supplied, {num(example.waiting)} × {example.product} waiting. The order stays open after the part delivery and the {num(example.waiting)} wait in line for the next goods received.
              </>
            ) : (
              <>
                {example.outlet} PO {example.po}: {num(example.supplied)} supplied, {num(example.waiting)} × {example.product} waiting. The order closes once what was supplied is delivered; at restock, staff confirm the {num(example.waiting)} with the outlet before supplying them.
              </>
            )
          ) : (
            "No outlet order has a back-order right now."
          )
        }
      />
      <Setting
        title="Telling waiting outlets about new stock"
        decision="B4"
        control={
          <Choice
            value={o.notifyWaiting}
            disabled={!canEdit}
            onChange={(v) => save((s) => void (s.outlets.notifyWaiting = v), "Telling waiting outlets")}
            options={[
              { value: "staff", label: "Alert staff only" },
              { value: "staff_and_email", label: "Staff and email the outlet" },
            ]}
          />
        }
        effect={
          waitingProduct ? (
            <>
              When {waitingProduct.name} arrives: outlet sales staff get an alert listing the {waitingOutlets} outlets waiting
              {o.notifyWaiting === "staff_and_email" ? `, and each of the ${waitingOutlets} outlets gets a "back in stock" email.` : ". Outlets hear from staff by phone."}
            </>
          ) : (
            <>When stock arrives for a back-ordered product, outlet sales staff are alerted{o.notifyWaiting === "staff_and_email" ? " and the waiting outlets are emailed" : ""}.</>
          )
        }
      />
      <Setting
        title="Credit-limit warning"
        description="Warn when a new order would take an outlet over its credit limit. The order can still be saved."
        control={<Toggle label="Credit-limit warning" checked={o.creditWarning} disabled={!canEdit} onChange={(v) => save((s) => void (s.outlets.creditWarning = v), "Credit-limit warning")} />}
        effect={
          credit ? (
            o.creditWarning ? (
              credit.bal >= credit.x.creditLimit ? (
                <>
                  {credit.x.name} already owes {lkr(credit.bal)}, over its {lkr(credit.x.creditLimit, { decimals: false })} limit: any new order for it shows a warning.
                </>
              ) : (
                <>
                  {credit.x.name} owes {lkr(credit.bal)} of its {lkr(credit.x.creditLimit, { decimals: false })} limit: an order over {lkr(credit.x.creditLimit - credit.bal)} shows a warning.
                </>
              )
            ) : (
              <>No warning is shown, whatever the outlet owes.</>
            )
          ) : undefined
        }
      />
    </Group>
  );
}

function StockGroup({ db, canEdit }: G) {
  const now = useNow();
  const st = db.settings.stock;
  const alerts = useMemo(() => stockAlerts(db, now), [db, now]);
  const expiring = alerts.filter((a) => a.kind === "expiry");
  const low = alerts.filter((a) => a.kind === "low");
  const pendingMoves = db.transfers.filter((t) => t.status === "requested").length;
  const label = db.settings.labels.consultant;
  return (
    <Group id="stock" icon={<Package className="size-4" />} title="Channels and stock" description="One warehouse with an allocation for each channel">
      <Setting
        title="Splitting new stock and moving it"
        decision="B5"
        description="Stores split each delivery between the channels when recording goods received. A move between channels afterwards needs approval while this is on."
        control={<Toggle label="Moves need approval" checked={st.transferApproval} disabled={!canEdit} onChange={(v) => save((s) => void (s.stock.transferApproval = v), "Stock moves need approval")} />}
        effect={st.transferApproval ? <>Moves wait for an Administrator to approve them. {pendingMoves ? `${pendingMoves} waiting now.` : "None waiting now."}</> : <>Moves happen as soon as Stores saves them, without approval.</>}
      />
      <Setting
        title="Expiry warning"
        description="Warn about batches this many days before they expire."
        control={<Commit value={st.expiryWarnDays} min={1} max={730} suffix="days" disabled={!canEdit} onCommit={(v) => save((s) => void (s.stock.expiryWarnDays = Math.round(Number(v))), "Expiry warning days")} />}
        effect={
          expiring.length ? (
            <>
              {expiring.length} batch{expiring.length > 1 ? "es" : ""} within {st.expiryWarnDays} days:{" "}
              {expiring.map((a, i) => {
                const b = batchOf(db, a.batchId!);
                return (
                  <span key={a.batchId}>
                    {i > 0 && ", "}
                    <Link to={`/staff/batches/${a.batchId}`} className="font-medium text-primary hover:underline">
                      {a.batchId}
                    </Link>{" "}
                    ({b ? daysBetween(now, b.expiryDate) : 0} days)
                  </span>
                );
              })}
              .
            </>
          ) : (
            <>No batch in stock expires within {st.expiryWarnDays} days.</>
          )
        }
      />
      <Setting
        title="Recount limit"
        description="A shelf counted more than this many units away from the records is counted again before approval."
        control={<Commit value={st.recountLimit} min={0} max={1000} suffix="units" disabled={!canEdit} onCommit={(v) => save((s) => void (s.stock.recountLimit = Math.round(Number(v))), "Recount limit")} />}
        effect={<>A count of 92 against 100 on the records {Math.abs(92 - 100) > st.recountLimit ? "goes back for a recount" : "goes straight to approval"}.</>}
      />
      <Setting
        wide
        title="Low-stock levels"
        description="An alert shows when available stock in a channel is at or below its reorder level. The same levels are on each product."
        control={
          <div className="overflow-x-auto rounded-lg border border-border/70">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-muted/50 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 text-right font-medium">Outlets: available / reorder at</th>
                  <th className="px-3 py-2 text-right font-medium">
                    {label}s: available / reorder at
                  </th>
                </tr>
              </thead>
              <tbody>
                {db.products
                  .filter((p) => p.status === "active")
                  .map((p) => (
                    <tr key={p.id} className="border-b border-border/50 last:border-0">
                      <td className="px-3 py-2">
                        {p.id} · {p.name}
                      </td>
                      {(["outlet", "consultant"] as const).map((ch) => {
                        const have = available(db, p.id, ch);
                        const isLow = have <= p.reorder[ch];
                        return (
                          <td key={ch} className="px-3 py-1.5">
                            <div className="flex items-center justify-end gap-2">
                              <span className={cn("tabular text-xs", isLow ? "font-semibold text-destructive" : "text-muted-foreground")}>{num(have)}</span>
                              <span className="text-muted-foreground">/</span>
                              <Commit
                                value={p.reorder[ch]}
                                min={0}
                                max={100000}
                                disabled={!canEdit}
                                className="[&_input]:h-8 [&_input]:w-20"
                                onCommit={(v) => act(actions.updateProduct(p.id, { reorder: { ...p.reorder, [ch]: Math.round(Number(v)) } }), `Reorder level for ${p.name} saved`)}
                              />
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        }
        effect={
          <>
            {low.length ? `${low.length} low-stock alert${low.length > 1 ? "s" : ""} at these levels: ${low.map((a) => a.text.split(":")[0] + ` (${a.channel === "outlet" ? "outlets" : `${label.toLowerCase()}s`})`).join(", ")}.` : "No product is at or below its reorder level."}{" "}
            <Link to="/staff/stock?filter=low" className="font-medium text-primary hover:underline">
              Open stock
            </Link>
          </>
        }
      />
    </Group>
  );
}

function PricingGroup({ db, canEdit }: G) {
  const pr = db.settings.pricing;
  const label = db.settings.labels.consultant;
  const cp = consultantPrice(db, 950);
  return (
    <Group id="pricing" icon={<Tag className="size-4" />} title="Pricing" description={`How the ${label.toLowerCase()} price is worked out from the MRP`}>
      <Setting
        title={`${label} price method`}
        decision="A1"
        control={
          <Choice
            value={pr.method}
            disabled={!canEdit}
            onChange={(v) => save((s) => void (s.pricing.method = v), "Pricing method")}
            options={[
              { value: "discount", label: `MRP less ${pr.rate}%` },
              { value: "markup", label: `MRP ÷ ${(1 + pr.rate / 100).toFixed(2)}` },
            ]}
          />
        }
        effect={
          <>
            MRP {lkr(950, { decimals: false })} → {label.toLowerCase()} pays <span className="font-semibold">{lkr(cp)}</span>, margin {lkr(950 - cp)} ({(((950 - cp) / 950) * 100).toFixed(0)}% of MRP). Applies to new orders; placed orders keep their price.
          </>
        }
      />
      <Setting
        title="Rate"
        control={<Commit value={pr.rate} min={0} max={90} suffix="%" disabled={!canEdit} onCommit={(v) => save((s) => void (s.pricing.rate = Number(v)), "Pricing rate")} />}
        effect={<>{db.products.filter((p) => p.status === "active").map((p) => `${p.id} ${lkr(consultantPrice(db, p.mrp), { prefix: false })}`).join(" · ")}</>}
      />
    </Group>
  );
}

function DeliveryGroup({ db, canEdit }: G) {
  const d = db.settings.delivery;
  const [courier, setCourier] = useState("");
  const label = db.settings.labels.consultant;
  const sample = 9000;
  return (
    <Group id="delivery" icon={<Truck className="size-4" />} title="Delivery" description={`Delivery charge and couriers for ${label.toLowerCase()} orders. Outlets are delivered by FemmeCare's own vehicle.`}>
      <Setting
        title="Delivery charge"
        control={<Commit value={d.flatCharge} min={0} max={10000} prefix="LKR" disabled={!canEdit} onCommit={(v) => save((s) => void (s.delivery.flatCharge = Number(v)), "Delivery charge")} />}
        effect={
          <>
            An order of {lkr(sample, { decimals: false })} pays {deliveryCharge(db, sample) ? lkr(deliveryCharge(db, sample)) : "no delivery charge"}; {lkr(d.freeOver, { decimals: false })} or more ships free.
          </>
        }
      />
      <Setting title="Free delivery from" control={<Commit value={d.freeOver} min={0} max={1000000} prefix="LKR" disabled={!canEdit} onCommit={(v) => save((s) => void (s.delivery.freeOver = Number(v)), "Free delivery threshold")} />} />
      <Setting
        title="Couriers"
        decision="A10"
        description="Operations choose one when handing an order over, and enter its tracking number."
        wide
        control={
          <div className="flex flex-wrap items-center gap-2">
            {d.couriers.map((c) => (
              <span key={c} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm">
                {c}
                {canEdit && d.couriers.length > 1 && (
                  <button type="button" onClick={() => save((s) => void (s.delivery.couriers = s.delivery.couriers.filter((x) => x !== c)), `Courier removed: ${c}`)} aria-label={`Remove ${c}`} className="text-muted-foreground hover:text-destructive">
                    <X className="size-3.5" />
                  </button>
                )}
              </span>
            ))}
            {canEdit && (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = courier.trim();
                  if (!v) return;
                  if (d.couriers.some((x) => x.toLowerCase() === v.toLowerCase())) return act({ ok: false, error: `${v} is already on the list` });
                  save((s) => void s.delivery.couriers.push(v), `Courier added: ${v}`);
                  setCourier("");
                }}
              >
                <Input value={courier} onChange={(e) => setCourier(e.target.value)} placeholder="Add a courier" className="h-8 w-40" />
                <Button type="submit" size="sm" variant="outline" disabled={!courier.trim()}>
                  Add
                </Button>
              </form>
            )}
          </div>
        }
      />
    </Group>
  );
}

function PaymentsGroup({ db, canEdit }: G) {
  const p = db.settings.payments;
  const notes = useReviewNotes();
  const label = db.settings.labels.consultant;
  const methods = [p.card && "Card", p.bankTransfer && "Bank transfer", p.cod && "Cash on delivery"].filter(Boolean) as string[];
  const bankFields: [keyof Settings["payments"], string][] = [
    ["bankAccountName", "Account name"],
    ["bankAccountNumber", "Account number"],
    ["bankName", "Bank"],
    ["bankBranch", "Branch"],
  ];
  return (
    <Group id="payments" icon={<CreditCard className="size-4" />} title="Payments" description={`How ${label.toLowerCase()}s pay for orders. Outlets pay against invoices.`}>
      <Setting
        title="Card payments"
        decision="A6"
        control={<Toggle label="Card payments" checked={p.card} disabled={!canEdit} onChange={(v) => save((s) => void (s.payments.card = v), "Card payments")} />}
        effect={<>Checkout offers: {methods.length ? methods.join(", ") : "no payment method. Switch one on so orders can be paid"}.</>}
      />
      <Setting title="Bank transfer" decision="A6" description={`The ${label.toLowerCase()} transfers the amount and uploads the slip; Operations verify it.`} control={<Toggle label="Bank transfer" checked={p.bankTransfer} disabled={!canEdit} onChange={(v) => save((s) => void (s.payments.bankTransfer = v), "Bank transfer payments")} />} />
      <Setting
        title="Cash on delivery"
        decision="A6"
        description={p.cod ? "The courier collects the order amount in cash at the door." : notes ? "Off until FemmeCare confirms how the courier collects cash." : "Let the courier collect the order amount in cash at the door."}
        control={<Toggle label="Cash on delivery" checked={p.cod} disabled={!canEdit} onChange={(v) => save((s) => void (s.payments.cod = v), "Cash on delivery")} />}
        effect={p.cod ? <>Cash on delivery shows at checkout. Those orders are packed before payment and marked paid when the courier delivers.</> : <>Cash on delivery is not offered at checkout.</>}
      />
      <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
        <div className="text-sm font-medium sm:col-span-2">Bank account shown for transfers</div>
        {bankFields.map(([k, lab]) => (
          <Field key={k} label={lab}>
            <Commit type="text" value={String(p[k])} disabled={!canEdit} onCommit={(v) => save((s) => void ((s.payments as Record<string, unknown>)[k] = v), `Bank ${lab.toLowerCase()}`)} />
          </Field>
        ))}
      </div>
    </Group>
  );
}

function commissionMonth(db: Db, now: string) {
  const prev = prevMonthKey(monthKey(now));
  return db.commissionMonths.some((m) => m.id === prev) ? monthKey(now) : prev;
}

function CommissionGroup({ db, canEdit }: G) {
  const now = useNow();
  const s = db.settings.commission;
  const month = commissionMonth(db, now);
  const nimali = db.consultants.find((c) => c.givenName === "Nimali" && c.surname === "Perera" && c.number !== undefined);
  const figures = (alt: Partial<CommissionSettings>) => {
    const lines = computeMonth(db, month, { ...s, ...alt });
    const mine = nimali ? lines.find((l) => l.sponsorId === nimali.id) : undefined;
    return { mine: mine?.amount ?? 0, total: lines.reduce((a, l) => a + l.amount, 0), qualified: lines.filter((l) => l.qualifies).length, line: mine };
  };
  const current = useMemo(() => figures({}), [db, month]); // eslint-disable-line react-hooks/exhaustive-deps
  const alt = (a: Partial<CommissionSettings>) => figures(a);
  const locked = db.commissionMonths.slice().sort((a, b) => b.id.localeCompare(a.id))[0];
  const who = nimali ? fullName(nimali) : "the top sponsor";
  const name = db.settings.labels.consultant.toLowerCase();
  const compare = (a: Partial<CommissionSettings>, labelA: string, labelB: string, isA: boolean) => {
    const other = alt(a);
    return (
      <>
        {who}: <span className="font-semibold">{lkr(current.mine)}</span> now ({isA ? labelA : labelB}); {lkr(other.mine)} with {isA ? labelB : labelA}. All sponsors: {lkr(current.total)} now, {lkr(other.total)} with {isA ? labelB : labelA}.
      </>
    );
  };
  return (
    <Group id="commission" icon={<Coins className="size-4" />} title="Commission" description={`${s.rate}% to sponsors on their direct team's sales each month. Locked months are never recalculated.`}>
      <div className="border-b border-border/60 bg-brand-soft/40 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-card text-primary shadow-soft">
              <Calculator className="size-5" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">
                {monthLabel(month)} commission for {who}
                {nimali?.number ? ` (FC${String(nimali.number).padStart(5, "0")})` : ""}, provisional
              </div>
              <div className="font-display text-2xl font-semibold tabular">{lkr(current.mine)}</div>
            </div>
          </div>
          <div className="text-right text-sm">
            <div className="tabular">
              <span className="font-semibold">{lkr(current.total)}</span> across {current.qualified} qualifying sponsors
            </div>
            {locked && (
              <div className="text-xs text-muted-foreground">
                {monthLabel(locked.id)} is locked at {lkr(locked.lines.reduce((a, l) => a + l.amount, 0))} and does not change.
              </div>
            )}
          </div>
        </div>
        {current.line && (
          <div className="mt-3 text-xs text-muted-foreground">
            Team sales {lkr(current.line.teamSales)} · own sales {lkr(current.line.ownSales)} · counts toward threshold {lkr(current.line.thresholdBasis)} · {current.line.activeReferrals} of the team ordered
          </div>
        )}
      </div>
      <Setting title="Rate" control={<Commit value={s.rate} min={0} max={50} step={0.5} suffix="%" disabled={!canEdit} onCommit={(v) => save((x) => void (x.commission.rate = Number(v)), "Commission rate")} />} effect={<>{who}: {lkr(current.mine)} at {s.rate}%.</>} />
      <Setting
        title="Commission base"
        decision="A2"
        description={`Whether ${s.rate}% is worked out on the MRP value of the team's orders or on what they paid.`}
        control={
          <Choice
            value={s.base}
            disabled={!canEdit}
            onChange={(v) => save((x) => void (x.commission.base = v), "Commission base")}
            options={[
              { value: "mrp", label: "MRP value" },
              { value: "net", label: "Net sales (price paid)" },
            ]}
          />
        }
        effect={compare({ base: s.base === "mrp" ? "net" : "mrp" }, "MRP value", "net sales", s.base === "mrp")}
      />
      <Setting
        title="Monthly threshold"
        decision="A3"
        description="A sponsor earns only when sales reach this amount in the month."
        control={<Commit value={s.threshold} min={0} max={10000000} prefix="LKR" disabled={!canEdit} onCommit={(v) => save((x) => void (x.commission.threshold = Number(v)), "Commission threshold")} />}
        effect={<>{current.qualified} sponsors reach {lkr(s.threshold, { decimals: false })} in {monthLabel(month)}.</>}
      />
      <Setting
        title="What counts toward the threshold"
        decision="A3"
        control={
          <Choice
            value={s.thresholdCounts}
            disabled={!canEdit}
            onChange={(v) => save((x) => void (x.commission.thresholdCounts = v), "What counts toward the threshold")}
            options={[
              { value: "team_plus_own", label: "Team plus own sales" },
              { value: "team", label: "Team sales only" },
            ]}
          />
        }
        effect={(() => {
          const other = alt({ thresholdCounts: s.thresholdCounts === "team" ? "team_plus_own" : "team" });
          return (
            <>
              {current.qualified} sponsors qualify now; {other.qualified} would with {s.thresholdCounts === "team" ? "team plus own sales" : "team sales only"}. All sponsors: {lkr(current.total)} now, {lkr(other.total)} with the other rule.
            </>
          );
        })()}
      />
      <Setting
        title={`Sponsor's own sales earn ${s.rate}%`}
        decision="A4"
        control={<Toggle label="Own sales earn commission" checked={s.ownSalesEarn} disabled={!canEdit} onChange={(v) => save((x) => void (x.commission.ownSalesEarn = v), "Own sales earn commission")} />}
        effect={compare({ ownSalesEarn: !s.ownSalesEarn }, "own sales included", "own sales excluded", s.ownSalesEarn)}
      />
      <Setting
        title="FemmeCare's own account (No. 1) earns"
        decision="A5"
        description={`${db.settings.labels.consultant}s who join without a sponsor are placed under No. 1.`}
        control={<Toggle label="No. 1 earns" checked={s.no1Earns} disabled={!canEdit} onChange={(v) => save((x) => void (x.commission.no1Earns = v), "No. 1 earns commission")} />}
        effect={(() => {
          const other = alt({ no1Earns: !s.no1Earns });
          return (
            <>
              All sponsors: {lkr(current.total)} now; {lkr(other.total)} if No. 1 {s.no1Earns ? "did not earn" : "earned"} (a difference of {lkr(Math.abs(other.total - current.total))}).
            </>
          );
        })()}
      />
      <Setting
        title="Month cut-off"
        decision="A15"
        description="Payments after this time on the last day count in the next month."
        control={<Commit type="time" value={s.cutoff} disabled={!canEdit} onCommit={(v) => save((x) => void (x.commission.cutoff = v), "Month cut-off time")} />}
        effect={<>A payment at {s.cutoff === "23:59" ? "11.59 pm" : s.cutoff} on the last day counts in that month; one a minute later counts in the next.</>}
      />
      <Setting
        title="Active direct referrals test"
        decision="Q9"
        description="Also require a minimum number of team members who ordered in the month."
        control={
          <div className="flex items-center gap-3">
            <Commit value={s.referralTest.min} min={1} max={50} prefix="at least" disabled={!canEdit || !s.referralTest.enabled} onCommit={(v) => save((x) => void (x.commission.referralTest.min = Math.round(Number(v))), "Referral test minimum")} className="[&_input]:w-16" />
            <Toggle label="Referral test" checked={s.referralTest.enabled} disabled={!canEdit} onChange={(v) => save((x) => void (x.commission.referralTest.enabled = v), "Active referrals test")} />
          </div>
        }
        effect={(() => {
          const other = alt({ referralTest: { enabled: !s.referralTest.enabled, min: s.referralTest.min } });
          return s.referralTest.enabled ? (
            <>
              With at least {s.referralTest.min} who ordered: {current.qualified} sponsors qualify ({lkr(current.total)}). Without the test: {other.qualified} ({lkr(other.total)}). It also shows on each {name}'s home page.
            </>
          ) : (
            <>
              Off. Switching it on with at least {s.referralTest.min}: {other.qualified} sponsors would qualify ({lkr(other.total)}) against {current.qualified} now.
            </>
          );
        })()}
      />
    </Group>
  );
}

const TEMPLATES: { name: string; channel: "Email" | "SMS"; to: string; text: string }[] = [
  { name: "Application received", channel: "Email", to: "Applicant", text: "Dear {first name}, thank you for applying to become a FemmeCare {label}. Your reference is {application ref}. We will review your details and let you know within two working days." },
  { name: "Application approved", channel: "Email", to: "Applicant", text: "Dear {first name}, your application is approved. Your {label} number is {number}. Sign in at femmecare.lk/app with your number or email and the password you chose." },
  { name: "Application approved", channel: "SMS", to: "Applicant", text: "FemmeCare: Welcome! Your {label} number is {number}. Sign in at femmecare.lk/app" },
  { name: "Application not approved", channel: "Email", to: "Applicant", text: "Dear {first name}, we could not approve your application {application ref}: {reason}. You are welcome to apply again." },
  { name: "Order received", channel: "Email", to: "{label}", text: "Dear {first name}, thank you for your order {order} for {total}. For a bank transfer, pay {total} to {bank account} using {order} as the reference, and upload the slip in the app." },
  { name: "Payment received", channel: "SMS", to: "{label}", text: "FemmeCare: Payment of {total} received for order {order}. We are packing it now." },
  { name: "Payment not verified", channel: "SMS", to: "{label}", text: "FemmeCare: We could not verify the payment for order {order}: {reason}. Please upload the slip again in the app." },
  { name: "Order dispatched", channel: "SMS", to: "{label}", text: "FemmeCare: Your order {order} is on its way with {courier}. Tracking number {tracking number}." },
  { name: "Refund approved", channel: "SMS", to: "{label}", text: "FemmeCare: A refund of {total} for order {order} has been approved and will reach your bank account within 5 working days." },
  { name: "Commission paid", channel: "SMS", to: "{label}", text: "FemmeCare: Your {month} commission of {amount} has been paid to your bank account." },
  { name: "Invoice and delivery note", channel: "Email", to: "Outlet", text: "Dear {contact}, please find attached invoice {invoice} for {total} and delivery note {delivery note} for your PO {po}. Payment is due by {due date}." },
  { name: "Revised delivery date", channel: "Email", to: "Outlet", text: "Dear {contact}, the balance of {quantity} × {product} on your PO {po} is now expected on {date}." },
  { name: "Back in stock", channel: "Email", to: "Outlet", text: "Dear {contact}, {product} is back in stock. We will contact you to confirm delivery of the {quantity} packs still due on your PO {po}." },
];

function NotificationsGroup({ db }: { db: Db }) {
  const label = db.settings.labels.consultant;
  return (
    <Group id="notifications" icon={<MessageSquare className="size-4" />} title="Notifications" description="Messages the system sends by email and SMS. Wording is fixed for the first release.">
      <div className="grid gap-3 p-5 md:grid-cols-2">
        {TEMPLATES.map((t, i) => (
          <div key={i} className="rounded-xl border border-border/70 p-3">
            <div className="mb-1 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                {t.channel === "Email" ? <Mail className="size-3.5 text-muted-foreground" /> : <MessageSquare className="size-3.5 text-muted-foreground" />}
                {t.name}
              </div>
              <StatusBadge tone={t.channel === "Email" ? "info" : "plum"} dot={false}>
                {t.channel} to {t.to.replace("{label}", label.toLowerCase())}
              </StatusBadge>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{t.text.replace(/\{label\}/g, label.toLowerCase())}</p>
          </div>
        ))}
      </div>
    </Group>
  );
}

function LabelsGroup({ db, canEdit }: G) {
  const l = db.settings.labels.consultant;
  return (
    <Group id="labels" icon={<Tag className="size-4" />} title="Labels" description="The word used for sellers across the console, the app and the public site">
      <Setting
        title="Name for sellers"
        decision="A12"
        control={
          <Choice
            value={l}
            disabled={!canEdit}
            onChange={(v) => save((s) => void (s.labels.consultant = v), "Name for sellers")}
            options={[
              { value: "Consultant", label: "Consultant" },
              { value: "Agent", label: "Agent" },
            ]}
          />
        }
        effect={
          <>
            Menus and pages say: {l}s, {l} orders, {l} price, "Become a{l === "Agent" ? "n" : ""} {l.toLowerCase()}".
          </>
        }
      />
    </Group>
  );
}

const LISTS: { name: string; where: string; values: readonly (string | number)[]; suffix?: string }[] = [
  { name: "Order statuses", where: "Outlet orders", values: ORDER_STATUSES },
  { name: "Payment terms", where: "Outlets", values: PAYMENT_TERMS },
  { name: "Customer types", where: "Outlets", values: CUSTOMER_TYPES },
  { name: "Movement types", where: "Stock ledger", values: MOVEMENT_TYPES },
  { name: "Invoice statuses", where: "Invoices", values: INVOICE_STATUSES },
  { name: "Payment methods", where: "Outlet payments", values: PAYMENT_METHODS },
  { name: "Units of measure", where: "Products", values: UNITS },
  { name: "Tax rates", where: "Products", values: TAX_RATES, suffix: "%" },
];

function ListsGroup() {
  const notes = useReviewNotes();
  return (
    <Group id="lists" icon={<List className="size-4" />} title="Lists" description={notes ? "The choices offered in drop-downs, taken from FemmeCare's ERP formats. Please confirm each list or tell us what to change." : "The choices offered in drop-downs across the system"}>
      <div className="grid gap-3 p-5 md:grid-cols-2">
        {LISTS.map((l) => (
          <div key={l.name} className="rounded-xl border border-border/70 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-sm font-medium">{l.name}</div>
              <span className="text-xs text-muted-foreground">Used in {l.where}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {l.values.map((v) => (
                <span key={String(v)} className="rounded-md bg-muted px-2 py-0.5 text-xs">
                  {v}
                  {l.suffix ?? ""}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Group>
  );
}
