// S21 Moves between channel allocations: Stores requests, the Administrator approves.

import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowRight, Check, PackageOpen, X } from "lucide-react";
import { useDb } from "@/domain/db";
import { actions } from "@/domain/actions";
import { CHANNEL_LABEL, productName } from "@/domain/stock";
import { date, dateTime, num } from "@/domain/format";
import type { Channel, Transfer } from "@/domain/types";
import { act, actorName, useCan } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { Guard } from "@/staff/guard";
import { EmptyState, PageHeader, Panel, ReasonDialog, SimpleTable, Status, StatusBadge } from "@/components/fc/ui";
import { NativeSelect } from "@/components/fc/docs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChannelBadge, Field, ProductCell, channelName } from "./shared";
import { lotOptions } from "@/domain/ext/inventory";

const STATUS: Record<Transfer["status"], string> = { requested: "Waiting for approval", approved: "Approved", rejected: "Rejected" };

export function TransfersPage() {
  return (
    <Guard perms={["transfer.request", "transfer.approve"]}>
      <Transfers />
    </Guard>
  );
}

function Transfers() {
  usePageTitle("Stock moves");
  const db = useDb();
  const canRequest = useCan("transfer.request");
  const canApprove = useCan("transfer.approve");
  const pending = db.transfers.filter((t) => t.status === "requested");
  const [rejecting, setRejecting] = useState<Transfer>();
  const approvalOn = db.settings.stock.transferApproval;
  return (
    <div className="animate-rise">
      <PageHeader
        title="Stock moves"
        description={
          approvalOn
            ? "Move stock from one channel's allocation to the other. Each move waits for an Administrator to approve it before stock changes."
            : "Move stock from one channel's allocation to the other. Approval is switched off in Settings, so moves happen straight away."
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Panel
            title={canApprove ? "Waiting for your approval" : "Waiting for approval"}
            description={canApprove ? "Approving moves the stock and writes both sides to the stock ledger" : "An Administrator approves or rejects each request"}
            actions={pending.length > 0 && <StatusBadge tone="warning">{pending.length}</StatusBadge>}
          >
            {pending.length ? (
              <div className="space-y-3">
                {pending.map((t) => (
                  <div key={t.id} className="rounded-xl border border-border/70 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className="font-semibold text-foreground">{t.id}</span>
                          <span>
                            requested by {actorName(db, t.requestedBy)}, {dateTime(t.ts)}
                          </span>
                        </div>
                        <ProductCell db={db} id={t.productId} link={false} sub={<Link to={`/staff/batches/${t.batchId}`} className="text-primary hover:underline">batch {t.batchId}</Link>} />
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-display text-xl font-semibold tabular">{num(t.qty)}</span>
                          <span className="text-muted-foreground">from</span>
                          <ChannelBadge channel={t.from} />
                          <ArrowRight className="size-4 text-muted-foreground" />
                          <ChannelBadge channel={t.to} />
                        </div>
                        <p className="text-sm text-muted-foreground">"{t.reason}"</p>
                      </div>
                      {canApprove && (
                        <div className="flex shrink-0 gap-2">
                          <Button variant="outline" onClick={() => setRejecting(t)}>
                            <X className="size-4" /> Reject
                          </Button>
                          <Button onClick={() => act(actions.decideTransfer(t.id, true), `${t.id} approved: ${num(t.qty)} moved to ${CHANNEL_LABEL[t.to].toLowerCase()}`)}>
                            <Check className="size-4" /> Approve
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={<PackageOpen className="size-5" />} title="No moves waiting" description="Requests from Stores appear here." />
            )}
          </Panel>
          <Panel title="All moves" bodyClassName="p-4">
            <SimpleTable
              rows={db.transfers}
              rowKey={(t) => t.id}
              exportName="stock-moves"
              defaultSort={{ key: "ts", dir: "desc" }}
              columns={[
                { key: "id", header: "Move", cell: (t) => <span className="font-medium">{t.id}</span>, value: (t) => t.id },
                { key: "ts", header: "Requested", cell: (t) => date(t.ts), value: (t) => t.ts },
                { key: "product", header: "Product", cell: (t) => `${t.productId} · ${productName(db, t.productId)}`, value: (t) => productName(db, t.productId) },
                { key: "batch", header: "Batch", cell: (t) => t.batchId, value: (t) => t.batchId },
                { key: "qty", header: "Qty", align: "right", cell: (t) => num(t.qty), value: (t) => t.qty },
                { key: "route", header: "From → to", cell: (t) => `${CHANNEL_LABEL[t.from]} → ${CHANNEL_LABEL[t.to]}`, value: (t) => `${CHANNEL_LABEL[t.from]} to ${CHANNEL_LABEL[t.to]}` },
                { key: "status", header: "Status", cell: (t) => <Status>{STATUS[t.status]}</Status>, value: (t) => STATUS[t.status] },
                { key: "by", header: "Decided by", cell: (t) => (t.decidedBy ? `${actorName(db, t.decidedBy)}${t.rejectReason ? `: ${t.rejectReason}` : ""}` : ""), value: (t) => actorName(db, t.decidedBy), hideOnMobile: true },
              ]}
              empty={<EmptyState title="No moves yet" description="Requests to move stock between channels are listed here." />}
            />
          </Panel>
        </div>
        {canRequest ? <RequestForm /> : (
          <Panel title="How moves work">
            <p className="text-sm text-muted-foreground">Stores asks for a move with a reason. The stock only changes once it is approved, and both sides go into the stock ledger.</p>
          </Panel>
        )}
      </div>
      <ReasonDialog
        open={!!rejecting}
        onOpenChange={(v) => !v && setRejecting(undefined)}
        title={`Reject ${rejecting?.id ?? "move"}`}
        description="Stores sees the reason. No stock changes."
        confirmLabel="Reject move"
        destructive
        onConfirm={(reason) => {
          if (!rejecting) return;
          act(actions.decideTransfer(rejecting.id, false, reason), `${rejecting.id} rejected`);
        }}
      />
    </div>
  );
}

function RequestForm() {
  const db = useDb();
  const products = db.products.filter((p) => p.status === "active");
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [from, setFrom] = useState<Channel>("consultant");
  const to: Channel = from === "outlet" ? "consultant" : "outlet";
  const lots = useMemo(() => lotOptions(db, productId, from).filter((l) => l.free > 0), [db, productId, from]);
  const [batchId, setBatchId] = useState("");
  const batch = lots.find((l) => l.batchId === batchId) ?? lots[0];
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const n = Math.floor(Number(qty) || 0);
  const tooMany = batch ? n > batch.free : n > 0;
  const valid = !!batch && n > 0 && !tooMany && reason.trim().length > 0;
  const submit = () => {
    if (!batch) return;
    const id = act(actions.requestTransfer({ productId, batchId: batch.batchId, from, to, qty: n, reason: reason.trim() }), (tid) =>
      db.settings.stock.transferApproval ? `${tid} sent for approval` : `${tid} done: stock moved`,
    );
    if (id) {
      setQty("");
      setReason("");
    }
  };
  return (
    <Panel title="Request a move" description={db.settings.stock.transferApproval ? "An Administrator approves it before stock moves" : "Moves happen straight away"} className="h-fit">
      <div className="grid gap-4">
        <Field label="Product" htmlFor="trf-product">
          <NativeSelect id="trf-product" value={productId} onChange={(e) => { setProductId(e.target.value); setBatchId(""); }}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id} · {p.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From" htmlFor="trf-from">
            <NativeSelect id="trf-from" value={from} onChange={(e) => { setFrom(e.target.value as Channel); setBatchId(""); }}>
              <option value="consultant">{channelName(db, "consultant")}</option>
              <option value="outlet">{CHANNEL_LABEL.outlet}</option>
            </NativeSelect>
          </Field>
          <Field label="To" htmlFor="trf-to">
            <Input id="trf-to" value={channelName(db, to)} readOnly className="bg-muted/50" />
          </Field>
        </div>
        <Field label="Batch" htmlFor="trf-batch" hint="Earliest expiry first">
          <NativeSelect id="trf-batch" value={batch?.batchId ?? ""} onChange={(e) => setBatchId(e.target.value)} disabled={!lots.length}>
            {lots.length ? (
              lots.map((l) => (
                <option key={l.batchId} value={l.batchId}>
                  {l.batchId} · expires {date(l.expiry)} · {num(l.free)} free
                </option>
              ))
            ) : (
              <option value="">No free stock in this allocation</option>
            )}
          </NativeSelect>
        </Field>
        <Field label="Quantity" htmlFor="trf-qty" error={tooMany && batch ? `Only ${num(batch.free)} free in batch ${batch.batchId}` : undefined}>
          <Input id="trf-qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} placeholder="e.g. 200" />
        </Field>
        <Field label="Reason" htmlFor="trf-reason">
          <Textarea id="trf-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Outlet orders need more; consultant stock covers 5 weeks" />
        </Field>
        <Button disabled={!valid} onClick={submit}>
          <PackageOpen className="size-4" /> {db.settings.stock.transferApproval ? "Send for approval" : "Move stock"}
        </Button>
      </div>
    </Panel>
  );
}
