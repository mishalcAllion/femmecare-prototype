// S32 Payments to verify: each bank slip beside its order, amount and reference
// checks, duplicate warnings, and Verify or Reject with a reason.

import { useMemo, useState } from "react";
import { Link } from "react-router";
import { AlertTriangle, CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, FilterTabs, PageHeader, Panel, ReasonDialog, SimpleTable, Status, type Column } from "@/components/fc/ui";
import { BankSlipImage } from "@/components/fc/docs";
import { useDb } from "@/domain/db";
import { actions } from "@/domain/actions";
import { consultantById, fullName } from "@/domain/consultants";
import { salesMonth } from "@/domain/commission";
import { dateTime, lkr, monthLabel, relative } from "@/domain/format";
import type { ConsultantOrder, PaymentAttempt } from "@/domain/types";
import { act, actorName, useNow } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { cn } from "@/lib/utils";
import { Guard } from "../../guard";
import { ConsultantCell, useLabel } from "./shared";

interface Item {
  o: ConsultantOrder;
  p: PaymentAttempt;
}

function issues(i: Item) {
  const out: { tone: "danger" | "warning"; text: string; link?: string }[] = [];
  const diff = Math.round((i.p.amount - i.o.total) * 100) / 100;
  if (diff < 0) out.push({ tone: "danger", text: `${lkr(-diff)} short` });
  if (diff > 0) out.push({ tone: "warning", text: `${lkr(diff)} more than the order total` });
  if (i.p.duplicateOf) out.push({ tone: "danger", text: `Reference already used on order ${i.p.duplicateOf}`, link: `/staff/consultant-orders/${i.p.duplicateOf}` });
  return out;
}

export function PaymentsPage() {
  return (
    <Guard perms={["payments.verify"]}>
      <Payments />
    </Guard>
  );
}

