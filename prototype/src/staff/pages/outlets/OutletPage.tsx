// S5 Outlet page: KPIs and tabs for orders, invoices, payments, delivery notes and lost sales.

import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Mail, Pencil, Phone, Plus } from "lucide-react";
import { useDb } from "@/domain/db";
import { invoiceBalance, orderTotals, orderValue, outletBalance, paidOn } from "@/domain/outlets";
import { productName } from "@/domain/stock";
import { addressLine, date, dateTime, lkr, lkrShort, monthKey, monthLabel, num } from "@/domain/format";
import { invoiced, isOrderOverdue, lostSales, openUnits, overdueAmount } from "@/domain/ext/outlets";
import { actorName, useCan, useNow } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { Guard, NotFound } from "../../guard";
import { EmptyState, FilterTabs, KeyValue, Kpi, PageHeader, Panel, ProgressBar, SimpleTable, Status, StatusBadge } from "@/components/fc/ui";
import { Button } from "@/components/ui/button";
import type { Dispatch, Invoice, OutletOrder, OutletPayment } from "@/domain/types";
import { OUTLET_STATUS_LABEL, OrderStatusBadge, shownInvoiceStatus, useTrackPayments } from "./shared";
import { dispatchStatusLabel, orderStatusLabel } from "@/domain/lists";

type Tab = "orders" | "invoices" | "payments" | "notes" | "lost";

export function OutletPage() {
  return (
    <Guard perms={["outlets.view"]}>
      <Page />
    </Guard>
  );
}

