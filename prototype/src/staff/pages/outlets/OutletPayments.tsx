// S13 Outlet payments: ageing, record a receipt against an invoice, receipts list.

import { DateInput } from "@/components/fc/date-input";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Plus, Wallet } from "lucide-react";
import { useDb } from "@/domain/db";
import { ageing, daysOverdue, invoiceBalance, outletName } from "@/domain/outlets";
import type { OutletPayment } from "@/domain/types";
import { date, dayKey, lkIso, lkr, lkrShort } from "@/domain/format";
import { act, actorName, useCan, useNow } from "@/lib/fc";
import { recordPaymentWithNotes } from "@/domain/ext/outlets";
import { usePageTitle } from "@/lib/title";
import { Guard } from "../../guard";
import { EmptyState, Kpi, PageHeader, Panel, SimpleTable } from "@/components/fc/ui";
import { NativeSelect } from "@/components/fc/docs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, PAYMENT_METHODS, shownInvoiceStatus } from "./shared";

export function OutletPayments() {
  return (
    <Guard perms={["outletPayments.view"]}>
      <Page />
    </Guard>
  );
}

const BUCKETS = [
  { key: "notDue", label: "Not yet due" },
  { key: "d1_30", label: "1 to 30 days" },
  { key: "d31_60", label: "31 to 60 days" },
  { key: "d61_90", label: "61 to 90 days" },
  { key: "d90", label: "Over 90 days" },
] as const;

