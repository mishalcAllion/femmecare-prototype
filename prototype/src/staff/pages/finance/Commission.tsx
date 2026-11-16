// S35 Commission: per sponsor per month, provisional while the month is open and
// locked once closed; rules in force, MRP vs net comparison, drill-down and export.

import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ArrowRight, BadgeDollarSign, CheckCircle2, Hourglass, Lock, PauseCircle, Settings2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EmptyState, Kpi, PageHeader, Panel, SimpleTable, Status, StatusBadge, type Column } from "@/components/fc/ui";
import { NativeSelect } from "@/components/fc/docs";
import { useDb } from "@/domain/db";
import { consultantById, directTeam, fullName } from "@/domain/consultants";
import { monthStatus, salesByConsultant, whyNotQualified } from "@/domain/commission";
import { consultantCode, date, lastDayOfMonth, lkIso, lkr, monthKey, monthLabel } from "@/domain/format";
import { defaultMonth, MONTH_STATUS } from "./labels";
import type { CommissionLine, CommissionSettings, Db } from "@/domain/types";
import { monthOptions, monthView, qualifyingOrders, rulesText } from "@/domain/ext/finance";
import { actorName, useCan, useNow, useReviewNotes } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { cn } from "@/lib/utils";
import { Guard } from "../../guard";
import { ConsultantCell, useLabel } from "../consultants/shared";

export function CommissionPage() {
  return (
    <Guard perms={["commission.view"]}>
      <Commission />
    </Guard>
  );
}

