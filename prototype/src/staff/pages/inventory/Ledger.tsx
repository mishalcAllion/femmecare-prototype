// S24 Stock ledger: every movement with filters, and the adjustment form.

import { DateInput } from "@/components/fc/date-input";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Minus, Plus, SlidersHorizontal } from "lucide-react";
import { useDb } from "@/domain/db";
import { actions } from "@/domain/actions";
import { CHANNEL_LABEL, productName } from "@/domain/stock";
import { date, dateTime, dayKey, lkr, num } from "@/domain/format";
import { MOVEMENT_LABEL } from "@/domain/lists";
import type { Channel, MovementType, StockMovement } from "@/domain/types";
import { act, actorName, useCan } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { Guard } from "@/staff/guard";
import { EmptyState, PageHeader, SimpleTable } from "@/components/fc/ui";
import { NativeSelect } from "@/components/fc/docs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Field, channelName } from "./shared";
import { ADJUST_REASONS, REF_TYPE_LABEL, locationLabel, lotOptions } from "@/domain/ext/inventory";

const TYPES: MovementType[] = ["Opening balance", "Goods received", "Sales issue", "Customer return", "Transfer in", "Transfer out", "Adjustment in", "Adjustment out", "Count difference"];

export function refHref(m: Pick<StockMovement, "refType" | "refId">): string | undefined {
  if (!m.refId) return;
  if (m.refType === "GRN") return `/staff/grn/${m.refId}`;
  if (m.refType === "CNT") return `/staff/counts/${m.refId}`;
  if (m.refType === "Dispatch") return `/staff/dispatch/${m.refId}`;
  if (m.refType === "TRF") return "/staff/transfers";
  return;
}

export function LedgerPage() {
  return (
    <Guard perms={["stock.view.all"]}>
      <Ledger />
    </Guard>
  );
}

