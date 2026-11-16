// C7 Earnings: this month's provisional commission with the working shown, own
// margin (not paid by FemmeCare), past months with their status, statements with a
// print view, and commission payment history.

import { useMemo } from "react";
import { Link, useParams } from "react-router";
import { ChevronRight, CircleAlert, CircleCheck, FileSpreadsheet, Info, Landmark, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/fc/brand";
import { PageHeader, ProgressBar, Status, StatusBadge } from "@/components/fc/ui";
import { useDb } from "@/domain/db";
import { fullName, consultantById } from "@/domain/consultants";
import { pendingAdjustments } from "@/domain/commission";
import { consultantCode, date, lkr, maskTail, monthKey, monthLabel } from "@/domain/format";
import { activeMonths, labels, monthFigures, paymentHistory, type MonthFigures } from "@/domain/ext/consultant-app";
import { downloadExcel, useConsultant, useNow } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { cn } from "@/lib/utils";
import { Card, SectionTitle } from "./bits";

function baseWords(f: MonthFigures) {
  return f.settings.base === "mrp" ? "at MRP value" : "at the price they paid";
}

export function Earnings() {
  usePageTitle("Earnings");
  const c = useConsultant()!;
  const db = useDb();
  const now = useNow();
  const thisMonth = monthKey(now);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const months = useMemo(() => activeMonths(db, c.id, now, 12), [db, c.id, thisMonth]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const figs = useMemo(() => months.map((m) => monthFigures(db, c.id, m, now)), [db, c.id, months]);
  const cur = figs[0];
  const past = figs.slice(1);
  const history = paymentHistory(db, c.id);
  const adjustments = pendingAdjustments(db, c.id);
  if (!cur) return null;
  const s = cur.settings;
  const met = cur.thresholdBasis >= s.threshold;

  return (
    <div>
      <PageHeader title="Earnings" description="Commission from your direct team, paid to your bank each month after it's closed." />

      {/* this month */}
      <div className="relative overflow-hidden rounded-3xl bg-[linear-gradient(135deg,oklch(0.36_0.08_350),oklch(0.26_0.06_330))] p-5 text-white shadow-lift">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-white/75">Commission so far · {cur.label}</span>
          <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium">{cur.state}</span>
        </div>
        <div className="mt-2 font-display text-4xl font-semibold tabular">{lkr(cur.amount)}</div>
        <p className="mt-2 text-sm text-white/75">{cur.stateNote}</p>
        <Link to={`/app/earnings/${cur.month}`} className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-white hover:underline">
          Statement so far <ChevronRight className="size-4" />
        </Link>
      </div>

      {/* working */}
      <SectionTitle>How it's worked out</SectionTitle>
      <Card className="space-y-3 text-sm">
        <Line k={`Your direct team's sales, ${baseWords(cur)}`} v={lkr(cur.teamSales)} note={`${cur.activeReferrals} of ${cur.teamSize} ordered`} />
        {s.ownSalesEarn && <Line k="Plus your own sales" v={lkr(cur.ownSales)} />}
        <Line k={`Commission rate`} v={`× ${s.rate}%`} />
        <div className="border-t border-dashed border-border pt-3">
          <Line
            k={<span className="font-semibold text-foreground">Commission</span>}
            v={<span className="font-semibold">{cur.qualifies ? lkr(cur.amount) : lkr(0)}</span>}
            note={cur.qualifies ? `${lkr(cur.commissionable)} × ${s.rate}%` : "Target not reached yet"}
          />
        </div>
        <div className="rounded-xl bg-muted/50 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">
              Target: {s.thresholdCounts === "team_plus_own" ? "team and own sales" : "team sales"} of {lkr(s.threshold, { decimals: false })}
            </span>
            {met ? (
              <StatusBadge tone="success">
                <CircleCheck className="size-3" /> Met
              </StatusBadge>
            ) : (
              <StatusBadge tone="warning">Not yet</StatusBadge>
            )}
          </div>
          <ProgressBar value={cur.thresholdBasis} max={s.threshold} tone={met ? "success" : "brand"} className="mt-2" />
          <div className="mt-1 text-xs text-muted-foreground tabular">
            {lkr(cur.thresholdBasis)} so far{s.thresholdCounts === "team_plus_own" ? ` (team ${lkr(cur.teamSales)} + you ${lkr(cur.ownSales)})` : ""}
          </div>
          {s.referralTest.enabled && (
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2">
              <span>Team members who ordered</span>
              <span className={cn("font-semibold tabular", cur.activeReferrals >= s.referralTest.min ? "text-success" : "text-warning")}>
                {cur.activeReferrals} of {s.referralTest.min} needed
              </span>
            </div>
          )}
          {cur.why && <p className="mt-2 text-xs text-muted-foreground">{cur.why}.</p>}
        </div>
        {cur.adjustments !== 0 && (
          <div className="space-y-1.5">
            {adjustments.map((a) => (
              <Line key={a.id} k={<span className="text-destructive">Adjustment: {a.reason}</span>} v={<span className="text-destructive">{lkr(a.amount)}</span>} />
            ))}
            <Line k={<span className="font-semibold text-foreground">To be paid</span>} v={<span className="font-semibold">{lkr(cur.payable)}</span>} />
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Sales count in the month they are paid. Cancelled and refunded orders, tax and delivery charges don't count. {s.ownSalesEarn ? "" : "Your own sales count toward the target but don't earn commission."}
        </p>
      </Card>

      {/* own margin */}
      <SectionTitle>Your own margin</SectionTitle>
      <Card className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-success-soft text-success">
          <CircleCheck className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold">{cur.label}</span>
            <span className="font-display text-lg font-semibold tabular text-success">{lkr(cur.margin)}</span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            What you keep when you sell your {cur.label} orders at the MRP. It's yours at the point of sale; FemmeCare doesn't pay it.
          </p>
        </div>
      </Card>

      {/* bank */}
      {(!c.bankVerified || c.pendingBank) && (
        <Link to="/app/profile" className="mt-3 flex items-center gap-3 rounded-2xl bg-warning-soft px-4 py-3 text-sm ring-1 ring-inset ring-warning/20">
          <CircleAlert className="size-5 shrink-0 text-warning" />
          <span className="min-w-0 flex-1">
            <span className="font-medium">{c.pendingBank ? "New bank details waiting for verification" : "Your bank details aren't verified yet"}</span>
            <span className="block text-muted-foreground">Payouts are held until FemmeCare checks them. Tap to see your details.</span>
          </span>
          <ChevronRight className="size-4 text-muted-foreground" />
        </Link>
      )}

      {/* past months */}
      <SectionTitle>Past months</SectionTitle>
      {past.length ? (
        <Card className="p-0">
          <ul className="divide-y divide-border">
            {past.map((f) => (
              <li key={f.month}>
                <Link to={`/app/earnings/${f.month}`} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-muted/40">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{f.label}</span>
                      <span className="text-sm font-semibold tabular">{lkr(f.closed ? f.payable : f.amount)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">Team sales {lkr(f.teamSales)}</span>
                      <Status>{f.state}</Status>
                    </div>
                    {(f.state === "Held" || f.state === "Failed") && f.stateNote && <p className="mt-1 text-xs text-destructive">{f.stateNote}</p>}
                    {f.state === "Provisional" && f.ended && <p className="mt-1 text-xs text-muted-foreground">Month ended, being closed by FemmeCare</p>}
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card className="text-sm text-muted-foreground">Your first statement appears here after your first full month.</Card>
      )}

      {/* payments */}
      <SectionTitle>Payment history</SectionTitle>
      {history.length ? (
        <div className="grid gap-2">
          {history.map((h, i) => (
            <Card key={`${h.batchId}-${i}`} className="flex items-center gap-3 p-3.5">
              <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", h.status === "paid" ? "bg-success-soft text-success" : h.status === "failed" ? "bg-danger-soft text-destructive" : "bg-muted text-muted-foreground")}>
                <Landmark className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{monthLabel(h.month)}</span>
                  <span className="shrink-0 whitespace-nowrap text-sm font-semibold tabular">{lkr(h.amount)}</span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-muted-foreground">
                    {h.status === "paid" ? `Paid ${date(h.when)}${h.bankRef ? ` · ${h.bankRef}` : ""}` : h.failReason ?? `Commission, ${date(h.when)}`}
                    {h.carried && " · paid again"}
                  </span>
                  <Status>{h.status === "paid" ? "Paid" : h.status === "failed" ? "Failed" : h.status === "held" ? "Held" : "Approved"}</Status>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="text-sm text-muted-foreground">No commission payments yet.</Card>
      )}
      <p className="mt-4 flex gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        Paid to {c.bank.bank}, account {maskTail(c.bank.accountNumber)}. A failed payment is retried with the next month's payout.
      </p>
    </div>
  );
}

function Line({ k, v, note }: { k: React.ReactNode; v: React.ReactNode; note?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 text-muted-foreground">
        {k}
        {note && <div className="text-xs">{note}</div>}
      </div>
      <div className="shrink-0 font-medium tabular">{v}</div>
    </div>
  );
}

// ---------- statement (print view) ----------

export function Statement() {
  const { month = "" } = useParams();
  const c = useConsultant()!;
  const db = useDb();
  const now = useNow();
  const valid = /^\d{4}-\d{2}$/.test(month) && month <= monthKey(now);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const f = useMemo(() => (valid ? monthFigures(db, c.id, month, now) : undefined), [db, c.id, month, valid]);
  usePageTitle(f ? `Statement ${f.label}` : "Statement");
  const L = labels(db);
  if (!f)
    return (
      <div>
        <PageHeader title="Statement" back={{ to: "/app/earnings", label: "Earnings" }} />
        <Card className="text-sm text-muted-foreground">There is no statement for that month.</Card>
      </div>
    );
  const s = f.settings;
  const sponsor = consultantById(db, c.sponsorId);
  const co = db.settings.company;
  const adj = f.closed ? db.commissionAdjustments.filter((a) => a.sponsorId === c.id && a.appliedInMonth === f.month) : [];
  const exportXlsx = () =>
    void downloadExcel(
      `FemmeCare statement ${consultantCode(c.number)} ${f.month}.xlsx`,
      ["Team member", "Number", "Sales (LKR)"],
      [
        ...f.team.map((t) => [fullName(t.consultant), consultantCode(t.consultant.number), t.sales]),
        ["Team sales", "", f.teamSales],
        ["Own sales", "", f.ownSales],
        [`Commission at ${s.rate}%`, "", f.amount],
        ["Adjustments", "", f.adjustments],
        ["Payable", "", f.payable],
      ],
      "Statement",
    );

  return (
    <div>
      <div className="no-print">
        <PageHeader
          title={`Statement, ${f.label}`}
          back={{ to: "/app/earnings", label: "Earnings" }}
          actions={
            <>
              <Button variant="outline" size="sm" className="rounded-full" onClick={exportXlsx}>
                <FileSpreadsheet className="size-4" /> Excel
              </Button>
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => window.print()}>
                <Printer className="size-4" /> Print or PDF
              </Button>
            </>
          }
        />
      </div>
      <div className="print-page overflow-x-auto rounded-2xl bg-white p-5 text-[0.82rem] text-neutral-800 shadow-soft ring-1 ring-border sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Logo />
            <div className="mt-2 text-xs text-neutral-500">
              {co.name} · {co.address}
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold tracking-wide">COMMISSION STATEMENT</div>
            <div className="text-xs text-neutral-500">{f.label}</div>
            <div className="mt-1">
              <Status>{f.state}</Status>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-[0.68rem] uppercase tracking-wider text-neutral-500">{L.one}</div>
            <div className="font-medium">{fullName(c)}</div>
            <div className="text-neutral-600">{consultantCode(c.number)}</div>
            {sponsor && <div className="text-neutral-600">Sponsor: {sponsor.number === 1 ? "FemmeCare" : `${fullName(sponsor)}, ${consultantCode(sponsor.number)}`}</div>}
          </div>
          <div className="sm:text-right">
            <div className="text-[0.68rem] uppercase tracking-wider text-neutral-500">Rules for this month</div>
            <div className="text-neutral-600">
              {s.rate}% of direct team sales {s.base === "mrp" ? "at MRP value" : "at net price"}
            </div>
            <div className="text-neutral-600">
              Target {lkr(s.threshold, { decimals: false })} of {s.thresholdCounts === "team_plus_own" ? "team and own" : "team"} sales
            </div>
            {s.referralTest.enabled && <div className="text-neutral-600">At least {s.referralTest.min} team members who ordered</div>}
          </div>
        </div>

        <table className="mt-6 w-full">
          <thead>
            <tr className="border-b border-neutral-300 text-left text-[0.7rem] uppercase tracking-wider text-neutral-500">
              <th className="py-2 font-medium">Team member</th>
              <th className="py-2 font-medium">Number</th>
              <th className="py-2 text-right font-medium">Sales (LKR)</th>
            </tr>
          </thead>
          <tbody>
            {f.team.map((t) => (
              <tr key={t.consultant.id} className="border-b border-neutral-100">
                <td className="py-1.5">{fullName(t.consultant)}</td>
                <td className="py-1.5 text-neutral-500">{consultantCode(t.consultant.number)}</td>
                <td className="py-1.5 text-right tabular">{lkr(t.sales, { prefix: false })}</td>
              </tr>
            ))}
            {!f.team.length && (
              <tr>
                <td colSpan={3} className="py-3 text-neutral-500">
                  No team members in this month.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="ml-auto mt-5 grid max-w-sm gap-1.5">
          <SRow k="Direct team sales" v={lkr(f.teamSales)} />
          <SRow k="Your own sales" v={lkr(f.ownSales)} />
          <SRow k={`Counted toward the target`} v={`${lkr(f.thresholdBasis)} ${f.thresholdBasis >= s.threshold ? "(met)" : "(not met)"}`} />
          {s.referralTest.enabled && <SRow k="Team members who ordered" v={`${f.activeReferrals} of ${s.referralTest.min}`} />}
          <SRow k={`Commission, ${s.rate}% of ${lkr(f.commissionable)}`} v={lkr(f.amount)} />
          {(adj.length ? adj : f.adjustments !== 0 ? pendingAdjustments(db, c.id) : []).map((a) => (
            <SRow key={a.id} k={`Adjustment: ${a.reason}`} v={lkr(a.amount)} />
          ))}
          <div className="mt-1 flex justify-between border-t border-neutral-300 pt-2 text-base font-semibold">
            <span>{f.closed ? "Payable" : "Provisional total"}</span>
            <span className="tabular">{lkr(f.closed ? f.payable : Math.max(0, f.amount + f.adjustments))}</span>
          </div>
        </div>

        <div className="mt-6 rounded-lg bg-neutral-50 p-3 text-xs text-neutral-600">
          {f.payout?.status === "paid" && `Paid ${lkr(f.payout.amount)} to ${c.bank.bank}, account ${maskTail(c.bank.accountNumber)}. Bank reference ${f.payout.bankRef}.`}
          {f.payout?.status === "failed" && `The bank could not complete the payment: ${f.payout.failReason}. It is retried with the next payout.`}
          {f.payout?.status === "held" && `Payment held: ${f.payout.failReason}. It is paid once FemmeCare verifies your bank details.`}
          {f.payout?.status === "pending" && "Approved. Payment is on its way to your bank account."}
          {!f.payout && (f.closed ? (f.payable > 0 ? "Approved at month-end close. Payment follows shortly." : "No commission for this month.") : "Provisional: this month is still open. Figures are final once the month is closed.")}
          {f.why && ` ${f.why}.`}
        </div>
        <div className="mt-3 text-xs text-neutral-500">
          Your own margin for {f.label}, kept when you sell at the MRP and not paid by FemmeCare: {lkr(f.margin)}.
        </div>
        <div className="mt-6 text-center text-[0.7rem] text-neutral-400">Issued {date(now)}. Questions about this statement? Call {co.phone}.</div>
      </div>
    </div>
  );
}

function SRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-neutral-600">{k}</span>
      <span className="shrink-0 tabular">{v}</span>
    </div>
  );
}
