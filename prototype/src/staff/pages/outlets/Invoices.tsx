// S11 Invoices: one per outlet delivery, with status tabs and balances.

import { useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ReceiptText } from "lucide-react";
import { useDb } from "@/domain/db";
import { daysOverdue, invoiceBalance, outletName, paidOn } from "@/domain/outlets";
import type { Invoice } from "@/domain/types";
import { date, lkr, lkrShort, monthKey, monthLabel } from "@/domain/format";
import { invoiced } from "@/domain/ext/outlets";
import { useNow } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { Guard } from "../../guard";
import { EmptyState, FilterTabs, Kpi, PageHeader, SimpleTable, Status, type Column } from "@/components/fc/ui";
import { shownInvoiceStatus } from "./shared";

const ALL_TABS = ["All", "Issued", "Part Paid", "Overdue", "Paid", "Cancelled"] as const;

export function Invoices() {
  return (
    <Guard perms={["invoices.view"]}>
      <Page />
    </Guard>
  );
}

function Page() {
  usePageTitle("Invoices");
  const db = useDb();
  const now = useNow();
  const navigate = useNavigate();
  const track = db.settings.outlets.trackPayments;
  const [params, setParams] = useSearchParams();
  const tabs = track ? ALL_TABS : (["All", "Issued", "Cancelled"] as const);
  const asked = params.get("status") ?? "All";
  const tab = (tabs as readonly string[]).includes(asked) ? asked : "All";
  const month = monthKey(now);

  const withStatus = useMemo(() => db.invoices.map((i) => ({ i, s: shownInvoiceStatus(db, i, now) })), [db, now]);
  const rows = tab === "All" ? withStatus : withStatus.filter((r) => r.s === tab);
  const outstanding = db.invoices.reduce((s, i) => s + (i.status === "issued" ? invoiceBalance(db, i) : 0), 0);
  const overdue = withStatus.filter((r) => r.s === "Overdue");

  const columns: Column<{ i: Invoice; s: string }>[] = [
    { key: "id", className: "whitespace-nowrap", header: "Invoice", value: (r) => r.i.id, cell: (r) => r.i.id },
    { key: "date", className: "whitespace-nowrap", header: "Date", value: (r) => r.i.date, cell: (r) => date(r.i.date) },
    {
      key: "outlet",
      header: "Outlet",
      value: (r) => outletName(db, r.i.outletId),
      cell: (r) => (
        <Link to={`/staff/outlets/${r.i.outletId}`} onClick={(e) => e.stopPropagation()} className="hover:text-primary">
          {outletName(db, r.i.outletId)}
        </Link>
      ),
    },
    { key: "po", className: "whitespace-nowrap", header: "PO", value: (r) => db.outletOrders.find((o) => o.id === r.i.orderId)?.poNumber ?? "", cell: (r) => db.outletOrders.find((o) => o.id === r.i.orderId)?.poNumber, hideOnMobile: true },
    { key: "total", className: "whitespace-nowrap", header: "Total", align: "right", value: (r) => r.i.total, cell: (r) => lkr(r.i.total) },
    ...(track
      ? ([
          { key: "paid", className: "whitespace-nowrap", header: "Paid", align: "right", value: (r) => paidOn(db, r.i.id), cell: (r) => (paidOn(db, r.i.id) ? lkr(paidOn(db, r.i.id)) : <span className="text-muted-foreground">0.00</span>), hideOnMobile: true },
          { key: "balance", className: "whitespace-nowrap", header: "Balance", align: "right", value: (r) => invoiceBalance(db, r.i), cell: (r) => <span className="font-medium">{lkr(invoiceBalance(db, r.i))}</span> },
        ] as Column<{ i: Invoice; s: string }>[])
      : []),
    {
      key: "due", className: "whitespace-nowrap",
      header: "Due",
      value: (r) => r.i.dueDate,
      cell: (r) => (
        <span>
          {date(r.i.dueDate)}
          {r.s === "Overdue" && <span className="block text-xs text-destructive">{daysOverdue(r.i, now)} days overdue</span>}
        </span>
      ),
    },
    { key: "status", className: "whitespace-nowrap", header: "Status", value: (r) => r.s, cell: (r) => <Status>{r.s}</Status> },
  ];

  return (
    <div className="animate-rise space-y-6">
      <PageHeader title="Invoices" description="One invoice and one delivery note for each outlet delivery, for the quantity actually supplied." />
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label={`Invoiced, ${monthLabel(month)}`} value={lkrShort(invoiced(db, (i) => monthKey(i.date) === month))} sub={`${db.invoices.filter((i) => monthKey(i.date) === month && i.status !== "cancelled").length} invoices`} icon={<ReceiptText className="size-5" />} />
        {track && <Kpi label="Outstanding" value={lkrShort(outstanding)} sub={lkr(outstanding)} tone="info" to="/staff/outlet-payments" />}
        {track && <Kpi label="Overdue" value={lkrShort(overdue.reduce((s, r) => s + invoiceBalance(db, r.i), 0))} sub={`${overdue.length} invoice${overdue.length === 1 ? "" : "s"}`} tone="danger" />}
      </div>
      <FilterTabs
        value={tab}
        onChange={(v) => {
          const next = new URLSearchParams(params);
          if (v === "All") next.delete("status");
          else next.set("status", v);
          setParams(next, { replace: true });
        }}
        options={tabs.map((t) => ({ value: t as string, label: t, count: t === "All" ? withStatus.length : withStatus.filter((r) => r.s === t).length }))}
      />
      <SimpleTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.i.id}
        rowHref={(r) => `/staff/invoices/${r.i.id}`}
        onRowClick={(r) => navigate(`/staff/invoices/${r.i.id}`)}
        defaultSort={tab === "Overdue" ? { key: "due", dir: "asc" } : { key: "date", dir: "desc" }}
        searchText={(r) => `${r.i.id} ${r.i.deliveryNoteId} ${outletName(db, r.i.outletId)} ${db.outletOrders.find((o) => o.id === r.i.orderId)?.poNumber ?? ""}`}
        exportName="invoices"
        empty={<EmptyState icon={<ReceiptText className="size-5" />} title={tab === "Overdue" ? "Nothing overdue" : "No invoices here"} description="Invoices are issued from the dispatch page once an outlet order is packed." />}
      />
    </div>
  );
}