function Page() {
  usePageTitle("Outlet payments");
  const db = useDb();
  const now = useNow();
  const canRecord = useCan("outletPayments.record");
  const canSettings = useCan("settings.edit");
  const [params, setParams] = useSearchParams();
  const preset = params.get("invoice") ?? "";
  const [open, setOpen] = useState(!!preset && canRecord);

  const total = useMemo(() => ageing(db, now), [db, now]);
  const byOutlet = useMemo(
    () =>
      db.outlets
        .map((o) => ({ o, a: ageing(db, now, o.id) }))
        .map((r) => ({ ...r, sum: r.a.notDue + r.a.d1_30 + r.a.d31_60 + r.a.d61_90 + r.a.d90 }))
        .filter((r) => r.sum > 0),
    [db, now],
  );
  const outstanding = BUCKETS.reduce((s, b) => s + total[b.key], 0);

  if (!db.settings.outlets.trackPayments) {
    return (
      <div className="animate-rise">
        <PageHeader title="Outlet payments" />
        <EmptyState
          icon={<Wallet className="size-5" />}
          title="Outlet payments are not tracked here"
          description="Payment tracking for outlets is switched off, so receipts, balances and ageing are kept in the accounts system. Invoices are still issued and emailed as usual."
          action={
            canSettings ? (
              <Button variant="outline" nativeButton={false} render={<Link to="/staff/settings" />}>
                Open settings
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="animate-rise space-y-6">
      <PageHeader
        title="Outlet payments"
        description="Money received from outlets against their invoices, and what is still owed by age."
        actions={
          canRecord && (
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Record a payment
            </Button>
          )
        }
      />
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Outstanding" value={lkrShort(outstanding)} sub={lkr(outstanding)} tone="info" icon={<Wallet className="size-5" />} />
        {BUCKETS.map((b) => (
          <Kpi key={b.key} label={b.label} value={lkrShort(total[b.key])} sub={b.key === "notDue" ? "Within terms" : "Overdue"} tone={b.key === "notDue" ? "success" : "danger"} to={b.key === "notDue" ? undefined : "/staff/invoices?status=Overdue"} />
        ))}
      </div>

      <Panel title="Ageing by outlet" description="Balance of issued invoices by days past the due date" bodyClassName="p-0">
        {byOutlet.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-muted/50 text-right text-xs text-muted-foreground">
                  <th className="px-5 py-2.5 text-left font-medium">Outlet</th>
                  {BUCKETS.map((b) => (
                    <th key={b.key} className="px-3 py-2.5 font-medium">
                      {b.label}
                    </th>
                  ))}
                  <th className="px-5 py-2.5 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {byOutlet
                  .sort((a, b) => b.sum - a.sum)
                  .map(({ o, a, sum }) => (
                    <tr key={o.id} className="border-b border-border/50 last:border-0">
                      <td className="px-5 py-2.5">
                        <Link to={`/staff/outlets/${o.id}`} className="font-medium hover:text-primary">
                          {o.name}
                        </Link>
                        <span className="block text-xs text-muted-foreground">{o.paymentTerms}</span>
                      </td>
                      {BUCKETS.map((b) => (
                        <td key={b.key} className={`px-3 py-2.5 text-right tabular ${a[b.key] && b.key !== "notDue" ? "font-medium text-destructive" : a[b.key] ? "" : "text-muted-foreground/60"}`}>
                          {a[b.key] ? lkr(a[b.key], { prefix: false }) : "-"}
                        </td>
                      ))}
                      <td className="px-5 py-2.5 text-right font-semibold tabular">{lkr(sum, { prefix: false })}</td>
                    </tr>
                  ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border/70 bg-muted/30 font-semibold">
                  <td className="px-5 py-2.5">All outlets</td>
                  {BUCKETS.map((b) => (
                    <td key={b.key} className="px-3 py-2.5 text-right tabular">
                      {lkr(total[b.key], { prefix: false })}
                    </td>
                  ))}
                  <td className="px-5 py-2.5 text-right tabular">{lkr(outstanding, { prefix: false })}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="p-5">
            <EmptyState title="Nothing outstanding" description="Every issued invoice is paid in full." />
          </div>
        )}
      </Panel>

      <div>
        <h2 className="mb-3 text-[0.95rem] font-semibold">Receipts</h2>
        <SimpleTable<OutletPayment>
          rows={db.outletPayments}
          rowKey={(p) => p.id}
          exportName="outlet-receipts"
          defaultSort={{ key: "date", dir: "desc" }}
          searchText={(p) => `${p.id} ${p.invoiceId} ${outletName(db, p.outletId)} ${p.reference} ${p.method}`}
          columns={[
            { key: "id", className: "whitespace-nowrap", header: "Receipt", value: (p) => p.id, cell: (p) => <span className="font-medium">{p.id}</span> },
            { key: "date", className: "whitespace-nowrap", header: "Date", value: (p) => p.date, cell: (p) => date(p.date) },
            { key: "outlet", header: "Outlet", value: (p) => outletName(db, p.outletId), cell: (p) => <Link to={`/staff/outlets/${p.outletId}`} className="hover:text-primary">{outletName(db, p.outletId)}</Link> },
            { key: "invoice", className: "whitespace-nowrap", header: "Invoice", value: (p) => p.invoiceId, cell: (p) => <Link to={`/staff/invoices/${p.invoiceId}`} className="hover:text-primary">{p.invoiceId}</Link> },
            { key: "method", className: "whitespace-nowrap", header: "Method", value: (p) => p.method, cell: (p) => p.method },
            { key: "ref", header: "Reference", value: (p) => p.reference, cell: (p) => p.reference || <span className="text-muted-foreground">None</span>, hideOnMobile: true },
            { key: "notes", header: "Notes", value: (p) => p.notes ?? "", cell: (p) => <span className="text-muted-foreground">{p.notes}</span>, hideOnMobile: true },
            { key: "by", header: "Received by", value: (p) => actorName(db, p.receivedBy), cell: (p) => actorName(db, p.receivedBy), hideOnMobile: true },
            { key: "amount", className: "whitespace-nowrap", header: "Amount", align: "right", value: (p) => p.amount, cell: (p) => <span className="font-medium">{lkr(p.amount)}</span> },
          ]}
          empty={<EmptyState title="No payments recorded yet" description="Receipts recorded against outlet invoices appear here." />}
        />
      </div>

      {canRecord && (
        <RecordPayment
          open={open}
          preset={preset}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v && preset) setParams({}, { replace: true });
          }}
          nowIso={now}
        />
      )}
    </div>
  );
}

function RecordPayment({ open, onOpenChange, preset, nowIso }: { open: boolean; onOpenChange: (v: boolean) => void; preset: string; nowIso: string }) {
  const db = useDb();
  const openInvoices = db.invoices
    .filter((i) => i.status === "issued" && invoiceBalance(db, i) > 0)
    .sort((a, b) => outletName(db, a.outletId).localeCompare(outletName(db, b.outletId)) || a.dueDate.localeCompare(b.dueDate));
  const [invoiceId, setInvoiceId] = useState(preset);
  const inv = db.invoices.find((i) => i.id === invoiceId);
  const bal = inv ? invoiceBalance(db, inv) : 0;
  const [amount, setAmount] = useState(inv ? String(bal) : "");
  const [method, setMethod] = useState<OutletPayment["method"]>("Bank Transfer");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const today = dayKey(nowIso);
  const [day, setDay] = useState(today);

  const amt = Number(amount);
  const error = !inv ? "Choose the invoice being paid" : !(amt > 0) ? "Enter the amount received" : amt > bal + 0.005 ? `The balance is ${lkr(bal)}` : !day ? "Enter the date received" : day > today ? "The date can't be in the future" : undefined;

  const reset = () => {
    setInvoiceId("");
    setAmount("");
    setReference("");
    setNotes("");
    setDay(today);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
          <DialogDescription>Record money received from an outlet against one invoice. Several part payments are fine.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Invoice" hint={inv ? `${outletName(db, inv.outletId)} · total ${lkr(inv.total)} · balance ${lkr(bal)} · ${shownInvoiceStatus(db, inv, nowIso)}${daysOverdue(inv, nowIso) ? `, ${daysOverdue(inv, nowIso)} days overdue` : ""}` : undefined}>
            <NativeSelect
              value={invoiceId}
              onChange={(e) => {
                setInvoiceId(e.target.value);
                const i = db.invoices.find((x) => x.id === e.target.value);
                setAmount(i ? String(invoiceBalance(db, i)) : "");
              }}
            >
              <option value="">Choose an invoice</option>
              {openInvoices.map((i) => (
                <option key={i.id} value={i.id}>
                  {outletName(db, i.outletId)} · {i.id} · {lkr(invoiceBalance(db, i))} due {date(i.dueDate)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount (LKR)">
              <Input type="number" min={0} step={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} className="tabular" />
            </Field>
            <Field label="Date received">
              <DateInput value={day} max={today} onChange={(e) => setDay(e.target.value)} />
            </Field>
            <Field label="Method">
              <NativeSelect value={method} onChange={(e) => setMethod(e.target.value as OutletPayment["method"])}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Reference" hint={method === "Cheque" ? "Cheque number" : method === "Bank Transfer" ? "Bank reference" : undefined}>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={method === "Cash" ? "Optional" : ""} />
            </Field>
          </div>
          <Field label="Notes" hint="Optional, for example the bank the cheque is drawn on">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          {inv && amt > 0 && amt < bal - 0.005 && <p className="text-xs text-muted-foreground">Part payment: {lkr(bal - amt)} will remain on {inv.id}.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!!error}
            title={error}
            onClick={() => {
              const id = act(
                recordPaymentWithNotes({ invoiceId, amount: amt, method, reference: reference.trim(), date: day === today ? nowIso : lkIso(day, "12:00"), notes }),
                (v) => `${v} recorded: ${lkr(amt)} from ${inv ? outletName(db, inv.outletId) : ""}`,
              );
              if (id) {
                reset();
                onOpenChange(false);
              }
            }}
          >
            Record payment
          </Button>
        </DialogFooter>
        {error && invoiceId && <p className="-mt-2 text-right text-xs text-muted-foreground">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
