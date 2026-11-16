// S12 Invoice and delivery note print views (A4).

import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { Ban, FileText, Mail, Printer, ReceiptText, Truck, Wallet } from "lucide-react";
import { useDb } from "@/domain/db";
import { actions } from "@/domain/actions";
import { daysOverdue, invoiceBalance, paidOn } from "@/domain/outlets";
import { batchOf, productName } from "@/domain/stock";
import { addressLine, date, dateTime, lkr, num } from "@/domain/format";
import { actorName, useCan, useNow } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { Guard, NotFound } from "../../guard";
import { KeyValue, Panel, ReasonDialog, Status } from "@/components/fc/ui";
import { Barcode, SignedNoteImage } from "@/components/fc/docs";
import { Logo } from "@/components/fc/brand";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import type { Db, Invoice } from "@/domain/types";
import { PrintOnlyDocument, amountInWords, done, shownInvoiceStatus } from "./shared";
import { dispatchStatusLabel } from "@/domain/lists";

export function InvoicePrint() {
  return (
    <Guard perms={["invoices.view"]}>
      <InvoiceView />
    </Guard>
  );
}

export function DeliveryNotePrint() {
  return (
    <Guard perms={["invoices.view", "dispatch.view"]}>
      <DeliveryNoteView />
    </Guard>
  );
}

function issuedBy(db: Db, inv: Invoice) {
  return db.audit.find((a) => a.action === `Invoice issued ${inv.id}`)?.by;
}