function Commission() {
  const L = useLabel();
  usePageTitle("Commission");
  const db = useDb();
  const now = useNow();
  const [params, setParams] = useSearchParams();
  const month = params.get("month") ?? defaultMonth(db, now);
  const months = useMemo(() => monthOptions(db, now), [db, now]);
  const canSettings = useCan("settings.edit");
  const canClose = useCan("month.close");
  const notes = useReviewNotes();
  const [drill, setDrill] = useState<string>();
  const view = useMemo(() => monthView(db, month), [db, month]);
  const closed = db.commissionMonths.find((m) => m.id === month);
  const status = monthStatus(db, month);
  const ended = monthKey(now) > month;
  const s = view.settings;
  const lines = view.lines;
  const compare = useMemo(() => {
    const mrp = monthView(db, month, { ...s, base: "mrp" }).lines;
    const net = monthView(db, month, { ...s, base: "net" }).lines;
    const sum = (ls: CommissionLine[]) => ({ sales: ls.reduce((a, l) => a + l.commissionable, 0), amount: ls.reduce((a, l) => a + l.amount, 0), qualified: ls.filter((l) => l.qualifies).length });
    return { mrp: sum(mrp), net: sum(net) };
  }, [db, month, s]);
  const total = (k: keyof CommissionLine) => lines.reduce((a, l) => a + (Number(l[k]) || 0), 0);
  const held = lines.filter((l) => l.hold);
  const cols: Column<CommissionLine>[] = [
    {
      key: "sponsor",
      header: "Sponsor",
      cell: (l) => <ConsultantCell c={consultantById(db, l.sponsorId)} link={false} />,
      value: (l) => {
        const c = consultantById(db, l.sponsorId);
        return c ? `${fullName(c)} (${consultantCode(c.number)})` : l.sponsorId;
      },
    },
    { key: "team", header: "Team sales", align: "right", className: "whitespace-nowrap", cell: (l) => <M n={l.teamSales} />, value: (l) => l.teamSales },
    { key: "own", header: "Own sales", align: "right", className: "whitespace-nowrap", cell: (l) => <M n={l.ownSales} />, value: (l) => l.ownSales },
    { key: "basis", header: "Threshold basis", align: "right", className: "whitespace-nowrap", cell: (l) => <M n={l.thresholdBasis} />, value: (l) => l.thresholdBasis, hideOnMobile: true },
    { key: "refs", header: "Referrals", align: "right", className: "whitespace-nowrap", cell: (l) => l.activeReferrals, value: (l) => l.activeReferrals, hideOnMobile: true },
    {
      key: "q",
      header: "Qualifies",
      cell: (l) =>
        l.qualifies ? (
          <StatusBadge tone="success">Qualified</StatusBadge>
        ) : (
          <span className="block max-w-44 text-xs leading-snug text-muted-foreground">{whyNotQualified(db, l, s)}</span>
        ),
      value: (l) => (l.qualifies ? "Qualified" : whyNotQualified(db, l, s) ?? "Not qualified"),
    },
    { key: "amount", header: `${s.rate}%`, align: "right", className: "whitespace-nowrap", cell: (l) => <M n={l.amount} />, value: (l) => l.amount },
    { key: "adj", header: "Adjustments", align: "right", className: "whitespace-nowrap", cell: (l) => (l.adjustments ? <M n={l.adjustments} /> : <span className="text-muted-foreground">-</span>), value: (l) => l.adjustments },
    { key: "payable", header: "Payable", align: "right", className: "whitespace-nowrap", cell: (l) => <M n={l.payable} strong />, value: (l) => l.payable },
    { key: "hold", header: "Hold", cell: (l) => (l.hold ? <span title={l.hold}><StatusBadge tone="warning">Held</StatusBadge></span> : null), value: (l) => l.hold ?? "" },
  ];
  return (
    <div className="animate-rise">
      <PageHeader
        title="Commission"
        description={`${s.rate}% to each sponsor on her direct team's sales. Calculated by the system; ${closed ? "this month is locked" : "provisional until the month is closed"}.`}
        actions={
          <div className="flex items-center gap-2">
            <NativeSelect value={month} onChange={(e) => setParams({ month: e.target.value }, { replace: true })} className="w-64" aria-label="Month">
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)} · {MONTH_STATUS[monthStatus(db, m)]}
                </option>
              ))}
            </NativeSelect>
          </div>
        }
      />
      <div
        className={cn(
          "mb-5 flex flex-wrap items-center gap-3 rounded-2xl border p-4 text-sm",
          closed ? "border-success/30 bg-success-soft/50" : "border-warning/30 bg-warning-soft/50",
        )}
      >
        {closed ? <Lock className="size-5 text-success" /> : <Hourglass className="size-5 text-warning" />}
        <div className="min-w-0 flex-1">
          <div className="font-medium">
            {monthLabel(month)}: {MONTH_STATUS[status]}
          </div>
          <div className="text-muted-foreground">
            {closed
              ? `Closed ${date(closed.closedAt)} by ${actorName(db, closed.closedBy)}. These figures can't change. A refund on a sale from this month becomes an adjustment on the sponsor's next commission.`
              : ended
                ? "The month has ended. Figures still move until Finance closes it."
                : `Figures update as orders are paid, cancelled or refunded. The month ends on ${date(lkIso(lastDayOfMonth(month), "12:00"))} at ${s.cutoff}.`}
          </div>
        </div>
        {!closed && ended && canClose && (
          <Button render={<Link to={`/staff/month-end?month=${month}`} />}>
            Close {monthLabel(month, false)} <ArrowRight className="size-4" />
          </Button>
        )}
        {closed && (
          <Button variant="outline" render={<Link to={`/staff/payouts/PB-${month}`} />}>
            Payout batch <ArrowRight className="size-4" />
          </Button>
        )}
      </div>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Sponsors with a team" value={lines.length} sub={`${lines.filter((l) => l.qualifies).length} qualified`} icon={<Users className="size-5" />} />
        <Kpi label={`Commission at ${s.rate}%`} value={lkr(total("amount"))} sub={`on ${lkr(total("commissionable"))} of team sales`} icon={<BadgeDollarSign className="size-5" />} tone="plum" />
        <Kpi label="Payable" value={lkr(total("payable"))} sub={total("adjustments") ? `after ${lkr(total("adjustments"))} adjustments` : "No adjustments"} icon={<CheckCircle2 className="size-5" />} tone="success" />
        <Kpi label="On hold" value={lkr(held.reduce((a, l) => a + l.payable, 0))} sub={`${held.length} sponsor${held.length === 1 ? "" : "s"}`} icon={<PauseCircle className="size-5" />} tone="warning" />
      </div>
      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Panel
          title={closed ? "Rules used for this month" : "Rules in force"}
          description={closed ? "Saved with the month when it was closed" : notes ? "Each rule is a setting tied to a FemmeCare decision" : "Each rule is a setting an Administrator can change"}
          actions={
            canSettings && !closed ? (
              <Button size="sm" variant="outline" render={<Link to="/staff/settings" />}>
                <Settings2 className="size-4" /> Change in Settings
              </Button>
            ) : undefined
          }
        >
          <ul className="space-y-1.5 text-sm">
            {rulesText(db, s).map((r) => (
              <li key={r} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" /> {r}
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="MRP value or net sales" description={`The same ${monthLabel(month)} sales on both bases. ${s.base === "mrp" ? "MRP value" : "Net sales"} is the setting in use.`}>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ["mrp", "On MRP value", compare.mrp],
                ["net", `On net ${L.lower} sales`, compare.net],
              ] as const
            ).map(([k, label, v]) => (
              <div key={k} className={cn("rounded-xl border p-3", s.base === k ? "border-primary/40 bg-brand-soft" : "border-border/70")}>
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  {label}
                  {s.base === k && <StatusBadge tone="brand">In use</StatusBadge>}
                </div>
                <div className="mt-1 font-display text-xl font-semibold tabular">{lkr(v.amount)}</div>
                <div className="text-xs text-muted-foreground">
                  {s.rate}% of {lkr(v.sales)} · {v.qualified} qualified
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Example: a pack with MRP {lkr(950)} sells to the team at {lkr(712.5)}. Ten packs give {lkr(9500)} at MRP, so {lkr(475)} commission; on net sales {lkr(7125)}, so {lkr(356.25)}. Difference this month:{" "}
            <span className="font-medium text-foreground">{lkr(Math.abs(compare.mrp.amount - compare.net.amount))}</span>.
          </p>
        </Panel>
      </div>
      <SimpleTable
        rows={lines}
        columns={cols}
        rowKey={(l) => l.sponsorId}
        onRowClick={(l) => setDrill(l.sponsorId)}
        exportName={`commission-${month}${closed ? "" : "-provisional"}`}
        toolbar={<span className="text-xs text-muted-foreground">Amounts in LKR</span>}
        searchText={(l) => {
          const c = consultantById(db, l.sponsorId);
          return c ? `${fullName(c)} ${consultantCode(c.number)}` : "";
        }}
        defaultSort={{ key: "payable", dir: "desc" }}
        pageSize={25}
        empty={<EmptyState icon={<BadgeDollarSign className="size-5" />} title="No sponsors this month" description={`Sponsors appear once someone in their direct team has joined.`} />}
      />
      {lines.length > 0 && (
        <div className="mt-2 flex flex-wrap justify-end gap-x-6 gap-y-1 rounded-xl bg-muted/50 px-4 py-3 text-sm">
          <span>
            Team sales <span className="font-semibold tabular">{lkr(total("teamSales"))}</span>
          </span>
          <span>
            Commission <span className="font-semibold tabular">{lkr(total("amount"))}</span>
          </span>
          <span>
            Adjustments <span className="font-semibold tabular">{lkr(total("adjustments"))}</span>
          </span>
          <span>
            Total payable <span className="font-semibold tabular text-primary">{lkr(total("payable"))}</span>
          </span>
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">Click a sponsor to see her team and the orders behind the figures. Sales count in the month they were paid; cancelled and refunded orders, tax and delivery charges are left out.</p>
      <SponsorDrill db={db} sponsorId={drill} month={month} settings={s} line={lines.find((l) => l.sponsorId === drill)} onClose={() => setDrill(undefined)} />
    </div>
  );
}

/** Money in a dense table: no currency prefix (the page says LKR), never wraps. */
function M({ n, strong }: { n: number; strong?: boolean }) {
  return <span className={cn("whitespace-nowrap tabular", n < 0 && "text-destructive", strong && "font-semibold")}>{lkr(n, { prefix: false })}</span>;
}

function SponsorDrill({ db, sponsorId, month, settings, line, onClose }: { db: Db; sponsorId?: string; month: string; settings: CommissionSettings; line?: CommissionLine; onClose: () => void }) {
  const sponsor = consultantById(db, sponsorId);
  const team = sponsor ? directTeam(db, sponsor.id) : [];
  const sales = useMemo(() => salesByConsultant(db, month, settings), [db, month, settings]);
  const orders = sponsor ? qualifyingOrders(db, month, team.map((t) => t.id), settings.cutoff) : [];
  const base = settings.base === "mrp" ? "MRP value" : "net";
  return (
    <Sheet open={!!sponsorId} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full overflow-y-auto data-[side=right]:sm:max-w-xl">
        {sponsor && line && (
          <>
            <SheetHeader>
              <SheetTitle>{fullName(sponsor)}</SheetTitle>
              <SheetDescription>
                {consultantCode(sponsor.number)} · {monthLabel(month)} · {team.length} in her direct team
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-5 px-4 pb-6">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-muted/60 p-2.5">
                  <div className="text-xs text-muted-foreground">Team sales</div>
                  <div className="font-semibold tabular">{lkr(line.teamSales)}</div>
                </div>
                <div className="rounded-xl bg-muted/60 p-2.5">
                  <div className="text-xs text-muted-foreground">{settings.rate}%</div>
                  <div className="font-semibold tabular">{lkr(line.amount)}</div>
                </div>
                <div className="rounded-xl bg-brand-soft p-2.5">
                  <div className="text-xs text-muted-foreground">Payable</div>
                  <div className="font-semibold tabular text-primary">{lkr(line.payable)}</div>
                </div>
              </div>
              {!line.qualifies && <p className="rounded-xl bg-warning-soft px-3 py-2 text-sm">{whyNotQualified(db, line, settings)}</p>}
              <div>
                <h3 className="mb-2 text-sm font-semibold">Direct team ({base})</h3>
                <ul className="divide-y divide-border/60 rounded-xl border border-border/70">
                  {team
                    .slice()
                    .sort((a, b) => (sales.get(b.id) ?? 0) - (sales.get(a.id) ?? 0))
                    .map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <ConsultantCell c={t} />
                        <span className={cn("whitespace-nowrap tabular text-sm", !sales.get(t.id) && "text-muted-foreground")}>{lkr(sales.get(t.id) ?? 0)}</span>
                      </li>
                    ))}
                  <li className="flex items-center justify-between gap-3 bg-muted/40 px-3 py-2 text-sm">
                    <span>Her own sales (threshold {settings.ownSalesEarn ? "and commission" : "only"})</span>
                    <span className="whitespace-nowrap tabular">{lkr(line.ownSales)}</span>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold">Team orders counted ({orders.length})</h3>
                <ul className="divide-y divide-border/60 rounded-xl border border-border/70 text-sm">
                  {orders.map((o) => {
                    const c = consultantById(db, o.consultantId);
                    return (
                      <li key={o.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <div className="min-w-0">
                          <Link to={`/staff/consultant-orders/${o.id}`} className="font-medium tabular hover:text-primary">
                            {o.id}
                          </Link>
                          <div className="truncate text-xs text-muted-foreground">
                            {c ? fullName(c) : ""} · paid {date(o.paidAt)}
                          </div>
                        </div>
                        <span className="whitespace-nowrap tabular">{lkr(settings.base === "mrp" ? o.mrpValue : o.subtotal)}</span>
                      </li>
                    );
                  })}
                  {!orders.length && <li className="px-3 py-4 text-center text-muted-foreground">No paid team orders this month</li>}
                </ul>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" render={<Link to={`/staff/consultants/${sponsor.id}`} />}>
                  Open profile
                </Button>
                <Button variant="outline" render={<Link to={`/staff/statements/${sponsor.id}/${month}`} />}>
                  Statement
                </Button>
              </div>
              <Status>{MONTH_STATUS[monthStatus(db, month)]}</Status>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