function Page() {
  const { id } = useParams();
  const db = useDb();
  const now = useNow();
  const navigate = useNavigate();
  const track = useTrackPayments();
  const canEdit = useCan("outlets.edit");
  const canOrder = useCan("outletOrders.edit");
  const outlet = db.outlets.find((o) => o.id === id);
  usePageTitle(outlet?.name ?? "Outlet");
  const [tab, setTab] = useState<Tab>("orders");

  const d = useMemo(() => {
    if (!outlet) return undefined;
    const orders = db.outletOrders.filter((o) => o.outletId === outlet.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const invoices = db.invoices.filter((i) => i.outletId === outlet.id);
    const payments = db.outletPayments.filter((p) => p.outletId === outlet.id);
    const notes = db.dispatches.filter((x) => x.channel === "outlet" && x.deliveryNoteId && orders.some((o) => o.id === x.orderId));
    const month = monthKey(now);
    const year = month.slice(0, 4);
    const live = orders.filter((o) => o.status !== "cancelled");
    return {
      orders,
      invoices,
      payments,
      notes,
      lost: lostSales(db, outlet.id),
      revMonth: invoiced(db, (i) => i.outletId === outlet.id && monthKey(i.date) === month),
      revYear: invoiced(db, (i) => i.outletId === outlet.id && monthKey(i.date).startsWith(year)),
      openOrders: live.filter((o) => openUnits(o) > 0).length,
      backUnits: live.reduce((s, o) => s + orderTotals(o).backordered, 0),
      balance: outletBalance(db, outlet.id),
      overdue: overdueAmount(db, now, outlet.id),
      month,
      year,
    };
  }, [db, outlet, now]);

  if (!outlet || !d) return <NotFound />;

  const usage = outlet.creditLimit ? d.balance / outlet.creditLimit : 0;

  return (
    <div className="animate-rise space-y-6">
      <PageHeader
        back={{ to: "/staff/outlets", label: "Outlets" }}
        eyebrow={`${outlet.id} · ${outlet.type}`}
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            {outlet.name}
            {outlet.status !== "active" && <Status>{OUTLET_STATUS_LABEL[outlet.status]}</Status>}
          </span>
        }
        description={`${outlet.city}, ${outlet.district} district · ${outlet.paymentTerms} · customer since ${date(outlet.since)}`}
        actions={
          <>
            {canEdit && (
              <Button variant="outline" nativeButton={false} render={<Link to={`/staff/outlets/${outlet.id}/edit`} />}>
                <Pencil className="size-4" /> Edit
              </Button>
            )}
            {canOrder && outlet.status !== "inactive" && (
              <Button nativeButton={false} render={<Link to={`/staff/outlet-orders/new?outlet=${outlet.id}`} />}>
                <Plus className="size-4" /> New order
              </Button>
            )}
          </>
        }
      />

      {outlet.status === "on_hold" && (
        <div className="rounded-2xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm">
          <span className="font-medium">This outlet is on hold.</span> New orders are saved On Hold and nothing is picked until the hold is released.
          {outlet.notes ? <span className="text-muted-foreground"> {outlet.notes}</span> : null}
        </div>
      )}

      <div className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-3 ${track ? "2xl:grid-cols-6" : "2xl:grid-cols-4"}`}>
        <Kpi label={`Revenue, ${monthLabel(d.month, false)}`} value={lkrShort(d.revMonth)} sub={lkr(d.revMonth)} />
        <Kpi label={`Revenue, ${d.year} to date`} value={lkrShort(d.revYear)} sub={lkr(d.revYear)} tone="success" />
        <Kpi label="Open orders" value={num(d.openOrders)} sub={`${d.orders.length} orders in all`} tone="info" />
        <Kpi label="Back-ordered units" value={num(d.backUnits)} sub={d.backUnits ? "Waiting for stock" : "Nothing waiting"} tone="warning" to={d.backUnits ? "/staff/backorders" : undefined} />
        {track && <Kpi label="Balance due" value={lkrShort(d.balance)} sub={outlet.creditLimit ? `${Math.round(usage * 100)}% of the credit limit` : "No credit limit"} />}
        {track && <Kpi label="Overdue" value={lkrShort(d.overdue)} sub={d.overdue ? "Past the due date" : "Nothing overdue"} tone="danger" />}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-4 xl:col-span-2">
          <FilterTabs<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: "orders", label: "Orders", count: d.orders.length },
              { value: "invoices", label: "Invoices", count: d.invoices.length },
              ...(track ? [{ value: "payments" as Tab, label: "Payments", count: d.payments.length }] : []),
              { value: "notes", label: "Delivery notes", count: d.notes.length },
              { value: "lost", label: "Lost sales", count: d.lost.length },
            ]}
          />
          {tab === "orders" && (
            <SimpleTable<OutletOrder>
              rows={d.orders}
              rowKey={(o) => o.id}
              rowHref={(o) => `/staff/outlet-orders/${o.id}`}
              onRowClick={(o) => navigate(`/staff/outlet-orders/${o.id}`)}
              pageSize={10}
              searchText={(o) => `${o.id} ${o.poNumber}`}
              columns={[
                { key: "id", className: "whitespace-nowrap", header: "Order", value: (o) => o.id, cell: (o) => o.id },
                { key: "po", className: "whitespace-nowrap", header: "PO", value: (o) => o.poNumber, cell: (o) => o.poNumber },
                { key: "date", className: "whitespace-nowrap", header: "Entered", value: (o) => o.createdAt, cell: (o) => date(o.createdAt) },
                {
                  key: "req", className: "whitespace-nowrap",
                  header: "Required",
                  value: (o) => o.requiredDate,
                  cell: (o) => <span className={isOrderOverdue(o, now) ? "font-medium text-destructive" : ""}>{date(o.requiredDate)}</span>,
                },
                { key: "value", className: "whitespace-nowrap", header: "Value", align: "right", value: (o) => orderValue(o), cell: (o) => lkr(orderValue(o)) },
                { key: "back", className: "whitespace-nowrap", header: "Back-ordered", align: "right", value: (o) => orderTotals(o).backordered, cell: (o) => num(orderTotals(o).backordered) || "" },
                { key: "status", className: "whitespace-nowrap", header: "Status", value: (o) => orderStatusLabel(db, o), cell: (o) => <OrderStatusBadge order={o} /> },
              ]}
              empty={<EmptyState title="No orders yet" description="Enter this outlet's first PO to see it here." />}
            />
          )}
          {tab === "invoices" && (
            <SimpleTable<Invoice>
              rows={d.invoices}
              rowKey={(i) => i.id}
              rowHref={(i) => `/staff/invoices/${i.id}`}
              onRowClick={(i) => navigate(`/staff/invoices/${i.id}`)}
              pageSize={10}
              defaultSort={{ key: "date", dir: "desc" }}
              columns={[
                { key: "id", className: "whitespace-nowrap", header: "Invoice", value: (i) => i.id, cell: (i) => i.id },
                { key: "date", className: "whitespace-nowrap", header: "Date", value: (i) => i.date, cell: (i) => date(i.date) },
                { key: "due", className: "whitespace-nowrap", header: "Due", value: (i) => i.dueDate, cell: (i) => date(i.dueDate) },
                { key: "total", className: "whitespace-nowrap", header: "Total", align: "right", value: (i) => i.total, cell: (i) => lkr(i.total) },
                ...(track ? [{ key: "bal", className: "whitespace-nowrap", header: "Balance", align: "right" as const, value: (i: Invoice) => invoiceBalance(db, i), cell: (i: Invoice) => lkr(invoiceBalance(db, i)) }] : []),
                { key: "status", className: "whitespace-nowrap", header: "Status", value: (i) => shownInvoiceStatus(db, i, now), cell: (i) => <Status>{shownInvoiceStatus(db, i, now)}</Status> },
              ]}
              empty={<EmptyState title="No invoices yet" description="An invoice is issued with each delivery." />}
            />
          )}
          {tab === "payments" && track && (
            <SimpleTable<OutletPayment>
              rows={d.payments}
              rowKey={(p) => p.id}
              pageSize={10}
              defaultSort={{ key: "date", dir: "desc" }}
              columns={[
                { key: "id", className: "whitespace-nowrap", header: "Receipt", value: (p) => p.id, cell: (p) => <span className="font-medium">{p.id}</span> },
                { key: "date", className: "whitespace-nowrap", header: "Date", value: (p) => p.date, cell: (p) => date(p.date) },
                { key: "inv", className: "whitespace-nowrap", header: "Invoice", value: (p) => p.invoiceId, cell: (p) => <Link className="hover:text-primary" to={`/staff/invoices/${p.invoiceId}`}>{p.invoiceId}</Link> },
                { key: "method", className: "whitespace-nowrap", header: "Method", value: (p) => p.method, cell: (p) => p.method },
                { key: "ref", className: "whitespace-nowrap", header: "Reference", value: (p) => p.reference, cell: (p) => p.reference || <span className="text-muted-foreground">None</span> },
                { key: "notes", header: "Notes", value: (p) => p.notes ?? "", cell: (p) => <span className="text-muted-foreground">{p.notes}</span>, hideOnMobile: true },
                { key: "amount", className: "whitespace-nowrap", header: "Amount", align: "right", value: (p) => p.amount, cell: (p) => lkr(p.amount) },
              ]}
              empty={<EmptyState title="No payments recorded" description="Finance records receipts against this outlet's invoices." />}
            />
          )}
          {tab === "notes" && (
            <SimpleTable<Dispatch>
              rows={d.notes}
              rowKey={(x) => x.id}
              rowHref={(x) => `/staff/delivery-notes/${x.deliveryNoteId}`}
              onRowClick={(x) => navigate(`/staff/delivery-notes/${x.deliveryNoteId}`)}
              pageSize={10}
              defaultSort={{ key: "date", dir: "desc" }}
              columns={[
                { key: "dn", className: "whitespace-nowrap", header: "Delivery note", value: (x) => x.deliveryNoteId, cell: (x) => x.deliveryNoteId },
                { key: "order", className: "whitespace-nowrap", header: "Order", value: (x) => x.orderId, cell: (x) => x.orderId },
                { key: "date", className: "whitespace-nowrap", header: "Dispatched", value: (x) => x.dispatchedAt ?? x.createdAt, cell: (x) => (x.dispatchedAt ? date(x.dispatchedAt) : "Not yet") },
                { key: "units", className: "whitespace-nowrap", header: "Units", align: "right", value: (x) => x.lines.reduce((s, l) => s + l.qty, 0), cell: (x) => num(x.lines.reduce((s, l) => s + l.qty, 0)) },
                {
                  key: "pod", className: "whitespace-nowrap",
                  header: "Dispatch status",
                  value: (x) => x.status,
                  cell: (x) => (
                    <span className="inline-flex items-center gap-2">
                      <Status>{dispatchStatusLabel(x)}</Status>
                      {x.status === "dispatched" && <span className="text-xs text-muted-foreground">signed note due</span>}
                      {x.receivedBy && <span className="text-xs text-muted-foreground">by {x.receivedBy}</span>}
                    </span>
                  ),
                },
              ]}
              empty={<EmptyState title="No delivery notes yet" description="A delivery note is printed with each dispatch." />}
            />
          )}
          {tab === "lost" && (
            <SimpleTable
              rows={d.lost}
              rowKey={(l) => `${l.order.id}-${l.productId}`}
              pageSize={10}
              columns={[
                { key: "date", className: "whitespace-nowrap", header: "Recorded", value: (l) => l.date, cell: (l) => date(l.date) },
                { key: "order", className: "whitespace-nowrap", header: "Order", value: (l) => l.order.id, cell: (l) => <Link className="hover:text-primary" to={`/staff/outlet-orders/${l.order.id}`}>{l.order.id}</Link> },
                { key: "product", header: "Product", value: (l) => productName(db, l.productId), cell: (l) => productName(db, l.productId) },
                { key: "qty", className: "whitespace-nowrap", header: "Units", align: "right", value: (l) => l.qty, cell: (l) => num(l.qty) },
                { key: "value", className: "whitespace-nowrap", header: "Value", align: "right", value: (l) => l.value, cell: (l) => lkr(l.value) },
                { key: "reason", header: "Reason", value: (l) => l.reason, cell: (l) => l.reason },
              ]}
              empty={<EmptyState title="No lost sales" description="Balances this outlet declined appear here." />}
            />
          )}
        </div>

        <div className="space-y-6">
          <Panel title="Details">
            <KeyValue
              cols={1}
              items={[
                [
                  "Contact",
                  <span>
                    {outlet.contactPerson}
                    <span className="mt-1 flex flex-col gap-0.5 text-xs font-normal text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Phone className="size-3" /> {outlet.mobile}
                      </span>
                      {outlet.email ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Mail className="size-3" /> {outlet.email}
                        </span>
                      ) : (
                        <span>No email: invoices are printed and handed over</span>
                      )}
                    </span>
                  </span>,
                ],
                ["Billing address", outlet.billingAddress],
                [
                  `Delivery addresses (${outlet.deliveryAddresses.length})`,
                  <ul className="space-y-1">
                    {outlet.deliveryAddresses.map((a) => (
                      <li key={a.id}>
                        {a.label}
                        <span className="block text-xs font-normal text-muted-foreground">
                          {addressLine(a.address, a.city)}
                        </span>
                      </li>
                    ))}
                  </ul>,
                ],
                ["Tax / VAT ID", outlet.taxId],
                ["Payment terms", outlet.paymentTerms],
                [
                  "Credit limit",
                  outlet.creditLimit ? (
                    <span>
                      {lkr(outlet.creditLimit)}
                      {track && (
                        <>
                          <ProgressBar className="mt-1.5" value={d.balance} max={outlet.creditLimit} tone={usage > 1 ? "danger" : usage > 0.8 ? "warning" : "success"} />
                          <span className="mt-1 block text-xs font-normal text-muted-foreground">{lkr(d.balance)} used</span>
                        </>
                      )}
                    </span>
                  ) : (
                    "No credit limit"
                  ),
                ],
                ["Opening balance", lkr(outlet.openingBalance)],
                ["Notes", outlet.notes],
              ]}
            />
          </Panel>
          {track && d.payments.length > 0 && (
            <Panel title="Last payment">
              {(() => {
                const p = [...d.payments].sort((a, b) => b.date.localeCompare(a.date))[0];
                return (
                  <div className="text-sm">
                    <div className="font-display text-xl font-semibold tabular">{lkr(p.amount)}</div>
                    <div className="mt-1 text-muted-foreground">
                      {p.method} on {dateTime(p.date)} against {p.invoiceId}
                      {paidOn(db, p.invoiceId) > 0 && ` · recorded by ${actorName(db, p.receivedBy)}`}
                    </div>
                  </div>
                );
              })()}
            </Panel>
          )}
          {outlet.status === "inactive" && (
            <StatusBadge tone="neutral" dot={false}>
              Inactive outlets can't be chosen for new orders
            </StatusBadge>
          )}
        </div>
      </div>
    </div>
  );
}
