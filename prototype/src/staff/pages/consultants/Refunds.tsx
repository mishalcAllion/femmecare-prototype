// S33 Cancellations and refunds: requests from Operations, approved or rejected by
// Finance (never by the person who asked), with the stock and commission effect shown.

import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Boxes, CheckCircle2, Coins, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, FilterTabs, PageHeader, Panel, ReasonDialog, SimpleTable, Status, StatusBadge, type Column } from "@/components/fc/ui";
import { useDb } from "@/domain/db";
import { consultantById, fullName, DELIVERY_STATUS_LABEL } from "@/domain/consultants";
import { dateTime, lkr, relative } from "@/domain/format";
import type { ConsultantOrder } from "@/domain/types";
import { financeActions, refundEffect } from "@/domain/ext/finance";
import { act, actorName, useCan, useNow, useStaffUser } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { cn } from "@/lib/utils";
import { Guard } from "../../guard";
import { ConsultantCell, useLabel } from "./shared";

type Tab = "requested" | "approved" | "rejected" | "cancelled";

export function RefundsPage() {
  return (
    <Guard perms={["refunds.view", "refunds.request", "refunds.approve"]}>
      <Refunds />
    </Guard>
  );
}

function Refunds() {
  const L = useLabel();
  usePageTitle("Cancellations and refunds");
  const db = useDb();
  const now = useNow();
  const me = useStaffUser();
  const canApprove = useCan("refunds.approve");
  const [tab, setTab] = useState<Tab>("requested");
  const [approve, setApprove] = useState<ConsultantOrder>();
  const [reject, setReject] = useState<ConsultantOrder>();
  const list = useMemo(() => {
    const withRefund = db.consultantOrders.filter((o) => o.refund);
    return {
      requested: withRefund.filter((o) => o.refund!.status === "requested").sort((a, b) => a.refund!.requestedAt.localeCompare(b.refund!.requestedAt)),
      approved: withRefund.filter((o) => o.refund!.status === "approved").sort((a, b) => (b.refund!.decidedAt ?? "").localeCompare(a.refund!.decidedAt ?? "")),
      rejected: withRefund.filter((o) => o.refund!.status === "rejected"),
      cancelled: db.consultantOrders.filter((o) => o.deliveryStatus === "cancelled" && !o.refund),
    };
  }, [db]);
  const decided: Column<ConsultantOrder>[] = [
    { key: "id", header: "Order", cell: (o) => <span className="tabular">{o.id}</span>, value: (o) => o.id },
    { key: "c", header: L.one, cell: (o) => <ConsultantCell c={consultantById(db, o.consultantId)} />, value: (o) => fullName(consultantById(db, o.consultantId) ?? { givenName: "", surname: "" }) },
    { key: "amt", header: "Amount", align: "right", className: "whitespace-nowrap", cell: (o) => lkr(o.total), value: (o) => o.total },
    { key: "why", header: "Reason", cell: (o) => <span className="text-sm">{o.refund?.reason ?? o.cancelReason}</span>, value: (o) => o.refund?.reason ?? o.cancelReason },
    {
      key: "effect",
      header: "Commission",
      cell: (o) => {
        const e = refundEffect(db, o);
        return <span className="text-xs text-muted-foreground">{o.refund ? e.commission : "No effect, never paid"}</span>;
      },
      hideOnMobile: true,
    },
    {
      key: "by",
      header: "Decided",
      cell: (o) => {
        if (o.refund?.decidedBy) return `${actorName(db, o.refund.decidedBy)}, ${dateTime(o.refund.decidedAt)}`;
        const ev = [...o.events].reverse().find((e) => e.text.startsWith("Cancelled"));
        return ev ? `${actorName(db, ev.by)}, ${dateTime(ev.ts)}` : "";
      },
      value: (o) => o.refund?.decidedAt ?? "",
    },
  ];
  return (
    <div className="animate-rise">
      <PageHeader
        title="Cancellations and refunds"
        description="Operations asks for a refund with a reason; Finance approves it. The person who asked can't approve their own request."
      />
      <div className="mb-4">
        <FilterTabs
          value={tab}
          onChange={setTab}
          options={[
            { value: "requested", label: "Waiting for approval", count: list.requested.length },
            { value: "approved", label: "Approved", count: list.approved.length },
            { value: "rejected", label: "Not approved", count: list.rejected.length },
            { value: "cancelled", label: "Cancelled before payment", count: list.cancelled.length },
          ]}
        />
      </div>
      {tab === "requested" &&
        (list.requested.length ? (
          <div className="space-y-4">
            {list.requested.map((o) => {
              const c = consultantById(db, o.consultantId);
              const eff = refundEffect(db, o);
              const own = o.refund!.requestedBy === me?.id;
              return (
                <Panel key={o.id}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={`/staff/consultant-orders/${o.id}`} className="font-display text-lg font-semibold hover:text-primary">
                          {o.id}
                        </Link>
                        <Status>{DELIVERY_STATUS_LABEL[o.deliveryStatus]}</Status>
                        {eff.afterClose && <StatusBadge tone="plum">Month already closed</StatusBadge>}
                      </div>
                      <div className="mt-2">
                        <ConsultantCell c={c} />
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Refund</div>
                      <div className="font-display text-2xl font-semibold tabular">{lkr(o.total)}</div>
                    </div>
                  </div>
                  <div className="mt-4 rounded-xl bg-muted/50 p-3 text-sm">
                    <span className="font-medium">{o.refund!.reason}</span>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Asked by {actorName(db, o.refund!.requestedBy)}, {relative(o.refund!.requestedAt, now)}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <Effect icon={<Boxes className="size-4" />} title="Stock" text={eff.stock} />
                    <Effect icon={<Coins className="size-4" />} title="Commission" text={eff.commission} highlight={eff.afterClose && eff.adjustment !== undefined} />
                  </div>
                  {canApprove && (
                    <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                      {own && <span className="mr-auto text-sm text-warning">You asked for this refund, so someone else in Finance must approve it.</span>}
                      <Button variant="destructive" onClick={() => setReject(o)}>
                        <XCircle className="size-4" /> Don't approve
                      </Button>
                      <Button onClick={() => setApprove(o)}>
                        <CheckCircle2 className="size-4" /> Approve refund
                      </Button>
                    </div>
                  )}
                  {!canApprove && <p className="mt-4 text-right text-sm text-muted-foreground">Waiting for Finance to approve</p>}
                </Panel>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={<RotateCcw className="size-5" />} title="No refunds waiting" description="Refund requests from Operations appear here for Finance to approve." />
        ))}
      {tab !== "requested" && (
        <SimpleTable
          rows={list[tab]}
          columns={decided}
          rowKey={(o) => o.id}
          rowHref={(o) => `/staff/consultant-orders/${o.id}`}
          exportName={`refunds-${tab}`}
          empty={<EmptyState title="Nothing here" />}
        />
      )}

      <Dialog open={!!approve} onOpenChange={(v) => !v && setApprove(undefined)}>
        <DialogContent>
          {approve && (
            <>
              <DialogHeader>
                <DialogTitle>Approve a refund of {lkr(approve.total)}?</DialogTitle>
                <DialogDescription>The {L.lower} is told by SMS that the money reaches her bank account within 5 working days.</DialogDescription>
              </DialogHeader>
              <ul className="space-y-2 text-sm">
                <li className="flex gap-2">
                  <Boxes className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> {refundEffect(db, approve).stock}
                </li>
                <li className="flex gap-2">
                  <Coins className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> {refundEffect(db, approve).commission}
                </li>
              </ul>
              <DialogFooter>
                <Button variant="outline" onClick={() => setApprove(undefined)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    const r = financeActions.decideRefund(approve.id, true);
                    act(r, `Refund for ${approve.id} approved`);
                    setApprove(undefined);
                  }}
                >
                  Approve refund
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <ReasonDialog
        open={!!reject}
        onOpenChange={(v) => !v && setReject(undefined)}
        title={reject ? `Don't approve the refund for ${reject.id}` : ""}
        description="Operations sees this reason on the order."
        confirmLabel="Don't approve"
        destructive
        placeholder="For example: photos don't show any damage; ask the consultant for more"
        onConfirm={(reason) => {
          if (!reject) return false;
          const r = financeActions.decideRefund(reject.id, false, reason);
          act(r, "Refund not approved");
          return r.ok;
        }}
      />
    </div>
  );
}

function Effect({ icon, title, text, highlight }: { icon: ReactNode; title: string; text: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-xl border p-3", highlight ? "border-plum/30 bg-[oklch(0.97_0.02_330)] dark:bg-[oklch(0.28_0.04_330)]" : "border-border/70")}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {title}
      </div>
      <div className="mt-1 text-sm">{text}</div>
    </div>
  );
}
