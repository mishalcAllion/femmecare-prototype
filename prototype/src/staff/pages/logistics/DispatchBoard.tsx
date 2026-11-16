// S14 Dispatch board: both channels from pick list to delivery, the orders
// waiting for a pick list, and the dispatch register in the workbook's columns.

import { useEffect, useMemo, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ClipboardList, PackagePlus, PauseCircle, Store, Truck, UserRound } from "lucide-react";
import { useDb } from "@/domain/db";
import { actions } from "@/domain/actions";
import { pickableQty, outletName } from "@/domain/outlets";
import { consultantById, fullName } from "@/domain/consultants";
import { dispatchStatusLabel } from "@/domain/lists";
import { CHANNEL_LABEL, productName } from "@/domain/stock";
import type { Channel, Db, Dispatch, DispatchStatus } from "@/domain/types";
import { addDays, consultantCode, date, lkr, num, relative, plural } from "@/domain/format";
import { act, useCan, useNow, useStaffUser } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { Guard } from "../../guard";
import { FilterTabs, PageHeader, SimpleTable, Status, StatusBadge } from "@/components/fc/ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { partyOf, scannedUnits, units } from "./shared";

type ChannelFilter = "all" | Channel;
type ColumnKey = "to_pick" | "packing" | "ready" | "dispatched" | "delivered" | "problem";

const COLUMNS: { key: ColumnKey; label: string; statuses: DispatchStatus[] }[] = [
  { key: "to_pick", label: "To pick", statuses: ["to_pick"] },
  { key: "packing", label: "Packing", statuses: ["packing"] },
  { key: "ready", label: "Ready", statuses: ["ready"] },
  { key: "dispatched", label: "Dispatched", statuses: ["dispatched"] },
  { key: "delivered", label: "Delivered", statuses: ["delivered"] },
  { key: "problem", label: "Failed and returned", statuses: ["failed", "returned"] },
];

export function DispatchBoard() {
  return (
    <Guard perms={["dispatch.view"]}>
      <Board />
    </Guard>
  );
}