function Toolbar({ back, children }: { back: { to: string; label: string }; children?: ReactNode }) {
  return (
    <div className="no-print flex flex-wrap items-center justify-between gap-3 pt-2">
      <Link to={back.to} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> {back.label}
      </Link>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function CompanyHeader({ title, number, children }: { title: string; number: string; children?: ReactNode }) {
  const db = useDb();
  const c = db.settings.company;
  return (
    <div className="flex items-start justify-between gap-6 border-b-2 border-[#c8305a] pb-5">
      <div>
        <Logo className="[&_.text-foreground]:text-neutral-900" />
        <div className="mt-3 text-[11px] leading-relaxed text-neutral-600">
          <div className="font-semibold text-neutral-800">{c.name}</div>
          <div>{c.address}</div>
          <div>
            Tel {c.phone} · {c.email}
          </div>
          <div>
            Company reg. {c.regNo}
            {c.vatNo ? ` · VAT ${c.vatNo}` : ""}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className="font-display text-2xl font-semibold tracking-wide text-neutral-900">{title}</div>
        <div className="mt-1 font-mono text-sm text-neutral-700">{number}</div>
        {children}
      </div>
    </div>
  );
}

function Paper({ children, cancelled }: { children: ReactNode; cancelled?: boolean }) {
  return (
    <div className="print-page relative mx-auto w-full max-w-[210mm] overflow-hidden rounded-2xl border border-border/70 bg-white p-[12mm] text-neutral-900 shadow-soft">
      {cancelled && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="-rotate-[24deg] rounded-xl border-4 border-red-600/50 px-8 py-2 font-display text-6xl font-bold tracking-widest text-red-600/40">CANCELLED</div>
        </div>
      )}
      {children}
    </div>
  );
}

function InvoiceView() {
  const { id } = useParams();
  const db = useDb();
  const now = useNow();
  const canCancel = useCan("invoices.cancel");
  const canRecord = useCan("outletPayments.record");
  const [cancelOpen, setCancelOpen] = useState(false);
  const inv = db.invoices.find((i) => i.id === id);
  usePageTitle(inv ? `Invoice ${inv.id}` : "Invoice");
  if (!inv) return <NotFound />;
  const outlet = db.outlets.find((o) => o.id === inv.outletId);
  const order = db.outletOrders.find((o) => o.id === inv.orderId);
  const address = outlet?.deliveryAddresses.find((a) => a.id === order?.deliveryAddressId);
  const status = shownInvoiceStatus(db, inv, now);
  const payments = db.outletPayments.filter((p) => p.invoiceId === inv.id).sort((a, b) => a.date.localeCompare(b.date));
  const paid = paidOn(db, inv.id);
  const c = db.settings.company;
  const pay = db.settings.payments;
  const track = db.settings.outlets.trackPayments;
  const by = issuedBy(db, inv);
  const taxRates = [...new Set(inv.lines.map((l) => db.products.find((p) => p.id === l.productId)?.taxRate ?? 0))];

  return (
    <div className="animate-rise space-y-4">
      <PrintOnlyDocument />
      <Toolbar back={{ to: "/staff/invoices", label: "Invoices" }}>
        <Button variant="outline" nativeButton={false} render={<Link to={`/staff/delivery-notes/${inv.deliveryNoteId}`} />}>
          <FileText className="size-4" /> Delivery note
        </Button>
        <Button onClick={() => window.print()}>
          <Printer className="size-4" /> Print
        </Button>
      </Toolbar>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Paper cancelled={inv.status === "cancelled"}>
          <CompanyHeader title={c.vatNo ? "TAX INVOICE" : "INVOICE"} number={inv.id}>
            <table className="ml-auto mt-3 text-[11px] text-neutral-700">
              <tbody>
                <DocRow k="Invoice date" v={date(inv.date)} />
                <DocRow k="Due date" v={date(inv.dueDate)} />
                <DocRow k="Payment terms" v={outlet?.paymentTerms ?? ""} />
                <DocRow k="Your PO" v={order?.poNumber ?? ""} />
                <DocRow k="Our order" v={inv.orderId} />
                <DocRow k="Delivery note" v={inv.deliveryNoteId} />
              </tbody>
            </table>
          </CompanyHeader>

          <div className="mt-5 grid grid-cols-2 gap-6 text-[12px]">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Bill to</div>
              <div className="mt-1 font-semibold">{outlet?.name}</div>
              <div className="text-neutral-700">{outlet?.billingAddress}</div>
              <div className="text-neutral-700">Attn: {outlet?.contactPerson}</div>
              {outlet?.taxId && <div className="text-neutral-700">VAT / Tax ID {outlet.taxId}</div>}
              <div className="text-neutral-500">Customer ID {outlet?.id}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Delivered to</div>
              <div className="mt-1 font-semibold">{address?.label ?? outlet?.name}</div>
              <div className="text-neutral-700">{address ? addressLine(address.address, address.city) : ""}</div>
            </div>
          </div>

          <table className="mt-6 w-full text-[12px]">
            <thead>
              <tr className="border-y border-neutral-300 bg-neutral-50 text-left text-[10.5px] uppercase tracking-wide text-neutral-600">
                <th className="px-2 py-2 font-semibold">#</th>
                <th className="px-2 py-2 font-semibold">Item</th>
                <th className="px-2 py-2 text-right font-semibold">Qty</th>
                <th className="px-2 py-2 text-right font-semibold">Unit price</th>
                <th className="px-2 py-2 text-right font-semibold">Discount</th>
                <th className="px-2 py-2 text-right font-semibold">Tax</th>
                <th className="px-2 py-2 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((l, i) => (
                <tr key={l.productId} className="border-b border-neutral-200">
                  <td className="px-2 py-2 text-neutral-500">{i + 1}</td>
                  <td className="px-2 py-2">
                    <div className="font-medium">{productName(db, l.productId)}</div>
                    <div className="text-[10.5px] text-neutral-500">{l.productId}</div>
                  </td>
                  <td className="px-2 py-2 text-right tabular">{num(l.qty)}</td>
                  <td className="px-2 py-2 text-right tabular">{lkr(l.unitPrice, { prefix: false })}</td>
                  <td className="px-2 py-2 text-right tabular">{l.discount ? lkr(l.discount, { prefix: false }) : "-"}</td>
                  <td className="px-2 py-2 text-right tabular">{l.tax ? lkr(l.tax, { prefix: false }) : "-"}</td>
                  <td className="px-2 py-2 text-right font-medium tabular">{lkr(l.total, { prefix: false })}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 flex justify-end">
            <table className="w-72 text-[12px]">
              <tbody>
                <TotRow k="Subtotal" v={lkr(inv.subtotal)} />
                <TotRow k="Discount" v={inv.discount ? `- ${lkr(inv.discount)}` : lkr(0)} />
                <TotRow k={`Tax${taxRates.length === 1 ? ` (${taxRates[0]}%)` : ""}`} v={lkr(inv.tax)} />
                <tr className="border-t-2 border-neutral-800">
                  <td className="px-2 pt-2 text-[13px] font-bold">Total</td>
                  <td className="px-2 pt-2 text-right text-[13px] font-bold tabular">{lkr(inv.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-2 text-right text-[11px] italic text-neutral-600">{amountInWords(inv.total)}</div>

          {inv.notes && (
            <div className="mt-6 rounded-lg border border-neutral-300 p-3 text-[11px] text-neutral-700">
              <span className="font-semibold">Notes: </span>
              {inv.notes}
            </div>
          )}

          <div className="mt-8 grid grid-cols-2 gap-6 text-[11px] text-neutral-700">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">How to pay</div>
              <div className="mt-1">
                Bank transfer to {pay.bankAccountName}, {pay.bankName}, account {pay.bankAccountNumber}, or cheque in favour of {c.name}.
              </div>
              <div className="mt-1">Quote {inv.id} as the reference.</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Terms</div>
              <div className="mt-1">{c.invoiceTerms}</div>
            </div>
          </div>

          <div className="mt-14 grid grid-cols-2 gap-10 text-[11px] text-neutral-600">
            <div>
              <div className="h-6 text-[12px] text-neutral-800">{actorName(db, by)}</div>
              <div className="border-t border-neutral-400 pt-1">Prepared by</div>
            </div>
            <div>
              <div className="h-6" />
              <div className="border-t border-neutral-400 pt-1">Authorised signature</div>
            </div>
          </div>
          <div className="mt-8 text-center text-[10px] text-neutral-400">This is a computer generated invoice. {c.brand} · {c.email}</div>
        </Paper>

        <div className="no-print space-y-4">
          <Panel title="Status">
            <div className="mb-3">
              <Status>{status}</Status>
            </div>
            <KeyValue
              cols={1}
              items={[
                ["Total", lkr(inv.total)],
                ...(track
                  ? ([
                      ["Paid", lkr(paid)],
                      ["Balance", <span className="font-display text-lg font-semibold">{lkr(invoiceBalance(db, inv))}</span>],
                    ] as [ReactNode, ReactNode][])
                  : []),
                ...(status === "Overdue" ? ([["Overdue by", `${daysOverdue(inv, now)} days`]] as [ReactNode, ReactNode][]) : []),
                ["Issued", `${dateTime(inv.date)}${by ? ` by ${actorName(db, by)}` : ""}`],
                [
                  "Emailed",
                  inv.emailedAt ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Mail className="size-3.5" /> {dateTime(inv.emailedAt)} to {outlet?.email}
                    </span>
                  ) : (
                    "No email on file: printed and handed over"
                  ),
                ],
                ...(inv.status === "cancelled" ? ([["Cancelled", inv.cancelReason]] as [ReactNode, ReactNode][]) : []),
              ]}
            />
            <div className="mt-4 grid gap-2">
              {track && canRecord && inv.status === "issued" && invoiceBalance(db, inv) > 0 && (
                <Button nativeButton={false} render={<Link to={`/staff/outlet-payments?invoice=${inv.id}`} />}>
                  <Wallet className="size-4" /> Record a payment
                </Button>
              )}
              <Button variant="outline" nativeButton={false} render={<Link to={`/staff/outlet-orders/${inv.orderId}`} />}>
                <ReceiptText className="size-4" /> Open order {inv.orderId}
              </Button>
              <Button variant="outline" nativeButton={false} render={<Link to={`/staff/dispatch/${inv.dispatchId}`} />}>
                <Truck className="size-4" /> Open dispatch
              </Button>
              {canCancel && inv.status === "issued" && (
                <Button variant="destructive" onClick={() => setCancelOpen(true)} disabled={paid > 0} title={paid > 0 ? "Payments are recorded against this invoice" : undefined}>
                  <Ban className="size-4" /> Cancel invoice
                </Button>
              )}
              {canCancel && inv.status === "issued" && paid > 0 && <p className="text-xs text-muted-foreground">Payments are recorded against this invoice, so it can't be cancelled.</p>}
            </div>
          </Panel>
          {track && payments.length > 0 && (
            <Panel title="Payments received" bodyClassName="p-0">
              <ul className="divide-y divide-border/60 text-sm">
                {payments.map((p) => (
                  <li key={p.id} className="flex justify-between gap-3 px-5 py-3">
                    <div>
                      <div className="font-medium">{p.id}</div>
                      <div className="text-xs text-muted-foreground">
                        {date(p.date)} · {p.method}
                        {p.reference ? ` · ${p.reference}` : ""}
                      </div>
                      {p.notes && <div className="text-xs italic text-muted-foreground">{p.notes}</div>}
                    </div>
                    <div className="tabular">{lkr(p.amount)}</div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>

      <ReasonDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={`Cancel ${inv.id}?`}
        description={`The invoice for ${lkr(inv.total)} to ${outlet?.name} is marked cancelled and no longer counts in balances or revenue. Issue a corrected invoice from the dispatch if needed.`}
        confirmLabel="Cancel invoice"
        destructive
        placeholder="For example: wrong price on line 2, reissued"
        onConfirm={(reason) => done(actions.cancelInvoice(inv.id, reason), `${inv.id} cancelled`)}
      />
    </div>
  );
}

function DocRow({ k, v }: { k: string; v: string }) {
  return (
    <tr>
      <td className="pr-3 text-right text-neutral-500">{k}</td>
      <td className="text-right font-medium text-neutral-800">{v}</td>
    </tr>
  );
}

function TotRow({ k, v }: { k: string; v: string }) {
  return (
    <tr>
      <td className="px-2 py-1 text-neutral-600">{k}</td>
      <td className="px-2 py-1 text-right tabular">{v}</td>
    </tr>
  );
}

function DeliveryNoteView() {
  const { id } = useParams();
  const db = useDb();
  const canSeeInvoice = useCan("invoices.view");
  const canPod = useCan("pod.confirm");
  const inv = db.invoices.find((i) => i.deliveryNoteId === id);
  usePageTitle(inv ? `Delivery note ${inv.deliveryNoteId}` : "Delivery note");
  if (!inv) return <NotFound />;
  const x = db.dispatches.find((d) => d.id === inv.dispatchId);
  const outlet = db.outlets.find((o) => o.id === inv.outletId);
  const order = db.outletOrders.find((o) => o.id === inv.orderId);
  const address = outlet?.deliveryAddresses.find((a) => a.id === order?.deliveryAddressId);
  const c = db.settings.company;
  const lines = x?.lines ?? [];
  const units = lines.reduce((s, l) => s + l.qty, 0);

  return (
    <div className="animate-rise space-y-4">
      <PrintOnlyDocument />
      <Toolbar back={{ to: order ? `/staff/outlet-orders/${order.id}` : "/staff/invoices", label: order ? `Order ${order.id}` : "Invoices" }}>
        {canSeeInvoice && (
          <Button variant="outline" nativeButton={false} render={<Link to={`/staff/invoices/${inv.id}`} />}>
            <ReceiptText className="size-4" /> Invoice
          </Button>
        )}
        <Button onClick={() => window.print()}>
          <Printer className="size-4" /> Print
        </Button>
      </Toolbar>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Paper>
          <CompanyHeader title="DELIVERY NOTE" number={inv.deliveryNoteId}>
            <div className="mt-2 flex justify-end text-neutral-900">
              <Barcode value={inv.deliveryNoteId} height={34} showText={false} className="text-neutral-900" />
            </div>
            <table className="ml-auto mt-2 text-[11px] text-neutral-700">
              <tbody>
                <DocRow k="Date" v={date(x?.dispatchedAt ?? inv.date)} />
                <DocRow k="Your PO" v={order?.poNumber ?? ""} />
                <DocRow k="Our order" v={inv.orderId} />
                <DocRow k="Invoice" v={inv.id} />
                {x?.vehicle && <DocRow k="Vehicle" v={x.vehicle} />}
                {x?.driver && <DocRow k="Driver" v={x.driver} />}
              </tbody>
            </table>
          </CompanyHeader>

          <div className="mt-5 grid grid-cols-2 gap-6 text-[12px]">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Deliver to</div>
              <div className="mt-1 font-semibold">{outlet?.name}</div>
              <div className="font-medium text-neutral-800">{address?.label}</div>
              <div className="text-neutral-700">{address ? addressLine(address.address, address.city) : ""}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Contact</div>
              <div className="mt-1">{outlet?.contactPerson}</div>
              <div className="text-neutral-700">{outlet?.mobile}</div>
              <div className="text-neutral-500">Customer ID {outlet?.id}</div>
            </div>
          </div>

          <table className="mt-6 w-full text-[12px]">
            <thead>
              <tr className="border-y border-neutral-300 bg-neutral-50 text-left text-[10.5px] uppercase tracking-wide text-neutral-600">
                <th className="px-2 py-2 font-semibold">#</th>
                <th className="px-2 py-2 font-semibold">Item</th>
                <th className="px-2 py-2 font-semibold">Batch</th>
                <th className="px-2 py-2 font-semibold">Expiry</th>
                <th className="px-2 py-2 text-right font-semibold">Qty sent</th>
                <th className="w-28 px-2 py-2 text-right font-semibold">Qty received</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={`${l.productId}-${l.batchId}`} className="border-b border-neutral-200">
                  <td className="px-2 py-2 text-neutral-500">{i + 1}</td>
                  <td className="px-2 py-2">
                    <div className="font-medium">{productName(db, l.productId)}</div>
                    <div className="text-[10.5px] text-neutral-500">{l.productId}</div>
                  </td>
                  <td className="px-2 py-2 font-mono text-[11px]">{l.batchId}</td>
                  <td className="px-2 py-2">{date(batchOf(db, l.batchId)?.expiryDate)}</td>
                  <td className="px-2 py-2 text-right font-medium tabular">{num(l.qty)}</td>
                  <td className="px-2 py-2">
                    <div className="ml-auto h-5 w-20 border-b border-dotted border-neutral-400" />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="px-2 pt-2 text-right font-semibold">
                  Total units
                </td>
                <td className="px-2 pt-2 text-right font-bold tabular">{num(units)}</td>
                <td />
              </tr>
            </tfoot>
          </table>

          <div className="mt-6 rounded-lg border border-neutral-300 p-3 text-[11px] text-neutral-700">
            Please count the goods before signing. Write any shortage or damage on this note. {c.invoiceTerms.split(".")[0]}.
          </div>

          <div className="mt-12 grid grid-cols-3 gap-8 text-[11px] text-neutral-600">
            <div>
              <div className="h-6 text-[12px] text-neutral-800">{x?.driver}</div>
              <div className="border-t border-neutral-400 pt-1">Delivered by</div>
            </div>
            <div>
              <div className="h-6" />
              <div className="border-t border-neutral-400 pt-1">Received by (name and signature)</div>
            </div>
            <div>
              <div className="h-6" />
              <div className="border-t border-neutral-400 pt-1">Date and outlet stamp</div>
            </div>
          </div>
          <div className="mt-8 text-center text-[10px] text-neutral-400">
            {c.name} · {c.address} · {c.phone}
          </div>
        </Paper>

        <div className="no-print space-y-4">
          <Panel title="Delivery">
            <div className="mb-3">
              <Status>{x ? dispatchStatusLabel(x) : "Prepared"}</Status>
            </div>
            <KeyValue
              cols={1}
              items={[
                ["Units", num(units)],
                ["Dispatched", x?.dispatchedAt ? dateTime(x.dispatchedAt) : "Not yet"],
                ["Vehicle and driver", x?.vehicle ? `${x.vehicle}, ${x.driver}` : ""],
                ...(x?.pod?.confirmedAt
                  ? ([
                      ["Received by", x.receivedBy ?? "Not recorded"],
                      ["Confirmed", `${dateTime(x.pod.confirmedAt)} by ${actorName(db, x.pod.confirmedBy)}`],
                      ["Difference", x.pod.differenceNote ?? "None"],
                    ] as [ReactNode, ReactNode][])
                  : []),
              ]}
            />
            {x?.status === "dispatched" && canPod && (
              <Button className="mt-4 w-full" nativeButton={false} render={<Link to={`/staff/pod/${x.id}`} />}>
                Upload the signed note
              </Button>
            )}
          </Panel>
          {x?.pod?.confirmedAt && (
            <Panel title="Signed note">
              <SignedNoteImage
                noteNo={inv.deliveryNoteId}
                outlet={outlet?.name ?? ""}
                lines={Object.entries(x.pod.confirmedQty ?? x.pod.readQty).map(([pid, q]) => ({
                  name: productName(db, pid),
                  qty: lines.filter((l) => l.productId === pid).reduce((s, l) => s + l.qty, 0),
                  received: q,
                }))}
                difference={x.pod.docImage === "pod-difference"}
              />
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
