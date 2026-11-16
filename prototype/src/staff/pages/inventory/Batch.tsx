// S22 Batch page: dates, stock per channel, every order the batch went to and a recall list.

import { useMemo } from "react";
import { Link, useParams } from "react-router";
import { CalendarClock, FileSpreadsheet, Printer, Truck } from "lucide-react";
import { useDb } from "@/domain/db";
import { batchOf, batchTrace, CHANNEL_LABEL, productName } from "@/domain/stock";
import { consultantById, fullName } from "@/domain/consultants";
import { consultantCode, date, dateTime, daysBetween, num } from "@/domain/format";
import { actorName, downloadExcel, useNow } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { Guard, NotFound } from "@/staff/guard";
import { EmptyState, KeyValue, Kpi, PageHeader, Panel, SimpleTable, Status, StatusBadge } from "@/components/fc/ui";
import { Button } from "@/components/ui/button";
import { ChannelBadge, PrintFrame, ProductCell, channelName, daysLeftTone } from "./shared";
import { batchStock } from "@/domain/ext/inventory";
import { MOVEMENT_LABEL } from "@/domain/lists";

export function BatchPage() {
  return (
    <Guard perms={["stock.view.all"]}>
      <BatchView />
    </Guard>
  );
}

function BatchView() {
  const { id = "" } = useParams();
  const db = useDb();
  const now = useNow();
  const b = batchOf(db, id);
  usePageTitle(b ? `Batch ${b.id}` : "Batch");
  const trace = useMemo(
    () =>
      batchTrace(db, id).map(({ dispatch: x, qty }) => {
        if (x.channel === "outlet") {
          const o = db.outletOrders.find((y) => y.id === x.orderId);
          const outlet = db.outlets.find((y) => y.id === o?.outletId);
          return {
            id: x.id,
            when: x.dispatchedAt ?? x.createdAt,
            channel: x.channel,
            orderId: x.orderId,
            orderHref: `/staff/outlet-orders/${x.orderId}`,
            customer: outlet?.name ?? "",
            contact: outlet?.contactPerson ?? "",
            phone: outlet?.mobile ?? "",
            email: outlet?.email ?? "",
            qty,
            status: x.status === "delivered" ? "Delivered" : "Dispatched",
          };
        }
        const o = db.consultantOrders.find((y) => y.id === x.orderId);
        const c = consultantById(db, o?.consultantId);
        return {
          id: x.id,
          when: x.dispatchedAt ?? x.createdAt,
          channel: x.channel,
          orderId: x.orderId,
          orderHref: `/staff/consultant-orders/${x.orderId}`,
          customer: c ? `${fullName(c)} (${consultantCode(c.number)})` : "",
          contact: c ? fullName(c) : "",
          phone: c?.mobile ?? "",
          email: c?.email ?? "",
          qty,
          status: x.status === "delivered" ? "Delivered" : "Dispatched",
        };
      }),
    [db, id],
  );
  if (!b) return <NotFound />;
  const p = db.products.find((x) => x.id === b.productId);
  const grn = db.grns.find((g) => g.id === b.grnId);
  const stock = batchStock(db, b.id);
  const days = daysBetween(now, b.expiryDate);
  const warn = db.settings.stock.expiryWarnDays;
  const outQty = trace.reduce((s, t) => s + t.qty, 0);
  const moves = db.movements.filter((m) => m.batchId === b.id);
  const recall = () =>
    downloadExcel(
      `recall-list-${b.id}.xlsx`,
      ["Channel", "Customer", "Contact", "Mobile", "Email", "Order", "Dispatch", "Dispatched", "Quantity"],
      trace.map((t) => [CHANNEL_LABEL[t.channel], t.customer, t.contact, t.phone, t.email, t.orderId, t.id, date(t.when), t.qty]),
      "Recall list",
    );
  return (
    <div className="animate-rise">
      <PrintFrame />
      <PageHeader
        back={{ to: "/staff/stock", label: "Stock" }}
        eyebrow={`Batch ${b.id}`}
        title={productName(db, b.productId)}
        description={`Made ${date(b.mfgDate)}, expires ${date(b.expiryDate)}. Received on ${grn ? grn.id : "the opening stock"}.`}
        actions={
          <div className="no-print flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="size-4" /> Print
            </Button>
            <Button size="sm" onClick={() => void recall()} disabled={!trace.length}>
              <FileSpreadsheet className="size-4" /> Recall list
            </Button>
          </div>
        }
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Days to expiry" value={num(days)} sub={date(b.expiryDate)} icon={<CalendarClock className="size-5" />} tone={daysLeftTone(days, warn) === "success" ? "success" : "warning"} />
        {stock.map((s) => (
          <Kpi key={s.channel} label={`In stock, ${channelName(db, s.channel).toLowerCase()}`} value={num(s.onHand)} sub={`${num(s.reserved)} reserved, ${num(s.available)} available`} tone={s.channel === "outlet" ? "info" : "plum"} />
        ))}
        <Kpi label="Sent to customers" value={num(outQty)} sub={`${trace.length} deliveries`} icon={<Truck className="size-5" />} />
      </div>
      <div className="mb-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel title="Batch details">
          <KeyValue
            items={[
              ["Product", p ? <ProductCell db={db} id={p.id} /> : b.productId],
              ["Batch number", b.id],
              ["Manufacturing date", date(b.mfgDate)],
              ["Expiry date", <span className="inline-flex items-center gap-2">{date(b.expiryDate)} <StatusBadge tone={daysLeftTone(days, warn)} dot={false}>{num(days)} days left</StatusBadge></span>],
              ["Goods received note", grn ? <Link to={`/staff/grn/${grn.id}`} className="text-primary hover:underline">{grn.id}</Link> : "Opening stock"],
              ["Production reference", grn?.productionRef],
              ["Received by", grn ? actorName(db, grn.receivedBy) : ""],
              ["Received on", grn ? dateTime(grn.ts) : ""],
            ]}
          />
        </Panel>
        <Panel title="Movements in this batch" bodyClassName="p-0">
          <div className="max-h-[300px] overflow-y-auto">
            <table className="w-full text-sm">
              <tbody>
                {moves.slice(0, 60).map((m) => (
                  <tr key={m.id} className="border-b border-border/50 last:border-0">
                    <td className="px-5 py-2 text-xs text-muted-foreground">{date(m.ts)}</td>
                    <td className="px-2 py-2">{MOVEMENT_LABEL[m.type] ?? m.type}</td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">{CHANNEL_LABEL[m.channel]}</td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">{m.refId}</td>
                    <td className={`px-5 py-2 text-right tabular font-medium ${m.qtyIn ? "text-success" : ""}`}>{m.qtyIn ? `+${num(m.qtyIn)}` : `-${num(m.qtyOut)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!moves.length && <p className="p-5 text-sm text-muted-foreground">No movements yet.</p>}
          </div>
        </Panel>
      </div>
      <Panel title="Where this batch went" description="Every delivery that took stock from this batch. The recall list adds each customer's contact details." bodyClassName="p-4">
        <SimpleTable
          rows={trace}
          rowKey={(t) => t.id}
          defaultSort={{ key: "when", dir: "desc" }}
          columns={[
            { key: "when", header: "Dispatched", cell: (t) => date(t.when), value: (t) => t.when },
            { key: "channel", header: "Channel", cell: (t) => <ChannelBadge channel={t.channel} />, value: (t) => CHANNEL_LABEL[t.channel] },
            { key: "customer", header: "Customer", cell: (t) => t.customer, value: (t) => t.customer },
            { key: "order", header: "Order", cell: (t) => <Link to={t.orderHref} className="text-primary hover:underline">{t.orderId}</Link>, value: (t) => t.orderId },
            { key: "dispatch", header: "Dispatch", cell: (t) => <Link to={`/staff/dispatch/${t.id}`} className="hover:underline">{t.id}</Link>, value: (t) => t.id, hideOnMobile: true },
            { key: "phone", header: "Mobile", cell: (t) => t.phone, value: (t) => t.phone, hideOnMobile: true },
            { key: "qty", header: "Qty", align: "right", cell: (t) => num(t.qty), value: (t) => t.qty },
            { key: "status", header: "Status", cell: (t) => <Status>{t.status}</Status>, value: (t) => t.status },
          ]}
          empty={<EmptyState title="Not sent to anyone yet" description="Deliveries that pick from this batch appear here." />}
        />
      </Panel>
    </div>
  );
}