function Payments() {
  const L = useLabel();
  usePageTitle("Payments to verify");
  const db = useDb();
  const now = useNow();
  const [tab, setTab] = useState<"waiting" | "done">("waiting");
  const waiting = useMemo<Item[]>(
    () =>
      db.consultantOrders
        .flatMap((o) => o.payments.filter((p) => p.method === "bank_transfer" && p.status === "pending").map((p) => ({ o, p })))
        .sort((a, b) => a.p.ts.localeCompare(b.p.ts)),
    [db],
  );
  const done = useMemo<Item[]>(
    () =>
      db.consultantOrders
        .flatMap((o) => o.payments.filter((p) => p.method === "bank_transfer" && (p.status === "verified" || p.status === "rejected") && p.decidedAt).map((p) => ({ o, p })))
        .sort((a, b) => (b.p.decidedAt ?? "").localeCompare(a.p.decidedAt ?? "")),
    [db],
  );
  const [verify, setVerify] = useState<Item>();
  const [reject, setReject] = useState<Item>();
  const doVerify = (i: Item) => {
    const r = actions.decidePayment(i.o.id, i.p.id, true);
    act(r, `Payment for ${i.o.id} verified. The order is ready to pack`);
    setVerify(undefined);
  };
  const doneCols: Column<Item>[] = [
    { key: "o", header: "Order", cell: (i) => <span className="tabular">{i.o.id}</span>, value: (i) => i.o.id },
    { key: "c", header: L.one, cell: (i) => <ConsultantCell c={consultantById(db, i.o.consultantId)} />, value: (i) => fullName(consultantById(db, i.o.consultantId) ?? { givenName: "", surname: "" }) },
    { key: "a", header: "Slip amount", align: "right", className: "whitespace-nowrap", cell: (i) => lkr(i.p.amount), value: (i) => i.p.amount },
    { key: "r", header: "Reference", cell: (i) => <span className="tabular">{i.p.reference}</span>, value: (i) => i.p.reference },
    { key: "s", header: "Decision", cell: (i) => <Status>{i.p.status === "verified" ? "Verified" : "Rejected"}</Status>, value: (i) => i.p.status },
    { key: "b", header: "By", cell: (i) => `${actorName(db, i.p.decidedBy)}, ${dateTime(i.p.decidedAt)}`, value: (i) => i.p.decidedAt },
    { key: "why", header: "Reason", cell: (i) => <span className="text-xs text-muted-foreground">{i.p.rejectReason}</span>, hideOnMobile: true },
  ];
  return (
    <div className="animate-rise">
      <PageHeader
        title="Payments to verify"
        description={`Bank transfer slips uploaded by ${L.lowerMany}. Check the slip against the order, then verify it so the order can be packed, or reject it with a reason so she can upload it again.`}
      />
      <div className="mb-4">
        <FilterTabs
          value={tab}
          onChange={setTab}
          options={[
            { value: "waiting", label: "Waiting", count: waiting.length },
            { value: "done", label: "Decided", count: done.length },
          ]}
        />
      </div>
      {tab === "waiting" &&
        (waiting.length ? (
          <div className="space-y-4">
            {waiting.map((i) => {
              const c = consultantById(db, i.o.consultantId);
              const list = issues(i);
              const m = salesMonth(i.p.ts, db.settings.commission.cutoff);
              return (
                <Panel key={i.p.id} bodyClassName="p-0" className={cn(list.some((x) => x.tone === "danger") && "ring-1 ring-destructive/30")}>
                  <div className="grid gap-0 lg:grid-cols-[360px_minmax(0,1fr)]">
                    <div className="border-b border-border/60 bg-muted/30 p-4 lg:border-b-0 lg:border-r">
                      <BankSlipImage variant={i.p.proofImage ?? "slip-1"} amount={i.p.amount} reference={i.p.reference} payer={c ? fullName(c) : ""} when={i.p.ts} />
                      <p className="mt-2 text-center text-xs text-muted-foreground">Uploaded {relative(i.p.ts, now)} · {dateTime(i.p.ts)}</p>
                    </div>
                    <div className="flex min-w-0 flex-col p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <Link to={`/staff/consultant-orders/${i.o.id}`} className="font-display text-lg font-semibold hover:text-primary">
                            Order {i.o.id}
                          </Link>
                          <div className="mt-1">
                            <ConsultantCell c={c} />
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground">Counts toward {monthLabel(m)}</span>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <Compare label="Amount" order={lkr(i.o.total)} slip={lkr(i.p.amount)} ok={Math.abs(i.p.amount - i.o.total) < 0.01} />
                        <Compare label="Reference" order={i.o.id} slip={i.p.reference} ok={i.p.reference.toUpperCase() === i.o.id.toUpperCase()} soft />
                      </div>
                      <ul className="mt-4 space-y-1.5">
                        {list.length === 0 && (
                          <li className="flex items-center gap-2 text-sm text-success">
                            <CheckCircle2 className="size-4" /> Amount matches the order and the reference has not been used before
                          </li>
                        )}
                        {list.map((x, k) => (
                          <li key={k} className={cn("flex items-center gap-2 text-sm font-medium", x.tone === "danger" ? "text-destructive" : "text-warning")}>
                            <AlertTriangle className="size-4 shrink-0" />
                            {x.link ? (
                              <span>
                                {x.text.replace(/ order .*/, " order ")}
                                <Link to={x.link} className="underline">
                                  {i.p.duplicateOf}
                                </Link>
                              </span>
                            ) : (
                              x.text
                            )}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-auto flex flex-wrap justify-end gap-2 pt-5">
                        <Button variant="destructive" onClick={() => setReject(i)}>
                          <XCircle className="size-4" /> Reject
                        </Button>
                        <Button onClick={() => (list.length ? setVerify(i) : doVerify(i))}>
                          <ShieldCheck className="size-4" /> Verify payment
                        </Button>
                      </div>
                    </div>
                  </div>
                </Panel>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={<ShieldCheck className="size-5" />} title="No slips waiting" description={`When a ${L.lower} uploads a bank transfer slip it appears here, oldest first.`} />
        ))}
      {tab === "done" && <SimpleTable rows={done} columns={doneCols} rowKey={(i) => i.p.id} exportName="verified-payments" />}

      <Dialog open={!!verify} onOpenChange={(v) => !v && setVerify(undefined)}>
        <DialogContent>
          {verify && (
            <>
              <DialogHeader>
                <DialogTitle>Verify this payment anyway?</DialogTitle>
                <DialogDescription>
                  {issues(verify)
                    .map((x) => x.text)
                    .join(". ")}
                  . Verifying marks order {verify.o.id} as paid in full and sends it for packing.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setVerify(undefined)}>
                  Go back
                </Button>
                <Button onClick={() => doVerify(verify)}>Verify anyway</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <ReasonDialog
        open={!!reject}
        onOpenChange={(v) => !v && setReject(undefined)}
        title={reject ? `Reject the slip for ${reject.o.id}` : "Reject"}
        description={reject ? `${fullName(consultantById(db, reject.o.consultantId) ?? { givenName: "", surname: "" })} gets this reason by SMS and in the app, and can upload the slip again.` : undefined}
        confirmLabel="Reject slip"
        destructive
        placeholder={
          reject && reject.p.amount < reject.o.total
            ? `The slip shows ${lkr(reject.p.amount)}, ${lkr(reject.o.total - reject.p.amount)} less than the order total`
            : reject?.p.duplicateOf
              ? `This slip was already used for order ${reject.p.duplicateOf}`
              : "Reason"
        }
        onConfirm={(reason) => {
          if (!reject) return false;
          const r = actions.decidePayment(reject.o.id, reject.p.id, false, reason);
          act(r, `Slip rejected. The ${L.lower} has been told`);
          return r.ok;
        }}
      />
    </div>
  );
}

function Compare({ label, order, slip, ok, soft }: { label: string; order: string; slip: string; ok: boolean; soft?: boolean }) {
  return (
    <div className={cn("rounded-xl border p-3", ok ? "border-success/30 bg-success-soft/40" : soft ? "border-border" : "border-destructive/30 bg-danger-soft/40")}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 grid grid-cols-2 gap-2 text-sm">
        <div>
          <div className="text-[0.7rem] text-muted-foreground">Order</div>
          <div className="font-medium tabular">{order}</div>
        </div>
        <div>
          <div className="text-[0.7rem] text-muted-foreground">Slip</div>
          <div className={cn("font-medium tabular", !ok && !soft && "text-destructive")}>{slip}</div>
        </div>
      </div>
    </div>
  );
}
