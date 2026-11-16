// S37 Payouts: batches list, and the batch page to approve, create the bank file and
// record the bank's results. Failed payouts go into the next month's batch.

import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Banknote, CheckCircle2, Download, FileSpreadsheet, ListChecks, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, Kpi, PageHeader, Panel, SimpleTable, Status, Steps, type Column } from "@/components/fc/ui";
import { NativeSelect } from "@/components/fc/docs";
import { useDb } from "@/domain/db";
import { actions } from "@/domain/actions";
import { consultantById, fullName } from "@/domain/consultants";
import { bankFileCsv } from "@/domain/commission";
import { consultantCode, date, dateTime, lkr, monthLabel, nextMonthKey } from "@/domain/format";
import type { PayoutBatch, PayoutLine } from "@/domain/types";
import { act, actorName, downloadText, useCan } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { Guard, NotFound } from "../../guard";
import { ConsultantCell, maskedAccount, useLabel } from "../consultants/shared";
import { BATCH_STATUS, LINE_STATUS } from "./labels";

const BATCH_STEP: Record<PayoutBatch["status"], number> = { draft: 0, approved: 1, file_generated: 2, results_recorded: 3 };


const FAIL_REASONS = ["Account number not valid at the bank", "Account closed at the bank", "Name does not match the account", "Bank returned the transfer"];

const totalOf = (b: PayoutBatch, s?: PayoutLine["status"][]) => b.lines.filter((l) => !s || s.includes(l.status)).reduce((a, l) => a + l.amount, 0);

export function PayoutsPage() {
  return (
    <Guard perms={["payout.view"]}>
      <PayoutBatches />
    </Guard>
  );
}

function PayoutBatches() {
  usePageTitle("Payouts");
  const db = useDb();
  const nav = useNavigate();
  const L = useLabel();
  const batches = db.payoutBatches;
  const cols: Column<PayoutBatch>[] = [
    { key: "id", header: "Batch", cell: (b) => <span className="tabular">{b.id}</span>, value: (b) => b.id },
    { key: "month", header: "Commission for", cell: (b) => monthLabel(b.month), value: (b) => b.month },
    { key: "created", header: "Created", cell: (b) => date(b.createdAt), value: (b) => b.createdAt },
    { key: "n", header: L.many, align: "right", className: "whitespace-nowrap", cell: (b) => b.lines.length, value: (b) => b.lines.length },
    { key: "total", header: "Total", align: "right", className: "whitespace-nowrap", cell: (b) => <span className="whitespace-nowrap">{lkr(totalOf(b))}</span>, value: (b) => totalOf(b) },
    { key: "paid", header: "Paid", align: "right", className: "whitespace-nowrap", cell: (b) => <span className="whitespace-nowrap">{lkr(totalOf(b, ["paid"]))}</span>, value: (b) => totalOf(b, ["paid"]) },
    {
      key: "failed",
      header: "Failed or held",
      align: "right",
      cell: (b) => {
        const n = b.lines.filter((l) => l.status === "failed" || l.status === "held").length;
        return n ? <span className="text-destructive">{n}</span> : <span className="text-muted-foreground">0</span>;
      },
      value: (b) => b.lines.filter((l) => l.status === "failed" || l.status === "held").length,
    },
    { key: "status", header: "Status", cell: (b) => <Status>{BATCH_STATUS[b.status]}</Status>, value: (b) => BATCH_STATUS[b.status] },
  ];
  return (
    <div className="animate-rise">
      <PageHeader title="Payouts" description="One batch per closed month. Finance approves it, sends the bank file, and records what the bank paid. Failed payments go into the next batch." />
      <SimpleTable
        rows={batches}
        columns={cols}
        rowKey={(b) => b.id}
        rowHref={(b) => `/staff/payouts/${b.id}`}
        onRowClick={(b) => nav(`/staff/payouts/${b.id}`)}
        searchable={false}
        exportName="payout-batches"
        empty={<EmptyState icon={<Banknote className="size-5" />} title="No payout batches yet" description="A batch is created when a month is closed." action={<Button render={<Link to="/staff/month-end" />}>Month-end close</Button>} />}
      />
    </div>
  );
}

export function PayoutBatchPage() {
  return (
    <Guard perms={["payout.view"]}>
      <PayoutBatchDetail />
    </Guard>
  );
}