function Board() {
  usePageTitle("Dispatch");
  const db = useDb();
  const now = useNow();
  const user = useStaffUser();
  const navigate = useNavigate();
  const canOutlet = useCan("dispatch.outlet");
  const canConsultant = useCan("dispatch.consultant");
  const [params, setParams] = useSearchParams();
  const label = db.settings.labels.consultant;
  const roleDefault: ChannelFilter = user?.roles.length === 1 && user.roles[0] === "operations" ? "consultant" : user?.roles.length === 1 && user.roles[0] === "outlet_sales" ? "outlet" : "all";
  const channel = (params.get("channel") as ChannelFilter) || roleDefault;
  const view = params.get("view") === "register" ? "register" : "board";
  const asked = params.get("column");
  const focus = (asked === "failed" || asked === "returned" ? "problem" : asked) as ColumnKey | null;
  const focusRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    focusRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [focus]);

  const waiting = useMemo(() => {
    const outlet = db.outletOrders
      .filter((o) => o.status !== "cancelled" && !o.draft)
      .map((o) => ({ o, qty: o.lines.reduce((s, l) => s + pickableQty(db, o, l.productId), 0) }))
      .filter((r) => r.qty > 0)
      .map((r) => ({
        key: r.o.id,
        channel: "outlet" as Channel,
        orderId: r.o.id,
        name: outletName(db, r.o.outletId),
        sub: `PO ${r.o.poNumber}`,
        qty: r.qty,
        since: r.o.createdAt,
        value: undefined as number | undefined,
        hold: r.o.onHold?.reason,
      }));
    const consultant = db.consultantOrders
      .filter((o) => (o.paymentStatus === "paid" || o.paymentStatus === "cod_pending") && o.deliveryStatus === "placed" && !o.dispatchId && !o.refund)
      .map((o) => {
        const c = consultantById(db, o.consultantId);
        return {
          key: o.id,
          channel: "consultant" as Channel,
          orderId: o.id,
          name: c ? fullName(c) : o.id,
          sub: `${consultantCode(c?.number)} · ${o.city}${o.paymentStatus === "cod_pending" ? " · cash on delivery" : ""}`,
          qty: o.lines.reduce((s, l) => s + l.qty, 0),
          since: o.paidAt ?? o.createdAt,
          value: o.total as number | undefined,
          hold: undefined as string | undefined,
        };
      });
    return [...outlet, ...consultant].filter((r) => channel === "all" || r.channel === channel).sort((a, b) => a.since.localeCompare(b.since));
  }, [db, channel]);

  const weekAgo = addDays(now, -7);
  const byColumn = useMemo(() => {
    const m = new Map<ColumnKey, Dispatch[]>(COLUMNS.map((c) => [c.key, []]));
    for (const x of db.dispatches) {
      if (channel !== "all" && x.channel !== channel) continue;
      const col = COLUMNS.find((c) => c.statuses.includes(x.status));
      if (!col) continue;
      if ((x.status === "delivered" || x.status === "returned") && (x.deliveredAt ?? x.dispatchedAt ?? x.createdAt) < weekAgo) continue;
      m.get(col.key)!.push(x);
    }
    for (const [k, list] of m)
      list.sort((a, b) =>
        k === "delivered" ? (b.deliveredAt ?? "").localeCompare(a.deliveredAt ?? "") : k === "problem" ? Number(a.status === "returned") - Number(b.status === "returned") || a.createdAt.localeCompare(b.createdAt) : a.createdAt.localeCompare(b.createdAt),
      );
    return m;
  }, [db, channel, weekAgo]);

  const setParam = (k: string, v?: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const createPick = (r: (typeof waiting)[number]) => {
    const id = act(r.channel === "outlet" ? actions.createOutletDispatch(r.orderId) : actions.createConsultantDispatch(r.orderId), (v) => `Pick list ${v} created`);
    if (id) navigate(`/staff/dispatch/${id}`);
  };

  return (
    <div className="animate-rise space-y-6">
      <PageHeader
        title="Dispatch"
        description="Every delivery from pick list to the customer's door. Pick lists take the earliest-expiry batch first, and items are checked by scan before anything leaves."
        actions={
          <>
            <FilterTabs
              value={view}
              onChange={(v) => setParam("view", v === "register" ? "register" : undefined)}
              options={[
                { value: "board", label: "Board" },
                { value: "register", label: "Register" },
              ]}
            />
            <FilterTabs<ChannelFilter>
              value={channel}
              onChange={(v) => setParam("channel", v)}
              options={[
                { value: "all", label: "Both channels" },
                { value: "outlet", label: CHANNEL_LABEL.outlet },
                { value: "consultant", label: `${label}s` },
              ]}
            />
          </>
        }
      />

      {view === "register" ? (
        <Register channel={channel} />
      ) : (
        <>
          <section className="rounded-2xl border border-border/70 bg-card shadow-soft">
            <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-3">
              <div>
                <h2 className="text-[0.95rem] font-semibold">Waiting to pick</h2>
                <p className="text-xs text-muted-foreground">Confirmed outlet orders with allocated stock and paid {label.toLowerCase()} orders, oldest first</p>
              </div>
              <StatusBadge tone={waiting.length ? "info" : "success"}>{waiting.length ? `${waiting.length} waiting` : "All picked"}</StatusBadge>
            </div>
            {waiting.length ? (
              <div className="no-scrollbar flex gap-3 overflow-x-auto p-4">
                {waiting.map((r) => {
                  const allowed = r.channel === "outlet" ? canOutlet : canConsultant;
                  return (
                    <div key={r.key} className={cn("flex w-64 shrink-0 flex-col rounded-xl border border-border/70 bg-background p-3", r.hold && "border-warning/40")}>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {r.channel === "outlet" ? <Store className="size-3.5" /> : <UserRound className="size-3.5" />}
                        {r.channel === "outlet" ? "Outlet" : label}
                        <span className="ml-auto">{relative(r.since, now)}</span>
                      </div>
                      <div className="mt-1.5 truncate font-medium">{r.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{r.sub}</div>
                      <div className="mt-2 flex items-center justify-between text-xs">
                        <Link to={r.channel === "outlet" ? `/staff/outlet-orders/${r.orderId}` : `/staff/consultant-orders/${r.orderId}`} className="text-muted-foreground hover:text-primary">
                          {r.orderId}
                        </Link>
                        <span className="tabular font-medium">
                          {plural(r.qty, "unit")}{r.value ? ` · ${lkr(r.value)}` : ""}
                        </span>
                      </div>
                      {r.hold ? (
                        <div className="mt-3 flex items-start gap-1.5 text-xs text-warning">
                          <PauseCircle className="mt-0.5 size-3.5 shrink-0" /> On hold: {r.hold}
                        </div>
                      ) : allowed ? (
                        <Button size="sm" className="mt-3" onClick={() => createPick(r)}>
                          <PackagePlus className="size-4" /> Create pick list
                        </Button>
                      ) : (
                        <div className="mt-3 text-center text-xs text-muted-foreground">{r.channel === "outlet" ? "Stores picks outlet orders" : "Stores or Operations picks this"}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="px-5 py-4 text-sm text-muted-foreground">Nothing is waiting for a pick list.</p>
            )}
          </section>

          <div className="overflow-x-auto pb-2">
            <div className="grid min-w-[1180px] grid-cols-6 gap-3">
              <div className="col-span-3 -mb-1 flex items-center gap-2 px-2 text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
                Prepared <span className="h-px flex-1 bg-border" />
              </div>
              <div className="col-span-3" />
              {COLUMNS.map((c) => {
                const list = byColumn.get(c.key) ?? [];
                const focused = focus === c.key;
                return (
                  <div
                    key={c.key}
                    ref={focused ? focusRef : undefined}
                    className={cn(
                      "flex min-h-[320px] flex-col rounded-2xl p-2 transition",
                      c.key === "problem" ? "bg-danger-soft/40" : "bg-muted/50",
                      focused && "bg-brand-soft ring-2 ring-primary/40",
                    )}
                  >
                    <div className="flex items-center justify-between px-2 pb-2 pt-1">
                      <div className="text-sm font-semibold">{c.label}</div>
                      <span className="rounded-full bg-background px-2 text-xs tabular text-muted-foreground">{list.length}</span>
                    </div>
                    {(c.key === "delivered" || c.key === "problem") && <div className="px-2 pb-2 text-[0.7rem] text-muted-foreground">{c.key === "delivered" ? "Last 7 days" : "Returned: last 7 days"}</div>}
                    <div className="flex flex-col gap-2">
                      {list.length ? (
                        list.map((x) => <Card key={x.id} x={x} now={now} />)
                      ) : (
                        <div className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">Nothing here</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Card({ x, now }: { x: Dispatch; now: string }) {
  const db = useDb();
  const p = partyOf(db, x);
  const total = units(x);
  const scanned = scannedUnits(x);
  const label = db.settings.labels.consultant;
  return (
    <Link to={`/staff/dispatch/${x.id}`} className="block rounded-xl border border-border/70 bg-card p-3 shadow-xs transition hover:-translate-y-0.5 hover:shadow-lift">
      <div className="flex items-center gap-1.5 whitespace-nowrap text-[0.7rem] text-muted-foreground" title={x.channel === "outlet" ? "Outlet delivery" : `${label} delivery`}>
        {x.channel === "outlet" ? <Store className="size-3 shrink-0" /> : <UserRound className="size-3 shrink-0" />}
        <span className="font-mono">{x.id}</span>
      </div>
      <div className="mt-1 truncate text-sm font-medium">{p.name}</div>
      <div className="truncate text-xs text-muted-foreground">{p.sub}</div>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <span className="tabular">{plural(total, "unit")}</span>
        {x.status === "packing" && <span className="tabular text-info">{scanned} scanned</span>}
        {x.status === "ready" && x.channel === "outlet" && !x.invoiceId && <span className="text-warning">Invoice to issue</span>}
        {x.status === "ready" && (x.channel === "consultant" || x.invoiceId) && (
          <span className="inline-flex items-center gap-1 text-info">
            <Truck className="size-3" /> {x.channel === "outlet" ? "Ready to load" : "For the courier"}
          </span>
        )}
        {x.status === "dispatched" && <span className="truncate text-muted-foreground">{x.channel === "outlet" ? (x.pod ? "Note received" : "Signed note due") : x.courier}</span>}
        {x.status === "delivered" && x.pod?.differenceNote && <span className="text-destructive">Difference</span>}
        {(x.status === "failed" || x.status === "returned") && <Status>{dispatchStatusLabel(x)}</Status>}
        {x.status === "to_pick" && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <ClipboardList className="size-3" /> {relative(x.createdAt, now)}
          </span>
        )}
      </div>
      {x.status === "failed" && x.failReason && <div className="mt-1 truncate text-[0.7rem] text-destructive">{x.failReason}</div>}
      {(x.status === "dispatched" || x.status === "delivered") && (
        <div className="mt-1 text-[0.7rem] text-muted-foreground">
          {x.status === "delivered" ? `Delivered ${relative(x.deliveredAt ?? x.createdAt, now)}` : `Left ${relative(x.dispatchedAt ?? x.createdAt, now)}`}
        </div>
      )}
    </Link>
  );
}

// ---------- register (workbook Dispatch Register, one row per product) ----------

interface RegisterRow {
  key: string;
  x: Dispatch;
  sku: string;
  qty: number;
}

function customerId(db: Db, x: Dispatch) {
  if (x.channel === "outlet") return db.outletOrders.find((o) => o.id === x.orderId)?.outletId ?? "";
  const o = db.consultantOrders.find((y) => y.id === x.orderId);
  return consultantCode(consultantById(db, o?.consultantId)?.number);
}

function method(db: Db, x: Dispatch) {
  if (x.channel === "consultant") return x.courier ?? "Courier";
  const m = db.outletOrders.find((o) => o.id === x.orderId)?.deliveryMethod ?? "Own vehicle";
  return x.vehicle ? `${m}, ${x.vehicle}${x.driver ? ` (${x.driver})` : ""}` : m;
}

function proof(x: Dispatch) {
  if (x.status !== "delivered") return "";
  if (x.channel === "outlet") return x.pod?.confirmedAt ? "Signed delivery note" : "Delivered";
  return x.events.some((e) => e.text.includes("confirmed in the app")) ? "Confirmed by recipient in the app" : "Courier confirmation";
}

function Register({ channel }: { channel: ChannelFilter }) {
  const db = useDb();
  const navigate = useNavigate();
  const rows = useMemo<RegisterRow[]>(
    () =>
      db.dispatches
        .filter((x) => (channel === "all" || x.channel === channel) && x.dispatchedAt)
        .flatMap((x) => {
          const by = new Map<string, number>();
          for (const l of x.lines) by.set(l.productId, (by.get(l.productId) ?? 0) + l.qty);
          return [...by.entries()].map(([sku, qty]) => ({ key: `${x.id}-${sku}`, x, sku, qty }));
        }),
    [db, channel],
  );
  return (
    <SimpleTable<RegisterRow>
      rows={rows}
      rowKey={(r) => r.key}
      rowHref={(r) => `/staff/dispatch/${r.x.id}`}
      onRowClick={(r) => navigate(`/staff/dispatch/${r.x.id}`)}
      exportName="dispatch-register"
      defaultSort={{ key: "date", dir: "desc" }}
      pageSize={20}
      dense
      searchText={(r) => `${r.x.id} ${r.x.orderId} ${customerId(db, r.x)} ${r.sku} ${r.x.trackingNo ?? ""} ${r.x.deliveryNoteId ?? ""} ${r.x.receivedBy ?? ""}`}
      columns={[
        { key: "id", header: "Dispatch ID", className: "whitespace-nowrap", value: (r) => r.x.id, cell: (r) => r.x.id },
        { key: "date", header: "Dispatch Date", className: "whitespace-nowrap", value: (r) => r.x.dispatchedAt ?? "", cell: (r) => date(r.x.dispatchedAt) },
        { key: "order", header: "Order ID", className: "whitespace-nowrap", value: (r) => r.x.orderId, cell: (r) => r.x.orderId },
        { key: "customer", header: "Customer ID", className: "whitespace-nowrap", value: (r) => customerId(db, r.x), cell: (r) => <span title={partyOf(db, r.x).name}>{customerId(db, r.x)}</span> },
        { key: "sku", header: "SKU", className: "whitespace-nowrap", value: (r) => r.sku, cell: (r) => <span title={productName(db, r.sku)}>{r.sku}</span> },
        { key: "qty", header: "Quantity Dispatched", align: "right", value: (r) => r.qty, cell: (r) => num(r.qty) },
        { key: "method", header: "Delivery Company / Method", value: (r) => method(db, r.x), cell: (r) => method(db, r.x) },
        { key: "ref", header: "Tracking / Delivery Ref", className: "whitespace-nowrap", value: (r) => r.x.trackingNo ?? r.x.deliveryNoteId ?? "", cell: (r) => <span className="font-mono text-xs">{r.x.trackingNo ?? r.x.deliveryNoteId}</span> },
        { key: "recv", header: "Received By", value: (r) => r.x.receivedBy ?? "", cell: (r) => r.x.receivedBy ?? <span className="text-muted-foreground">{r.x.status === "delivered" ? "Not recorded" : ""}</span> },
        { key: "pod", header: "Proof of Delivery", value: (r) => proof(r.x), cell: (r) => proof(r.x) },
        { key: "status", header: "Dispatch Status", className: "whitespace-nowrap", value: (r) => dispatchStatusLabel(r.x), cell: (r) => <Status>{dispatchStatusLabel(r.x)}</Status> },
        { key: "notes", header: "Notes", value: (r) => r.x.failReason ?? r.x.pod?.differenceNote ?? r.x.notes ?? "", cell: (r) => <span className="text-xs text-muted-foreground">{r.x.failReason ?? r.x.pod?.differenceNote ?? r.x.notes}</span> },
      ]}
    />
  );
}