function Ledger() {
  usePageTitle("Stock ledger");
  const db = useDb();
  const [params, setParams] = useSearchParams();
  const canAdjustA = useCan("count.do");
  const canAdjustB = useCan("count.approve");
  const canAdjust = canAdjustA || canAdjustB;
  const [open, setOpen] = useState(false);
  const product = params.get("product") ?? "";
  const channel = (params.get("channel") ?? "") as Channel | "";
  const type = params.get("type") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  const rows = useMemo(
    () =>
      db.movements.filter(
        (m) =>
          (!product || m.productId === product) &&
          (!channel || m.channel === channel) &&
          (!type || m.type === type) &&
          (!from || dayKey(m.ts) >= from) &&
          (!to || dayKey(m.ts) <= to),
      ),
    [db.movements, product, channel, type, from, to],
  );
  const tin = rows.reduce((s, m) => s + m.qtyIn, 0);
  const tout = rows.reduce((s, m) => s + m.qtyOut, 0);
  return (
    <div className="animate-rise">
      <PageHeader
        title="Stock ledger"
        description="Every movement of stock: goods received, sales issues, moves between channels, adjustments and count differences, with the batch, reference and person."
        actions={
          canAdjust && (
            <Button onClick={() => setOpen(true)}>
              <SlidersHorizontal className="size-4" /> Adjust stock
            </Button>
          )
        }
      />
      <div className="mb-4 grid gap-3 rounded-2xl border border-border/70 bg-card p-4 shadow-soft sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Product" htmlFor="lg-p">
          <NativeSelect id="lg-p" value={product} onChange={(e) => set("product", e.target.value)}>
            <option value="">All products</option>
            {db.products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id} · {p.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Channel" htmlFor="lg-c">
          <NativeSelect id="lg-c" value={channel} onChange={(e) => set("channel", e.target.value)}>
            <option value="">Both channels</option>
            <option value="outlet">{CHANNEL_LABEL.outlet}</option>
            <option value="consultant">{channelName(db, "consultant")}</option>
          </NativeSelect>
        </Field>
        <Field label="Movement type" htmlFor="lg-t">
          <NativeSelect id="lg-t" value={type} onChange={(e) => set("type", e.target.value)}>
            <option value="">All types</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {MOVEMENT_LABEL[t] ?? t}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="From" htmlFor="lg-f">
          <DateInput id="lg-f" value={from} onChange={(e) => set("from", e.target.value)} />
        </Field>
        <Field label="To" htmlFor="lg-to">
          <DateInput id="lg-to" value={to} onChange={(e) => set("to", e.target.value)} />
        </Field>
      </div>
      <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span>
          <span className="text-muted-foreground">Movements:</span> <span className="font-semibold tabular">{num(rows.length)}</span>
        </span>
        <span>
          <span className="text-muted-foreground">Units in:</span> <span className="font-semibold tabular text-success">+{num(tin)}</span>
        </span>
        <span>
          <span className="text-muted-foreground">Units out:</span> <span className="font-semibold tabular">-{num(tout)}</span>
        </span>
        <span>
          <span className="text-muted-foreground">Net:</span> <span className="font-semibold tabular">{num(tin - tout)}</span>
        </span>
      </div>
      <SimpleTable
        rows={rows}
        rowKey={(m) => m.id}
        exportName="stock-ledger"
        pageSize={25}
        dense
        columns={[
          { key: "id", header: "Movement ID", cell: (m) => <span className="font-mono text-xs">{m.id}</span>, value: (m) => m.id },
          { key: "ts", header: "Movement Date", cell: (m) => <span className="whitespace-nowrap">{dateTime(m.ts)}</span>, value: (m) => m.ts },
          { key: "sku", header: "SKU", cell: (m) => m.productId, value: (m) => m.productId },
          { key: "product", header: "Product Name", cell: (m) => <span className="whitespace-nowrap">{productName(db, m.productId)}</span>, value: (m) => productName(db, m.productId) },
          { key: "type", header: "Movement Type", cell: (m) => <span className="whitespace-nowrap">{MOVEMENT_LABEL[m.type] ?? m.type}</span>, value: (m) => MOVEMENT_LABEL[m.type] ?? m.type },
          { key: "in", header: "Quantity In", align: "right", cell: (m) => (m.qtyIn ? <span className="text-success">+{num(m.qtyIn)}</span> : ""), value: (m) => m.qtyIn },
          { key: "out", header: "Quantity Out", align: "right", cell: (m) => (m.qtyOut ? `-${num(m.qtyOut)}` : ""), value: (m) => m.qtyOut },
          { key: "cost", header: "Unit Cost", align: "right", cell: (m) => (m.unitCost !== undefined ? lkr(m.unitCost, { prefix: false }) : ""), value: (m) => m.unitCost },
          { key: "refType", header: "Reference Type", cell: (m) => (m.refType ? REF_TYPE_LABEL[m.refType] ?? m.refType : ""), value: (m) => (m.refType ? REF_TYPE_LABEL[m.refType] ?? m.refType : "") },
          {
            key: "ref",
            header: "Reference No.",
            cell: (m) => {
              const href = refHref(m);
              return href ? (
                <Link to={href} className="whitespace-nowrap text-primary hover:underline">
                  {m.refId}
                </Link>
              ) : (
                m.refId ?? ""
              );
            },
            value: (m) => m.refId ?? "",
          },
          { key: "loc", header: "Location / Warehouse", cell: (m) => <span className="whitespace-nowrap text-xs">{locationLabel(m.channel, db.settings.labels.consultant)}</span>, value: (m) => locationLabel(m.channel, db.settings.labels.consultant) },
          { key: "batch", header: "Batch / Lot", cell: (m) => <Link to={`/staff/batches/${m.batchId}`} className="font-mono text-xs hover:text-primary">{m.batchId}</Link>, value: (m) => m.batchId },
          { key: "user", header: "Entered By", cell: (m) => <span className="whitespace-nowrap">{actorName(db, m.userId)}</span>, value: (m) => actorName(db, m.userId) },
          { key: "reason", header: "Notes", cell: (m) => <span className="line-clamp-2 min-w-[160px] text-xs text-muted-foreground">{m.reason}</span>, value: (m) => m.reason ?? "" },
        ]}
        defaultSort={{ key: "ts", dir: "desc" }}
        empty={<EmptyState title="No movements match" description="Change the filters to see more of the ledger." />}
      />
      {canAdjust && <AdjustDialog open={open} onOpenChange={setOpen} />}
    </div>
  );
}

function AdjustDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const db = useDb();
  const products = db.products.filter((p) => p.status === "active");
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [channel, setChannel] = useState<Channel>("outlet");
  const [dir, setDir] = useState<"in" | "out">("out");
  const lots = useMemo(() => lotOptions(db, productId, channel, true), [db, productId, channel]);
  const [batchId, setBatchId] = useState("");
  const lot = lots.find((l) => l.batchId === batchId) ?? lots[0];
  const [qty, setQty] = useState("");
  const [reasonPick, setReasonPick] = useState(ADJUST_REASONS[0]);
  const [note, setNote] = useState("");
  const n = Math.floor(Number(qty) || 0);
  const tooMany = dir === "out" && lot && n > lot.free;
  const reason = reasonPick === "Other" ? note.trim() : note.trim() ? `${reasonPick}: ${note.trim()}` : reasonPick;
  const valid = !!lot && n > 0 && !tooMany && !!reason;
  const save = () => {
    if (!lot) return;
    const id = act(actions.adjust({ productId, batchId: lot.batchId, channel, qty: dir === "in" ? n : -n, reason }), (aid) => `${aid} posted: ${dir === "in" ? "+" : "-"}${num(n)} × ${productName(db, productId)}`);
    if (id) {
      setQty("");
      setNote("");
      onOpenChange(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
          <DialogDescription>Use this for damage, samples or stock found. The adjustment goes into the ledger and the audit log with your name and reason.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-2">
            {(["out", "in"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDir(d)}
                className={cn("flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition", dir === d ? "border-primary bg-brand-soft text-primary" : "border-border hover:bg-accent/40")}
              >
                {d === "out" ? <Minus className="size-4" /> : <Plus className="size-4" />} {d === "out" ? "Adjustment out" : "Adjustment in"}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Product" htmlFor="adj-p">
              <NativeSelect id="adj-p" value={productId} onChange={(e) => { setProductId(e.target.value); setBatchId(""); }}>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id} · {p.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Channel" htmlFor="adj-c">
              <NativeSelect id="adj-c" value={channel} onChange={(e) => { setChannel(e.target.value as Channel); setBatchId(""); }}>
                <option value="outlet">{CHANNEL_LABEL.outlet}</option>
                <option value="consultant">{channelName(db, "consultant")}</option>
              </NativeSelect>
            </Field>
            <Field label="Batch" htmlFor="adj-b">
              <NativeSelect id="adj-b" value={lot?.batchId ?? ""} onChange={(e) => setBatchId(e.target.value)} disabled={!lots.length}>
                {lots.length ? (
                  lots.map((l) => (
                    <option key={l.batchId} value={l.batchId}>
                      {l.batchId} · exp {date(l.expiry)} · {num(l.onHand)} on hand
                    </option>
                  ))
                ) : (
                  <option value="">No batches in this allocation</option>
                )}
              </NativeSelect>
            </Field>
            <Field label="Quantity" htmlFor="adj-q" error={tooMany && lot ? `Only ${num(lot.free)} free in ${lot.batchId}` : undefined}>
              <Input id="adj-q" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} placeholder="e.g. 4" />
            </Field>
            <Field label="Reason" htmlFor="adj-r" className="sm:col-span-2">
              <NativeSelect id="adj-r" value={reasonPick} onChange={(e) => setReasonPick(e.target.value)}>
                {ADJUST_REASONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={reasonPick === "Other" ? "Describe the reason" : "Note (optional)"} htmlFor="adj-n" className="sm:col-span-2">
              <Textarea id="adj-n" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Carton crushed when unloading" />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!valid} onClick={save}>
            Post adjustment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

