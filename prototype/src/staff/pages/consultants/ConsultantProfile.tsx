// S29 Consultant profile: overview, sponsor, direct team, orders, commission by month,
// bank details (masked), status history, and the Administrator's status and sponsor actions.

import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { BadgeDollarSign, Ban, Landmark, Network, RotateCcw, ShoppingBag, UserMinus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Avatar } from "@/components/fc/brand";
import { EmptyState, FilterTabs, KeyValue, Kpi, PageHeader, Panel, ReasonDialog, SimpleTable, Status, StatusBadge, Timeline, type Column } from "@/components/fc/ui";
import { useDb } from "@/domain/db";
import { actions } from "@/domain/actions";
import { allowedStatusChanges, consultantById, consultantByNumber, directTeam, fullName, STATUS_LABEL, DELIVERY_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "@/domain/consultants";
import { lineFor, monthStatus, salesByConsultant, whyNotQualified } from "@/domain/commission";
import { consultantCode, date, lkr, maskTail, monthKey, monthLabel, nextMonthKey } from "@/domain/format";
import type { CommissionLine, Consultant, ConsultantOrder, ConsultantStatus } from "@/domain/types";
import { act, actorName, useCan, useNow } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { cn } from "@/lib/utils";
import { Guard, NotFound } from "../../guard";
import { ConsultantCell, maskedAccount, useLabel } from "./shared";
import { ChangeSponsorDialog } from "./SponsorDialog";

type Tab = "team" | "orders" | "commission";

export function ConsultantProfilePage() {
  return (
    <Guard perms={["consultants.view"]}>
      <ConsultantProfile />
    </Guard>
  );
}

const VIA: Record<Consultant["joinedVia"], string> = { link: "Referral link", number: "Sponsor number", none: "No sponsor given" };

function ConsultantProfile() {
  const { id } = useParams();
  const db = useDb();
  const now = useNow();
  const nav = useNavigate();
  const L = useLabel();
  const c = db.consultants.find((x) => x.id === id);
  usePageTitle(c ? fullName(c) : L.one);
  const canEdit = useCan("consultants.edit");
  const canSponsor = useCan("sponsor.change");
  const canBank = useCan("bank.verify");
  const canCommission = useCan("commission.view");
  const [tab, setTab] = useState<Tab>("team");
  const [statusTo, setStatusTo] = useState<ConsultantStatus>();
  const [teamTo, setTeamTo] = useState<"sponsor" | "no1">("sponsor");
  const [sponsorOpen, setSponsorOpen] = useState(false);
  const month = monthKey(now);
  const sales = useMemo(() => salesByConsultant(db, month, db.settings.commission), [db, month]);
  const commissionRows = useMemo(() => {
    if (!c?.joinedAt) return [];
    const out: { month: string; line?: CommissionLine; status: string }[] = [];
    let m = monthKey(c.joinedAt);
    let guard = 0;
    while (m <= month && guard++ < 36) {
      out.push({ month: m, line: lineFor(db, m, c.id), status: monthStatus(db, m) });
      m = nextMonthKey(m);
    }
    return out.reverse();
  }, [db, c, month]);
  if (!c) return <NotFound />;
  if (c.number === undefined)
    return (
      <div className="animate-rise">
        <PageHeader back={{ to: "/staff/applications", label: "Applications" }} title={fullName(c)} description="This person has not been approved yet." />
        <Button render={<Link to={`/staff/applications/${c.id}`} />}>Open the application</Button>
      </div>
    );
  const sponsor = consultantById(db, c.sponsorId);
  const team = directTeam(db, c.id);
  const orders = db.consultantOrders.filter((o) => o.consultantId === c.id);
  const teamSales = team.reduce((a, t) => a + (sales.get(t.id) ?? 0), 0);
  const current = commissionRows[0]?.line;
  const isNo1 = c.number === 1;
  const changes = allowedStatusChanges(c.status);
  const no1 = consultantByNumber(db, 1);
  const statusEvents = c.statusHistory.map((h) => ({
    ts: h.ts,
    by: h.by,
    text: h.from ? `${STATUS_LABEL[h.from]} → ${STATUS_LABEL[h.to]}${h.reason ? `: ${h.reason}` : ""}` : h.to === "pending" ? "Applied" : STATUS_LABEL[h.to],
  }));
  const sponsorAudit = db.audit
    .filter((a) => a.entityId === c.id && a.action.startsWith("Sponsor changed"))
    .map((a) => ({ ts: a.ts, by: a.by, text: `Sponsor changed from ${a.before} to ${a.after}${a.reason ? `: ${a.reason}` : ""}` }));
  const history = [...statusEvents, ...sponsorAudit].sort((a, b) => a.ts.localeCompare(b.ts));

  const teamCols: Column<Consultant>[] = [
    { key: "name", header: "Team member", cell: (t) => <ConsultantCell c={t} link={false} />, value: (t) => fullName(t) },
    { key: "joined", header: "Joined", cell: (t) => date(t.joinedAt), value: (t) => t.joinedAt ?? "" },
    { key: "team", header: "Her team", align: "right", className: "whitespace-nowrap", cell: (t) => directTeam(db, t.id).length, value: (t) => directTeam(db, t.id).length },
    { key: "sales", header: `Sales, ${monthLabel(month, false)}`, align: "right", className: "whitespace-nowrap", cell: (t) => lkr(sales.get(t.id) ?? 0), value: (t) => sales.get(t.id) ?? 0 },
    { key: "status", header: "Status", cell: (t) => <Status>{STATUS_LABEL[t.status]}</Status>, value: (t) => t.status },
  ];
  const orderCols: Column<ConsultantOrder>[] = [
    { key: "id", header: "Order", cell: (o) => <span className="tabular">{o.id}</span>, value: (o) => o.id },
    { key: "date", header: "Placed", cell: (o) => date(o.createdAt), value: (o) => o.createdAt },
    { key: "packs", header: "Packs", align: "right", className: "whitespace-nowrap", cell: (o) => o.lines.reduce((a, l) => a + l.qty, 0), value: (o) => o.lines.reduce((a, l) => a + l.qty, 0) },
    { key: "total", header: "Total", align: "right", className: "whitespace-nowrap", cell: (o) => lkr(o.total), value: (o) => o.total },
    { key: "pay", header: "Payment", cell: (o) => <Status>{PAYMENT_STATUS_LABEL[o.paymentStatus]}</Status>, value: (o) => PAYMENT_STATUS_LABEL[o.paymentStatus] },
    { key: "del", header: "Delivery", cell: (o) => <Status>{DELIVERY_STATUS_LABEL[o.deliveryStatus]}</Status>, value: (o) => DELIVERY_STATUS_LABEL[o.deliveryStatus] },
  ];
  const statusLabel = (s: string) => (s === "open" ? "Provisional" : s === "locked" ? "Locked" : s === "payout_approved" ? "Payout approved" : "Paid");
  const payoutOf = (m: string) => db.payoutBatches.find((b) => b.month === m)?.lines.find((l) => l.consultantId === c.id);
  const comCols: Column<(typeof commissionRows)[number]>[] = [
    { key: "month", header: "Month", cell: (r) => monthLabel(r.month), value: (r) => r.month },
    { key: "team", header: "Team sales", align: "right", className: "whitespace-nowrap", cell: (r) => lkr(r.line?.teamSales ?? 0), value: (r) => r.line?.teamSales ?? 0 },
    { key: "own", header: "Own sales", align: "right", className: "whitespace-nowrap", cell: (r) => lkr(r.line?.ownSales ?? sales.get(c.id) ?? 0), value: (r) => r.line?.ownSales ?? 0 },
    {
      key: "q",
      header: "Qualifies",
      cell: (r) =>
        !r.line ? (
          <span className="text-muted-foreground">No team</span>
        ) : r.line.qualifies ? (
          <StatusBadge tone="success">Qualified</StatusBadge>
        ) : (
          <span className="text-xs text-muted-foreground">{whyNotQualified(db, r.line, db.commissionMonths.find((x) => x.id === r.month)?.settingsUsed)}</span>
        ),
    },
    { key: "payable", header: "Payable", align: "right", className: "whitespace-nowrap", cell: (r) => <span className="font-medium">{lkr(r.line?.payable ?? 0)}</span>, value: (r) => r.line?.payable ?? 0 },
    { key: "status", header: "Status", cell: (r) => <Status>{statusLabel(r.status)}</Status>, value: (r) => r.status },
    {
      key: "payout",
      header: "Payout",
      cell: (r) => {
        const p = payoutOf(r.month);
        if (!p) return <span className="text-muted-foreground">-</span>;
        const word = p.status === "pending" ? "To be paid" : p.status === "paid" ? "Paid" : p.status === "failed" ? "Failed" : "Held";
        return <Status>{word}</Status>;
      },
    },
    {
      key: "stmt",
      header: "",
      cell: (r) =>
        r.line && canCommission ? (
          <Link className="text-sm text-primary hover:underline" to={`/staff/statements/${c.id}/${r.month}`}>
            Statement
          </Link>
        ) : null,
    },
  ];

  const ACTION: Record<string, { label: string; icon: typeof Ban; title: string; destructive?: boolean }> = {
    suspended: { label: "Suspend", icon: Ban, title: `Suspend ${fullName(c)}`, destructive: true },
    active: { label: "Reactivate", icon: RotateCcw, title: `Reactivate ${fullName(c)}` },
    terminated: { label: "Terminate", icon: UserMinus, title: `Terminate ${fullName(c)}`, destructive: true },
  };

  return (
    <div className="animate-rise">
      <PageHeader
        back={{ to: "/staff/consultants", label: L.many }}
        eyebrow={consultantCode(c.number)}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <Avatar name={fullName(c)} hue={c.avatarHue} size="lg" />
            {fullName(c)}
            <Status>{STATUS_LABEL[c.status]}</Status>
          </span>
        }
        description={`${L.one} since ${date(c.joinedAt)} · ${c.city}`}
        actions={
          <>
            {canSponsor && !isNo1 && c.status !== "terminated" && (
              <Button variant="outline" onClick={() => setSponsorOpen(true)}>
                <Network className="size-4" /> Change sponsor
              </Button>
            )}
            {canEdit &&
              !isNo1 &&
              changes.map((s) => {
                const a = ACTION[s];
                const Icon = a.icon;
                return (
                  <Button key={s} variant={a.destructive ? "destructive" : "default"} onClick={() => setStatusTo(s)}>
                    <Icon className="size-4" /> {a.label}
                  </Button>
                );
              })}
            {canEdit && isNo1 && <span className="text-sm text-muted-foreground">FemmeCare's own account. Its status can't change.</span>}
          </>
        }
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label={`Own sales, ${monthLabel(month, false)}`} value={lkr(sales.get(c.id) ?? 0)} icon={<ShoppingBag className="size-5" />} />
        <Kpi label={`Team sales, ${monthLabel(month, false)}`} value={lkr(teamSales)} sub={`${team.filter((t) => sales.get(t.id)).length} of ${team.length} ordered`} icon={<Users className="size-5" />} tone="plum" />
        <Kpi label="Direct team" value={team.length} sub="Commission is paid on this level only" icon={<Network className="size-5" />} tone="info" />
        <Kpi
          label="Provisional commission"
          value={lkr(current?.payable ?? 0)}
          sub={current ? (current.qualifies ? "Qualified this month" : whyNotQualified(db, current)) : "No team yet"}
          icon={<BadgeDollarSign className="size-5" />}
          tone="success"
        />
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <Panel title="Overview">
            <KeyValue
              cols={2}
              items={[
                ["Mobile", <span className="tabular">{c.mobile}</span>],
                ["Email", c.email],
                ["Home address", `${c.address}, ${c.city} ${c.postalCode}`],
                ["NIC number", <span className="tabular">{maskTail(c.nic, 4)}</span>],
                ["Date of birth", date(c.dob)],
                ["Came through", VIA[c.joinedVia]],
                ["Application", <Link className="text-primary hover:underline" to={`/staff/applications/${c.id}`}>{c.appRef}</Link>],
                ["Shares name and sales with sponsor", c.consentShareWithSponsor ? "Yes" : "No"],
              ]}
            />
          </Panel>
          <div>
            <div className="mb-3">
              <FilterTabs
                value={tab}
                onChange={setTab}
                options={[
                  { value: "team", label: "Direct team", count: team.length },
                  { value: "orders", label: "Orders", count: orders.length },
                  { value: "commission", label: "Commission by month" },
                ]}
              />
            </div>
            {tab === "team" && (
              <SimpleTable
                rows={team}
                columns={teamCols}
                rowKey={(t) => t.id}
                rowHref={(t) => `/staff/consultants/${t.id}`}
                onRowClick={(t) => nav(`/staff/consultants/${t.id}`)}
                searchable={team.length > 8}
                empty={<EmptyState icon={<Users className="size-5" />} title="No team members yet" description={`People who join with ${c.givenName}'s link or number appear here.`} />}
              />
            )}
            {tab === "orders" && (
              <SimpleTable
                rows={orders}
                columns={orderCols}
                rowKey={(o) => o.id}
                rowHref={(o) => `/staff/consultant-orders/${o.id}`}
                onRowClick={(o) => nav(`/staff/consultant-orders/${o.id}`)}
                pageSize={10}
                empty={<EmptyState icon={<ShoppingBag className="size-5" />} title="No orders yet" />}
              />
            )}
            {tab === "commission" && (
              <SimpleTable
                rows={commissionRows}
                columns={comCols}
                rowKey={(r) => r.month}
                searchable={false}
                exportName={`commission-${consultantCode(c.number)}`}
                empty={<EmptyState title="No commission months yet" />}
              />
            )}
          </div>
        </div>
        <div className="space-y-5">
          <Panel title="Sponsor" description="Commission on her sales goes to this person">
            {sponsor ? <ConsultantCell c={sponsor} /> : <p className="text-sm text-muted-foreground">None. This is the top of the network.</p>}
          </Panel>
          <Panel
            title="Bank details"
            actions={
              c.bankVerified && !c.pendingBank ? (
                <StatusBadge tone="success">Verified</StatusBadge>
              ) : (
                <StatusBadge tone="warning">{c.pendingBank ? "Change waiting" : "Not verified"}</StatusBadge>
              )
            }
          >
            <KeyValue
              cols={1}
              items={[
                ["Account name", c.bank.accountName],
                ["Account number", <span className="tabular">{maskedAccount(c.bank.accountNumber)}</span>],
                ["Bank and branch", `${c.bank.bank}, ${c.bank.branch}`],
              ]}
            />
            {c.pendingBank && (
              <div className="mt-4 rounded-xl bg-warning-soft p-3 text-sm">
                New details requested {date(c.pendingBank.requestedAt)}: {c.pendingBank.bank}, account {maskedAccount(c.pendingBank.accountNumber)}. Payouts use the old details until Finance verifies.
              </div>
            )}
            {canBank && (c.pendingBank || !c.bankVerified) && (
              <Button className="mt-4 w-full" variant="outline" render={<Link to="/staff/bank-details" />}>
                <Landmark className="size-4" /> Verify bank details
              </Button>
            )}
          </Panel>
          <Panel title="Status and sponsor history">
            <Timeline events={history} nameOf={(x) => actorName(db, x)} />
          </Panel>
        </div>
      </div>
      {statusTo && (
        <ReasonDialog
          open={!!statusTo}
          onOpenChange={(v) => !v && setStatusTo(undefined)}
          title={ACTION[statusTo].title}
          destructive={ACTION[statusTo].destructive}
          confirmLabel={ACTION[statusTo].label}
          description={
            statusTo === "suspended"
              ? `She can't place orders or earn commission while suspended. Orders already placed carry on. She is told by email.`
              : statusTo === "active"
                ? "She can order and earn commission again from now."
                : "Termination is final. She can no longer sign in, order or earn."
          }
          placeholder="Reason, recorded in the audit log and sent to her"
          onConfirm={(reason) => {
            const r = actions.changeStatus(c.id, statusTo, reason, statusTo === "terminated" ? teamTo : undefined);
            act(r, `${fullName(c)} is now ${STATUS_LABEL[statusTo].toLowerCase()}`);
            return r.ok;
          }}
        >
          {statusTo === "terminated" && team.length > 0 && (!sponsor || sponsor.number === 1) && (
            <p className="rounded-xl bg-muted px-3 py-2.5 text-sm">Her direct team of {team.length} moves to FemmeCare No. 1 ({consultantCode(no1?.number)}), who is also her sponsor.</p>
          )}
          {statusTo === "terminated" && team.length > 0 && sponsor && sponsor.number !== 1 && (
            <div className="grid gap-2">
              <Label>Where her direct team of {team.length} goes</Label>
              {(
                [
                  ["sponsor", `To her sponsor, ${fullName(sponsor)} (${consultantCode(sponsor.number)})`],
                  ["no1", `To FemmeCare No. 1 (${consultantCode(no1?.number)})`],
                ] as const
              ).map(([v, text]) => (
                <label key={v} className={cn("flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm", teamTo === v ? "border-primary bg-brand-soft" : "border-border")}>
                  <input type="radio" name="team-to" checked={teamTo === v} onChange={() => setTeamTo(v)} className="accent-[var(--primary)]" />
                  {text}
                </label>
              ))}
            </div>
          )}
        </ReasonDialog>
      )}
      <ChangeSponsorDialog open={sponsorOpen} onOpenChange={setSponsorOpen} consultant={c} />
    </div>
  );
}
