// S38 Statements: pick a consultant and month for an A4 commission statement
// (print or Excel), the month's statements list, and the adjustments ledger.

import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowRight, FileSpreadsheet, FileText, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { EmptyState, PageHeader, Panel, SimpleTable, Status, StatusBadge, type Column } from "@/components/fc/ui";
import { NativeSelect } from "@/components/fc/docs";
import { Logo } from "@/components/fc/brand";
import { useDb } from "@/domain/db";
import { consultantById, fullName } from "@/domain/consultants";
import { pendingAdjustments, statement, whyNotQualified } from "@/domain/commission";
import { consultantCode, date, dateTime, lkr, maskTail, monthLabel } from "@/domain/format";
import type { CommissionAdjustment, CommissionLine } from "@/domain/types";
import { monthOptions, monthView } from "@/domain/ext/finance";
import { actorName, downloadExcel, useNow } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { cn } from "@/lib/utils";
import { Guard, NotFound } from "../../guard";
import { ConsultantCell, useLabel } from "../consultants/shared";
import { defaultMonth, LINE_STATUS, MONTH_STATUS } from "./labels";

export function StatementsPage() {
  return (
    <Guard perms={["payout.view"]}>
      <Statements />
    </Guard>
  );
}

function Statements() {
  const L = useLabel();
  usePageTitle("Statements");
  const db = useDb();
  const now = useNow();
  const nav = useNavigate();
  const months = useMemo(() => monthOptions(db, now), [db, now]);
  const [month, setMonth] = useState(() => {
    const closed = [...db.commissionMonths].sort((a, b) => b.id.localeCompare(a.id))[0];
    return closed?.id ?? defaultMonth(db, now);
  });
  const sponsors = useMemo(
    () => db.consultants.filter((c) => c.number !== undefined && db.consultants.some((t) => t.sponsorId === c.id && t.number !== undefined)).sort((a, b) => (a.number ?? 0) - (b.number ?? 0)),
    [db],
  );
  const [who, setWho] = useState(() => sponsors.find((s) => s.number !== 1)?.id ?? "");
  const view = useMemo(() => monthView(db, month), [db, month]);
  const lines = view.lines;
  const ledger = db.commissionAdjustments;
  const lineCols: Column<CommissionLine>[] = [
    {
      key: "c",
      header: "Sponsor",
      cell: (l) => <ConsultantCell c={consultantById(db, l.sponsorId)} link={false} />,
      value: (l) => fullName(consultantById(db, l.sponsorId) ?? { givenName: "", surname: "" }),
    },
    { key: "team", header: "Team sales", align: "right", className: "whitespace-nowrap", cell: (l) => lkr(l.teamSales), value: (l) => l.teamSales },
    { key: "q", header: "Qualified", cell: (l) => (l.qualifies ? <StatusBadge tone="success">Yes</StatusBadge> : <span className="text-xs text-muted-foreground">No</span>), value: (l) => (l.qualifies ? "Yes" : "No") },
    { key: "pay", header: "Payable", align: "right", className: "whitespace-nowrap", cell: (l) => <span className="font-medium">{lkr(l.payable)}</span>, value: (l) => l.payable },
    {
      key: "paid",
      header: "Payment",
      cell: (l) => {
        const p = db.payoutBatches.find((b) => b.month === month)?.lines.find((x) => x.consultantId === l.sponsorId);
        return p ? <Status>{LINE_STATUS[p.status]}</Status> : <span className="text-muted-foreground">{view.closed ? "Nothing to pay" : "Month open"}</span>;
      },
    },
    { key: "open", header: "", cell: () => <span className="text-sm text-primary">Statement</span> },
  ];
  const adjCols: Column<CommissionAdjustment>[] = [
    { key: "id", header: "Adjustment", cell: (a) => <span className="tabular">{a.id}</span>, value: (a) => a.id },
    { key: "ts", header: "Posted", cell: (a) => date(a.ts), value: (a) => a.ts },
    { key: "s", header: "Sponsor", cell: (a) => <ConsultantCell c={consultantById(db, a.sponsorId)} />, value: (a) => fullName(consultantById(db, a.sponsorId) ?? { givenName: "", surname: "" }) },
    { key: "amt", header: "Amount", align: "right", className: "whitespace-nowrap", cell: (a) => <span className={cn("tabular", a.amount < 0 && "text-destructive")}>{lkr(a.amount)}</span>, value: (a) => a.amount },
    { key: "why", header: "Reason", cell: (a) => <span className="text-sm">{prettyReason(a.reason)}</span>, value: (a) => prettyReason(a.reason) },
    {
      key: "order",
      header: "Order",
      cell: (a) =>
        a.orderId ? (
          <Link className="tabular text-primary hover:underline" to={`/staff/consultant-orders/${a.orderId}`} onClick={(e) => e.stopPropagation()}>
            {a.orderId}
          </Link>
        ) : null,
      value: (a) => a.orderId ?? "",
    },
    { key: "from", header: "Sale in", cell: (a) => monthLabel(a.fromMonth), value: (a) => a.fromMonth },
    { key: "in", header: "Netted in", cell: (a) => (a.appliedInMonth ? monthLabel(a.appliedInMonth) : <StatusBadge tone="warning">Next close</StatusBadge>), value: (a) => a.appliedInMonth ?? "Next close" },
    { key: "by", header: "By", cell: (a) => actorName(db, a.by), value: (a) => actorName(db, a.by), hideOnMobile: true },
  ];
  return (
    <div className="animate-rise">
      <PageHeader title="Statements and adjustments" description={`Monthly commission statements for each sponsor, to print or send, and every adjustment made after a month was closed.`} />
      <Panel title="Open a statement" className="mb-5">
        <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_220px_auto]">
          <div className="grid gap-1.5">
            <Label htmlFor="st-who">{L.one}</Label>
            <NativeSelect id="st-who" value={who} onChange={(e) => setWho(e.target.value)}>
              {sponsors.map((c) => (
                <option key={c.id} value={c.id}>
                  {consultantCode(c.number)} · {fullName(c)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="st-month">Month</Label>
            <NativeSelect id="st-month" value={month} onChange={(e) => setMonth(e.target.value)}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)} · {MONTH_STATUS[db.commissionMonths.find((x) => x.id === m)?.status ?? "open"]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Button disabled={!who} render={<Link to={`/staff/statements/${who}/${month}`} />}>
            <FileText className="size-4" /> Open statement
          </Button>
        </div>
      </Panel>
      <h2 className="mb-3 text-sm font-semibold">
        {monthLabel(month)} · {view.closed ? "locked" : "provisional"}
      </h2>
      <SimpleTable
        rows={lines.filter((l) => l.teamSales > 0 || l.payable > 0 || l.adjustments !== 0)}
        columns={lineCols}
        rowKey={(l) => l.sponsorId}
        onRowClick={(l) => nav(`/staff/statements/${l.sponsorId}/${month}`)}
        exportName={`statements-${month}`}
        empty={<EmptyState icon={<FileText className="size-5" />} title={`No statements for ${monthLabel(month)}`} />}
      />
      <h2 className="mb-3 mt-8 text-sm font-semibold">Adjustments ledger</h2>
      <SimpleTable
        rows={ledger}
        columns={adjCols}
        rowKey={(a) => a.id}
        exportName="commission-adjustments"
        empty={<EmptyState title="No adjustments" description="A refund on a sale from a closed month becomes an adjustment here, netted off the sponsor's next commission." />}
      />
    </div>
  );
}

// ---------- the statement itself ----------

export function StatementPage() {
  return (
    <Guard perms={["payout.view"]}>
      <StatementView />
    </Guard>
  );
}

function StatementView() {
  const { consultantId, month } = useParams();
  const db = useDb();
  const now = useNow();
  const L = useLabel();
  const c = consultantById(db, consultantId);
  usePageTitle(c && month ? `Statement ${consultantCode(c.number)} ${month}` : "Statement");
  if (!c || !month || !/^\d{4}-\d{2}$/.test(month)) return <NotFound />;
  const st = statement(db, c.id, month);
  const s = st.settings;
  const line = st.line;
  const adjustments = st.closed ? st.adjustments : pendingAdjustments(db, c.id);
  const sorted = [...st.team].sort((a, b) => b.sales - a.sales);
  const payout = st.payout;
  const batch = db.payoutBatches.find((b) => b.month === month);
  const carriedLater = db.payoutBatches.find((b) => b.month > month && b.lines.some((l) => l.consultantId === c.id && l.carriedFrom === month));
  const again = carriedLater?.lines.find((l) => l.consultantId === c.id && l.carriedFrom === month);
  const paymentText = !st.closed
    ? "Provisional. Paid after the month is closed"
    : !payout
      ? "Nothing to pay this month"
      : payout.status === "paid"
        ? `Paid${batch?.resultsAt ? ` ${date(batch.resultsAt)}` : ""}, bank reference ${payout.bankRef}`
        : payout.status === "failed"
          ? `Transfer failed: ${payout.failReason?.replace(/;.*/, "")}. ${carriedLater && again ? (again.status === "paid" ? `Paid again in ${carriedLater.id}, bank reference ${again.bankRef}` : `Moved to batch ${carriedLater.id}`) : "Goes into the next batch"}`
          : payout.status === "held"
            ? "Held until bank details are verified"
            : `To be paid to ${c.bank.bank} account ${maskTail(c.bank.accountNumber, 4)}`;
  const excel = () => {
    const rows: (string | number)[][] = [
      ["Statement", `${fullName(c)} ${consultantCode(c.number)}`],
      ["Month", monthLabel(month)],
      ["Status", st.closed ? "Locked" : "Provisional"],
      [],
      ["Team member", "Sales"],
      ...sorted.map((t) => [`${fullName(t.consultant)} ${consultantCode(t.consultant.number)}`, t.sales]),
      [],
      ["Team sales", line?.teamSales ?? 0],
      ["Own sales", line?.ownSales ?? st.ownSales],
      ["Threshold basis", line?.thresholdBasis ?? 0],
      ["Threshold", s.threshold],
      [`Commission at ${s.rate}%`, line?.amount ?? 0],
      ...adjustments.map((a) => [`Adjustment: ${prettyReason(a.reason)}`, a.amount]),
      ["Payable", line?.payable ?? 0],
      ["Payment", paymentText],
    ];
    void downloadExcel(`statement-${consultantCode(c.number)}-${month}.xlsx`, ["Item", "Value"], rows, "Statement");
  };
  return (
    <div className="animate-rise">
      <div className="no-print">
        <PageHeader
          back={{ to: "/staff/statements", label: "Statements" }}
          title={`Commission statement`}
          description={`${fullName(c)} · ${monthLabel(month)}`}
          actions={
            <>
              <Button variant="outline" onClick={excel}>
                <FileSpreadsheet className="size-4" /> Excel
              </Button>
              <Button onClick={() => window.print()}>
                <Printer className="size-4" /> Print or save as PDF
              </Button>
            </>
          }
        />
      </div>
      <div className="print-page mx-auto max-w-[210mm] rounded-2xl border border-border/70 bg-white p-8 text-[13px] text-neutral-900 shadow-soft md:p-12">
        <div className="flex items-start justify-between gap-6 border-b border-neutral-200 pb-6">
          <div>
            <Logo />
            <div className="mt-2 text-xs leading-relaxed text-neutral-500">
              {db.settings.company.name}
              <br />
              {db.settings.company.address}
              <br />
              {db.settings.company.phone} · {db.settings.company.email}
            </div>
          </div>
          <div className="text-right">
            <div className="font-display text-xl font-semibold">Commission statement</div>
            <div className="mt-1 text-sm">{monthLabel(month)}</div>
            <div className={cn("mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium", st.closed ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>{st.closed ? "Final" : "Provisional"}</div>
          </div>
        </div>
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <div className="text-xs uppercase tracking-wider text-neutral-500">{L.one}</div>
            <div className="mt-1 font-semibold">
              {fullName(c)} · {consultantCode(c.number)}
            </div>
            <div className="text-neutral-600">
              {c.address}, {c.city} {c.postalCode}
            </div>
          </div>
          <div className="sm:text-right">
            <div className="text-xs uppercase tracking-wider text-neutral-500">Issued</div>
            <div className="mt-1">{dateTime(now)}</div>
            <div className="text-neutral-600">Paid to {c.bank.bank}, account {maskTail(c.bank.accountNumber, 4)}</div>
          </div>
        </div>

        <h3 className="mt-8 text-xs font-semibold uppercase tracking-wider text-neutral-500">Your direct team</h3>
        <table className="mt-2 w-full">
          <thead>
            <tr className="border-b border-neutral-300 text-left text-xs text-neutral-500">
              <th className="py-2 font-medium">Team member</th>
              <th className="py-2 font-medium">Number</th>
              <th className="py-2 font-medium">Joined</th>
              <th className="py-2 text-right font-medium">Sales ({s.base === "mrp" ? "MRP value" : "net"})</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => (
              <tr key={t.consultant.id} className="border-b border-neutral-100">
                <td className="py-1.5">{fullName(t.consultant)}</td>
                <td className="py-1.5 tabular">{consultantCode(t.consultant.number)}</td>
                <td className="py-1.5">{date(t.consultant.joinedAt)}</td>
                <td className={cn("py-1.5 text-right tabular", !t.sales && "text-neutral-400")}>{lkr(t.sales, { prefix: false })}</td>
              </tr>
            ))}
            {!sorted.length && (
              <tr>
                <td colSpan={4} className="py-3 text-center text-neutral-500">
                  No team members
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="mt-8 grid gap-8 sm:grid-cols-[minmax(0,1fr)_280px]">
          <div className="text-xs leading-relaxed text-neutral-600">
            <div className="mb-1 font-semibold text-neutral-800">How this is worked out</div>
            {s.rate}% of your direct team's sales, on {s.base === "mrp" ? "MRP value" : `net ${L.lower} sales`}. You qualify when{" "}
            {s.thresholdCounts === "team_plus_own" ? "team plus own sales" : "team sales"} reach {lkr(s.threshold, { decimals: false })} in the month
            {s.referralTest.enabled ? ` and at least ${s.referralTest.min} team member${s.referralTest.min > 1 ? "s" : ""} ordered` : ""}. Sales count in the month they were paid; cancelled and refunded orders, tax and delivery are not counted.
            {st.margin > 0 && (
              <div className="mt-3">
                Your own margin this month, earned when you sell at MRP and not paid by FemmeCare: <span className="font-medium text-neutral-800">{lkr(st.margin)}</span>.
              </div>
            )}
          </div>
          <table className="w-full self-start">
            <tbody>
              <SumRow label="Team sales" value={lkr(line?.teamSales ?? 0)} />
              <SumRow label="Own sales" value={lkr(line?.ownSales ?? st.ownSales)} />
              <SumRow label={`Threshold basis (need ${lkr(s.threshold, { decimals: false })})`} value={lkr(line?.thresholdBasis ?? 0)} />
              <SumRow label="Qualified" value={line?.qualifies ? "Yes" : `No${line ? `: ${whyNotQualified(db, line, s)}` : ""}`} />
              <SumRow label={`Commission at ${s.rate}%`} value={lkr(line?.amount ?? 0)} strong />
              {adjustments.map((a) => (
                <SumRow key={a.id} label={`Adjustment: ${a.orderId ? `refund of ${a.orderId} (${monthLabel(a.fromMonth)} sale)` : prettyReason(a.reason)}`} value={lkr(a.amount)} />
              ))}
              <tr className="border-t-2 border-neutral-800">
                <td className="py-2 font-semibold">Payable</td>
                <td className="py-2 text-right font-display text-lg font-semibold tabular">{lkr(line?.payable ?? 0)}</td>
              </tr>
              <tr>
                <td colSpan={2} className="pt-1 text-xs text-neutral-600">
                  {paymentText}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-10 border-t border-neutral-200 pt-4 text-center text-[11px] text-neutral-400">
          {db.settings.company.name} · Reg. {db.settings.company.regNo} · This statement is produced by the FemmeCare Sales System
        </div>
      </div>
      <div className="no-print mt-4 text-center">
        <Button variant="ghost" render={<Link to={`/staff/consultants/${c.id}`} />}>
          {fullName(c)}'s profile <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

/** Adjustment reasons name months by key ("2027-01"); show them as words. */
function prettyReason(r: string) {
  return r.replace(/\b(\d{4}-\d{2})\b/g, (m) => monthLabel(m));
}

function SumRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <tr className="border-b border-neutral-100">
      <td className={cn("py-1.5 pr-3 text-neutral-600", strong && "font-medium text-neutral-900")}>{label}</td>
      <td className={cn("py-1.5 text-right tabular", strong && "font-semibold")}>{value}</td>
    </tr>
  );
}