function PayoutBatchDetail() {
  const { id } = useParams();
  const db = useDb();
  const L = useLabel();
  const b = db.payoutBatches.find((x) => x.id === id);
  usePageTitle(b ? `Payout batch ${b.id}` : "Payout batch");
  const canApprove = useCan("payout.approve");
  const [approveOpen, setApproveOpen] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [failed, setFailed] = useState<string[]>([]);
  const [reason, setReason] = useState(FAIL_REASONS[0]);
  if (!b) return <NotFound />;
  const later = db.payoutBatches.filter((x) => x.month > b.month).sort((x, y) => x.month.localeCompare(y.month))[0];
  const pending = b.lines.filter((l) => l.status === "pending");
  // one bank transfer per account: lines for the same person succeed or fail together
  const payees = [...new Set(pending.map((l) => l.consultantId))].map((id) => {
    const ls = pending.filter((l) => l.consultantId === id);
    return { id, amount: ls.reduce((a, l) => a + l.amount, 0), n: ls.length };
  });
  const failedLines = pending.filter((l) => failed.includes(l.consultantId)).length;
  const download = () => downloadText(`femmecare-commission-${b.month}.csv`, bankFileCsv(db, b.id));
  const createFile = () => {
    const r = actions.markFileGenerated(b.id);
    if (r.ok) download();
    act(r, "Bank file created. Upload it to the bank's business portal");
  };
  const record = (fails: string[]) => {
    const r = actions.recordResults(b.id, fails, reason);
    act(r, fails.length ? `${pending.length - failedLines} paid, ${failedLines} failed` : `All ${pending.length} paid`);
    if (r.ok) {
      setResultsOpen(false);
      setFailed([]);
    }
  };
  const note = (l: PayoutLine) => {
    if (l.status === "failed" && l.carriedFrom === "moved") return l.failReason;
    if (l.status === "failed") return `${l.failReason}. Goes into the next batch`;
    if (l.status === "held") return `${l.failReason ?? "Held"}. Carried until verified`;
    if (l.carriedFrom) return `Carried from ${monthLabel(l.carriedFrom)}`;
    return undefined;
  };
  const cols: Column<PayoutLine>[] = [
    {
      key: "c",
      header: L.one,
      cell: (l) => <ConsultantCell c={consultantById(db, l.consultantId)} />,
      value: (l) => {
        const c = consultantById(db, l.consultantId);
        return c ? `${fullName(c)} (${consultantCode(c.number)})` : "";
      },
    },
    {
      key: "bank",
      header: "Bank account",
      cell: (l) => {
        const c = consultantById(db, l.consultantId);
        return c ? (
          <span className="text-sm">
            {c.bank.bank} <span className="tabular text-muted-foreground">{maskedAccount(c.bank.accountNumber)}</span>
            {!c.bankVerified && <span className="block text-xs text-warning">Not verified</span>}
            {c.pendingBank && <span className="block text-xs text-warning">New details waiting</span>}
          </span>
        ) : null;
      },
      value: (l) => consultantById(db, l.consultantId)?.bank.bank,
    },
    { key: "amt", header: "Amount", align: "right", className: "whitespace-nowrap", cell: (l) => <span className="whitespace-nowrap font-medium">{lkr(l.amount)}</span>, value: (l) => l.amount },
    { key: "from", header: "Carried from", cell: (l) => (l.carriedFrom && l.carriedFrom !== "moved" ? monthLabel(l.carriedFrom) : <span className="text-muted-foreground">-</span>), value: (l) => l.carriedFrom ?? "" },
    { key: "st", header: "Status", cell: (l) => <Status>{LINE_STATUS[l.status]}</Status>, value: (l) => LINE_STATUS[l.status] },
    { key: "ref", header: "Bank reference", cell: (l) => <span className="tabular text-sm">{l.bankRef}</span>, value: (l) => l.bankRef ?? "" },
    { key: "note", header: "Note", cell: (l) => <span className="text-xs text-muted-foreground">{note(l)}</span>, value: (l) => note(l) ?? "" },
  ];
  return (
    <div className="animate-rise">
      <PageHeader
        back={{ to: "/staff/payouts", label: "Payouts" }}
        eyebrow={`Commission for ${monthLabel(b.month)}`}
        title={`Payout batch ${b.id}`}
        description={`Created ${dateTime(b.createdAt)} when ${monthLabel(b.month)} was closed.`}
        actions={
          <>
            {canApprove && b.status !== "draft" && b.status !== "approved" && (
              <Button variant="outline" onClick={download}>
                <Download className="size-4" /> Bank file
              </Button>
            )}
            {canApprove && b.status === "draft" && (
              <Button onClick={() => setApproveOpen(true)}>
                <ShieldCheck className="size-4" /> Approve batch
              </Button>
            )}
            {canApprove && b.status === "approved" && (
              <Button onClick={createFile}>
                <FileSpreadsheet className="size-4" /> Create bank file
              </Button>
            )}
            {canApprove && b.status === "file_generated" && (
              <Button onClick={() => setResultsOpen(true)}>
                <ListChecks className="size-4" /> Record bank results
              </Button>
            )}
          </>
        }
      />
      <Panel className="mb-5" bodyClassName="px-5 py-4">
        <Steps steps={["Waiting for approval", "Approved", "Bank file created", "Results recorded"]} current={BATCH_STEP[b.status]} />
        <div className="mt-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-3">
          {b.approvedBy && <span>Approved by {actorName(db, b.approvedBy)}, {dateTime(b.approvedAt)}</span>}
          {b.fileGeneratedAt && <span>Bank file created {dateTime(b.fileGeneratedAt)}</span>}
          {b.resultsAt && <span>Results recorded {dateTime(b.resultsAt)}</span>}
        </div>
        {!canApprove && b.status !== "results_recorded" && <p className="mt-3 text-sm text-muted-foreground">Finance approves the batch and handles the bank file.</p>}
      </Panel>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="To be paid" value={lkr(totalOf(b, ["pending"]))} sub={`${pending.length} ${pending.length === 1 ? L.lower : L.lowerMany}`} icon={<Banknote className="size-5" />} />
        <Kpi label="Paid" value={lkr(totalOf(b, ["paid"]))} sub={`${b.lines.filter((l) => l.status === "paid").length} transfers`} icon={<CheckCircle2 className="size-5" />} tone="success" />
        <Kpi label="Failed" value={lkr(totalOf(b, ["failed"]))} sub={`${b.lines.filter((l) => l.status === "failed").length} to pay again`} tone="danger" />
        <Kpi label="Held" value={lkr(totalOf(b, ["held"]))} sub="Bank details not verified" tone="warning" />
      </div>
      {b.lines.some((l) => l.status === "failed" && l.carriedFrom !== "moved") && (
        <div className="mb-4 rounded-2xl border border-destructive/20 bg-danger-soft/50 p-4 text-sm">
          Failed payouts are paid again in the next batch, which is created when {monthLabel(nextMonthKey(b.month))} is closed.{" "}
          {canApprove && `Check the bank details with the ${L.lower} before then.`}
        </div>
      )}
      {later && b.lines.some((l) => l.carriedFrom === "moved") && (
        <div className="mb-4 rounded-2xl border border-border bg-muted/40 p-4 text-sm">
          Failed payouts from this batch were moved to{" "}
          <Link to={`/staff/payouts/${later.id}`} className="font-medium text-primary hover:underline">
            {later.id}
          </Link>
          .
        </div>
      )}
      <SimpleTable rows={b.lines} columns={cols} rowKey={(l) => `${l.consultantId}-${l.carriedFrom ?? ""}-${l.amount}`} exportName={`payout-${b.id}`} searchable={b.lines.length > 10} pageSize={30} />
      <div className="mt-2 flex justify-end rounded-xl bg-muted/50 px-4 py-3 text-sm">
        Batch total <span className="ml-2 font-semibold tabular">{lkr(totalOf(b))}</span>
      </div>

      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve {b.id}?</DialogTitle>
            <DialogDescription>
              {pending.length} transfers totalling {lkr(totalOf(b, ["pending"]))} will go in the bank file. {b.lines.filter((l) => l.status === "held").length} held lines are not paid until their bank details are verified.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                act(actions.approvePayout(b.id), "Payout batch approved");
                setApproveOpen(false);
              }}
            >
              Approve batch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resultsOpen} onOpenChange={setResultsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Record bank results</DialogTitle>
            <DialogDescription>Tick the transfers the bank could not make. Everything else is marked paid and the {L.lower} gets an SMS.</DialogDescription>
          </DialogHeader>
          <ul className="max-h-72 divide-y divide-border/60 overflow-y-auto rounded-xl border border-border/70">
            {payees.map((l) => {
              const c = consultantById(db, l.id);
              const on = failed.includes(l.id);
              return (
                <li key={l.id} className="flex items-center gap-3 px-3 py-2">
                  <Checkbox id={`f-${l.id}`} checked={on} onCheckedChange={(v) => setFailed((f) => (v ? [...f, l.id] : f.filter((x) => x !== l.id)))} />
                  <label htmlFor={`f-${l.id}`} className="min-w-0 flex-1 cursor-pointer text-sm">
                    <span className="block font-medium">{c ? fullName(c) : l.id}</span>
                    <span className="block text-xs text-muted-foreground">
                      {c?.bank.bank} {maskedAccount(c?.bank.accountNumber)}
                      {l.n > 1 && ` · ${l.n} lines`}
                    </span>
                  </label>
                  <span className="whitespace-nowrap tabular text-sm">{lkr(l.amount)}</span>
                  {on && <Status>Failed</Status>}
                </li>
              );
            })}
          </ul>
          {failed.length > 0 && (
            <div className="grid gap-2">
              <Label htmlFor="fail-reason">Reason the bank gave</Label>
              <NativeSelect id="fail-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
                {FAIL_REASONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </NativeSelect>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => record([])} disabled={failed.length > 0}>
              All paid
            </Button>
            <Button onClick={() => record(failed)} disabled={!failed.length}>
              Save: {pending.length - failedLines} paid, {failedLines} failed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
