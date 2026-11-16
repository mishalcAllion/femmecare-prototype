// S36 Month-end close: checks, calculate, review exceptions, then close and lock.
// Closing creates the payout batch, carrying failed and held payouts forward.

import { useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { AlertTriangle, ArrowLeft, ArrowRight, BadgeCheck, CheckCircle2, Lock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader, Panel, Steps, StatusBadge } from "@/components/fc/ui";
import { NativeSelect } from "@/components/fc/docs";
import { useDb } from "@/domain/db";
import { actions } from "@/domain/actions";
import { consultantById, fullName } from "@/domain/consultants";
import { closeChecks, computeMonth, pendingAdjustments, whyNotQualified } from "@/domain/commission";
import { consultantCode, date, lkr, monthKey, monthLabel, nextMonthKey, prevMonthKey } from "@/domain/format";
import { monthOptions } from "@/domain/ext/finance";
import { act, actorName, useCan, useNow } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { cn } from "@/lib/utils";
import { Guard } from "../../guard";
import { useLabel } from "../consultants/shared";
import { MONTH_STATUS } from "./labels";

const STEPS = ["Checks", "Calculate", "Review exceptions", "Close and lock"];

export function MonthEndPage() {
  return (
    <Guard perms={["month.close", "payout.view"]}>
      <MonthEnd />
    </Guard>
  );
}

function MonthEnd() {
  const L = useLabel();
  usePageTitle("Month-end close");
  const db = useDb();
  const now = useNow();
  const [params, setParams] = useSearchParams();
  const month = params.get("month") ?? prevMonthKey(monthKey(now));
  const months = useMemo(() => monthOptions(db, now).filter((m) => m < monthKey(now) || m === month), [db, now, month]);
  const [step, setStep] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const canClose = useCan("month.close");
  const closed = db.commissionMonths.find((m) => m.id === month);
  const checks = useMemo(() => closeChecks(db, month, now), [db, month, now]);
  const lines = useMemo(() => (closed ? closed.lines : computeMonth(db, month)), [db, month, closed]);
  const adjustments = pendingAdjustments(db);
  const carried = db.payoutBatches.flatMap((b) => b.lines.filter((l) => (l.status === "failed" || l.status === "held") && l.carriedFrom !== "moved").map((l) => ({ l, b })));
  const sum = (f: (l: (typeof lines)[number]) => number, ls = lines) => ls.reduce((a, l) => a + f(l), 0);
  const qualified = lines.filter((l) => l.qualifies);
  const holds = lines.filter((l) => l.hold);
  const notQualified = lines.filter((l) => !l.qualifies && l.teamSales > 0);
  const setMonth = (m: string) => {
    setParams({ month: m }, { replace: true });
    setStep(0);
  };
  const close = () => {
    const r = actions.closeMonth(month);
    act(r, `${monthLabel(month)} closed and locked`);
    setConfirm(false);
    if (r.ok) setParams({ month }, { replace: true });
  };

  return (
    <div className="animate-rise">
      <PageHeader
        title="Month-end close"
        description="Close last month in the first days of this month and pay commission by the 5th. Once locked, the month's figures can't change."
        actions={
          <NativeSelect value={month} onChange={(e) => setMonth(e.target.value)} className="w-64" aria-label="Month to close">
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)} · {MONTH_STATUS[db.commissionMonths.find((x) => x.id === m)?.status ?? "open"]}
              </option>
            ))}
          </NativeSelect>
        }
      />

      {closed ? (
        <Panel>
          <div className="flex flex-col items-center py-8 text-center">
            <div className="animate-pop flex size-16 items-center justify-center rounded-full bg-success-soft text-success">
              <Lock className="size-7" />
            </div>
            <h2 className="mt-4 font-display text-2xl font-semibold">{monthLabel(month)} is closed and locked</h2>
            <p className="mt-1 max-w-lg text-sm text-muted-foreground">
              Closed {date(closed.closedAt)} by {actorName(db, closed.closedBy)}. {closed.lines.filter((l) => l.qualifies).length} sponsors qualified; {lkr(sum((l) => l.payable, closed.lines))} payable.{" "}
              {monthLabel(nextMonthKey(month))} started at zero.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Button render={<Link to={`/staff/payouts/PB-${month}`} />}>
                Open the payout batch <ArrowRight className="size-4" />
              </Button>
              <Button variant="outline" render={<Link to={`/staff/commission?month=${month}`} />}>
                See the locked figures
              </Button>
            </div>
          </div>
        </Panel>
      ) : (
        <>
          <Panel className="mb-5" bodyClassName="px-5 py-4">
            <Steps steps={STEPS} current={step} />
          </Panel>

          {step === 0 && (
            <Panel title={`Step 1. Checks for ${monthLabel(month)}`} description="Anything blocking must be cleared before the month can be closed">
              {checks.blocking.length === 0 && checks.warnings.length === 0 && (
                <p className="flex items-center gap-2 text-sm text-success">
                  <CheckCircle2 className="size-4" /> Every check passed
                </p>
              )}
              <ul className="space-y-2">
                {checks.blocking.map((b) => (
                  <li key={b.text} className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-danger-soft/50 px-4 py-3 text-sm">
                    <XCircle className="size-4.5 shrink-0 text-destructive" />
                    <span className="flex-1 font-medium">{b.text}</span>
                    {b.link && (
                      <Button size="sm" variant="outline" render={<Link to={b.link} />}>
                        Open <ArrowRight className="size-4" />
                      </Button>
                    )}
                  </li>
                ))}
                {checks.warnings.map((w) => (
                  <li key={w.text} className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/30 bg-warning-soft/50 px-4 py-3 text-sm">
                    <AlertTriangle className="size-4.5 shrink-0 text-warning" />
                    <span className="flex-1">{w.text}</span>
                    {w.link && (
                      <Button size="sm" variant="ghost" render={<Link to={w.link} />}>
                        Open <ArrowRight className="size-4" />
                      </Button>
                    )}
                  </li>
                ))}
                {checks.blocking.length === 0 && (
                  <>
                    <li className="flex items-center gap-3 px-4 py-1 text-sm text-muted-foreground">
                      <CheckCircle2 className="size-4 text-success" /> Every bank transfer sent in {monthLabel(month)} is verified or rejected
                    </li>
                    <li className="flex items-center gap-3 px-4 py-1 text-sm text-muted-foreground">
                      <CheckCircle2 className="size-4 text-success" /> Earlier months are closed
                    </li>
                  </>
                )}
              </ul>
              <div className="mt-5 flex justify-end">
                <Button disabled={!checks.ok} onClick={() => setStep(1)}>
                  Calculate <ArrowRight className="size-4" />
                </Button>
              </div>
            </Panel>
          )}

          {step === 1 && (
            <Panel title="Step 2. Calculate" description={`Commission for ${monthLabel(month)} with the rules in force today`}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <Fig label="Sponsors" value={String(lines.length)} />
                <Fig label="Qualified" value={String(qualified.length)} />
                <Fig label={`Commission at ${db.settings.commission.rate}%`} value={lkr(sum((l) => l.amount))} />
                <Fig label="Adjustments" value={lkr(sum((l) => l.adjustments))} sub={`${adjustments.length} from refunds after an earlier close`} />
                <Fig label="Payable" value={lkr(sum((l) => l.payable))} strong />
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Fig label="Held for bank details" value={lkr(sum((l) => l.payable, holds))} sub={`${holds.length} sponsor${holds.length === 1 ? "" : "s"}, carried until verified`} />
                <Fig label="Carried from earlier batches" value={lkr(carried.reduce((a, c) => a + c.l.amount, 0))} sub={`${carried.length} failed or held payout${carried.length === 1 ? "" : "s"} to pay again`} />
              </div>
              <div className="mt-5 flex justify-between">
                <Button variant="outline" onClick={() => setStep(0)}>
                  <ArrowLeft className="size-4" /> Back
                </Button>
                <Button onClick={() => setStep(2)}>
                  Review exceptions <ArrowRight className="size-4" />
                </Button>
              </div>
            </Panel>
          )}

          {step === 2 && (
            <Panel title="Step 3. Review exceptions" description="Look these over before locking. Nothing here stops the close.">
              <div className="space-y-5">
                <Section title="Payouts held" empty="No payouts held" count={holds.length}>
                  {holds.map((l) => {
                    const c = consultantById(db, l.sponsorId);
                    return (
                      <Row key={l.sponsorId} name={c ? `${fullName(c)} (${consultantCode(c.number)})` : ""} right={lkr(l.payable)} note={l.hold} link={{ to: "/staff/bank-details", label: "Verify bank details" }} />
                    );
                  })}
                </Section>
                <Section title="Failed or held payouts carried into this batch" empty="Nothing to carry" count={carried.length}>
                  {carried.map(({ l, b }) => {
                    const c = consultantById(db, l.consultantId);
                    return <Row key={`${b.id}-${l.consultantId}`} name={c ? `${fullName(c)} (${consultantCode(c.number)})` : ""} right={lkr(l.amount)} note={`${monthLabel(b.month)}: ${l.failReason ?? "not paid"}`} link={{ to: `/staff/payouts/${b.id}`, label: b.id }} />;
                  })}
                </Section>
                <Section title="Adjustments netted off this month" empty="No adjustments" count={adjustments.length}>
                  {adjustments.map((a) => {
                    const c = consultantById(db, a.sponsorId);
                    return <Row key={a.id} name={c ? fullName(c) : ""} right={lkr(a.amount)} note={a.reason} link={a.orderId ? { to: `/staff/consultant-orders/${a.orderId}`, label: a.orderId } : undefined} />;
                  })}
                </Section>
                <Section title={`Sponsors with team sales who did not qualify`} empty="Everyone with team sales qualified" count={notQualified.length}>
                  {notQualified.map((l) => {
                    const c = consultantById(db, l.sponsorId);
                    return <Row key={l.sponsorId} name={c ? `${fullName(c)} (${consultantCode(c.number)})` : ""} right={lkr(l.teamSales)} note={whyNotQualified(db, l)} />;
                  })}
                </Section>
                {checks.warnings.length > 0 && (
                  <Section title="Warnings" empty="" count={checks.warnings.length}>
                    {checks.warnings.map((w) => (
                      <Row key={w.text} name={w.text} right="" link={w.link ? { to: w.link, label: "Open" } : undefined} />
                    ))}
                  </Section>
                )}
              </div>
              <div className="mt-5 flex justify-between">
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ArrowLeft className="size-4" /> Back
                </Button>
                <Button onClick={() => setStep(3)}>
                  Continue <ArrowRight className="size-4" />
                </Button>
              </div>
            </Panel>
          )}

          {step === 3 && (
            <Panel title="Step 4. Close and lock">
              <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_280px]">
                <ul className="space-y-2 text-sm">
                  <li className="flex gap-2">
                    <Lock className="mt-0.5 size-4 shrink-0 text-primary" /> {monthLabel(month)}'s figures are locked with today's rules and can't be edited
                  </li>
                  <li className="flex gap-2">
                    <BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary" /> A payout batch of {lkr(sum((l) => l.payable) + carried.reduce((a, c) => a + c.l.amount, 0))} is created for Finance to approve
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" /> {monthLabel(nextMonthKey(month))} starts at zero; history is kept
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" /> A refund on a {monthLabel(month)} sale after today becomes an adjustment on the sponsor's next commission
                  </li>
                </ul>
                <div className="rounded-2xl bg-brand-soft p-4 text-center">
                  <div className="text-xs text-muted-foreground">Payable to {qualified.filter((l) => l.payable > 0).length} sponsors</div>
                  <div className="font-display text-3xl font-semibold tabular">{lkr(sum((l) => l.payable))}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{holds.length ? `${holds.length} held for bank details` : "None held"}</div>
                </div>
              </div>
              <div className="mt-5 flex justify-between">
                <Button variant="outline" onClick={() => setStep(2)}>
                  <ArrowLeft className="size-4" /> Back
                </Button>
                {canClose ? (
                  <Button disabled={!checks.ok} onClick={() => setConfirm(true)}>
                    <Lock className="size-4" /> Close and lock {monthLabel(month, false)}
                  </Button>
                ) : (
                  <p className="self-center text-sm text-muted-foreground">Finance or an Administrator closes the month.</p>
                )}
              </div>
            </Panel>
          )}
        </>
      )}

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close and lock {monthLabel(month)}?</DialogTitle>
            <DialogDescription>
              This can't be undone. {L.many} see their {monthLabel(month)} commission as approved, and the payout batch is created.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button onClick={close}>
              <Lock className="size-4" /> Close and lock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Fig({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className={cn("rounded-xl border p-3", strong ? "border-primary/30 bg-brand-soft" : "border-border/70")}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-1 font-display text-xl font-semibold tabular", strong && "text-primary")}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Section({ title, empty, count, children }: { title: string; empty: string; count: number; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        {title}
        <StatusBadge tone={count ? "warning" : "success"} dot={false}>
          {count}
        </StatusBadge>
      </div>
      {count ? <ul className="divide-y divide-border/60 rounded-xl border border-border/70">{children}</ul> : <p className="text-sm text-muted-foreground">{empty}</p>}
    </div>
  );
}

function Row({ name, right, note, link }: { name: string; right: string; note?: string; link?: { to: string; label: string } }) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <div className="font-medium">{name}</div>
        {note && <div className="text-xs text-muted-foreground">{note}</div>}
      </div>
      {right && <span className="tabular">{right}</span>}
      {link && (
        <Link to={link.to} className="text-sm text-primary hover:underline">
          {link.label}
        </Link>
      )}
    </li>
  );
}
