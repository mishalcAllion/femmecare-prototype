// C1 Home, "My business" (deck slide 23, modernised): this month's own and team
// sales, commission so far with the threshold, who in the team ordered, recent
// orders and quick actions. Last month is one tap away.

import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowRight, CircleAlert, CircleCheck, Package, ShoppingBag, Truck, UserPlus, Users, Wallet } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { ProgressBar, Status, StatusBadge } from "@/components/fc/ui";
import { cn } from "@/lib/utils";
import { useDb } from "@/domain/db";
import { consultantById, fullName } from "@/domain/consultants";
import { consultantCode, dateShort, lkr, lkrShort, monthKey, prevMonthKey, time } from "@/domain/format";
import { activeMonths, labels, monthFigures, salesTrend } from "@/domain/ext/consultant-app";
import { useConsultant, useNow } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { Card, itemCount, needsPayment, OrderChips, SectionTitle } from "./bits";

export function Home() {
  usePageTitle("My business");
  const c = useConsultant()!;
  const db = useDb();
  const now = useNow();
  const L = labels(db);
  const thisMonth = monthKey(now);
  const [which, setWhich] = useState<"this" | "last">("this");
  const month = which === "this" ? thisMonth : prevMonthKey(thisMonth);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fig = useMemo(() => monthFigures(db, c.id, month, now), [db, c.id, month]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const trend = useMemo(() => salesTrend(db, c.id, activeMonths(db, c.id, now, 6)), [db, c.id, thisMonth]);
  const orders = useMemo(() => db.consultantOrders.filter((o) => o.consultantId === c.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [db, c.id]);
  const myOrdersThisMonth = orders.filter((o) => o.paidAt && monthKey(o.paidAt) === month && o.paymentStatus === "paid").length;
  const sponsor = consultantById(db, c.sponsorId);
  const toPay = orders.filter(needsPayment);
  const onTheWay = orders.filter((o) => o.deliveryStatus === "dispatched");
  const hour = Number(time(now).slice(0, 2));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const s = fig.settings;
  const baseNote = s.base === "mrp" ? "at MRP value" : "at your price";
  const met = fig.thresholdBasis >= s.threshold;

  return (
    <div className="space-y-5">
      {/* welcome */}
      <div className="relative overflow-hidden rounded-3xl bg-brand-gradient p-5 text-white shadow-lift">
        <svg className="pointer-events-none absolute -right-10 -top-10 size-44 opacity-15" viewBox="0 0 48 48" aria-hidden="true">
          <path d="M24 41.5c-1 0-2-.4-2.7-1.1L8.6 28.2C4.3 24 4 17.2 8 12.9c4-4.3 10.5-4.4 14.6-.4l1.4 1.4 1.4-1.4c4.1-4 10.6-3.9 14.6.4 4 4.3 3.7 11.1-.6 15.3L26.7 40.4c-.7.7-1.7 1.1-2.7 1.1z" fill="none" stroke="white" strokeWidth="2.5" />
        </svg>
        <div className="text-sm text-white/80">{greeting},</div>
        <h1 className="font-display text-[1.7rem] font-semibold leading-tight">{fullName(c)}</h1>
        <div className="mt-1 text-sm text-white/80">
          {L.one} {consultantCode(c.number)}
          {sponsor && sponsor.number !== 1 && <> · Sponsor {fullName(sponsor)}</>}
        </div>
        <div className="mt-5 grid grid-cols-4 gap-2">
          {[
            { to: "/app/shop", label: "Shop", icon: ShoppingBag },
            { to: "/app/invite", label: "Invite", icon: UserPlus },
            { to: "/app/team", label: "Team", icon: Users },
            { to: "/app/earnings", label: "Earnings", icon: Wallet },
          ].map((a) => (
            <Link key={a.to} to={a.to} className="flex flex-col items-center gap-1.5 rounded-2xl bg-white/12 py-3 text-xs font-medium ring-1 ring-inset ring-white/15 transition hover:bg-white/20">
              <a.icon className="size-5" />
              {a.label}
            </Link>
          ))}
        </div>
      </div>

      {/* things to do */}
      {(toPay.length > 0 || onTheWay.length > 0) && (
        <div className="grid gap-2">
          {toPay.slice(0, 2).map((o) => (
            <Link key={o.id} to={`/app/orders/${o.id}`} className="flex items-center gap-3 rounded-2xl bg-warning-soft px-4 py-3 text-sm ring-1 ring-inset ring-warning/20">
              <CircleAlert className="size-5 shrink-0 text-warning" />
              <span className="min-w-0 flex-1">
                <span className="font-medium">
                  {o.paymentStatus === "rejected" ? "Bank slip not accepted" : o.paymentStatus === "failed" ? "Payment didn't go through" : "Waiting for your payment"}
                </span>
                <span className="block text-muted-foreground">
                  {o.id} · {lkr(o.total)}
                </span>
              </span>
              <ArrowRight className="size-4 text-muted-foreground" />
            </Link>
          ))}
          {onTheWay.slice(0, 1).map((o) => (
            <Link key={o.id} to={`/app/orders/${o.id}`} className="flex items-center gap-3 rounded-2xl bg-info-soft px-4 py-3 text-sm ring-1 ring-inset ring-info/20">
              <Truck className="size-5 shrink-0 text-info" />
              <span className="min-w-0 flex-1">
                <span className="font-medium">Your order is on its way</span>
                <span className="block text-muted-foreground">{o.id} · tap to track</span>
              </span>
              <ArrowRight className="size-4 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}

      {/* month switch */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-semibold">{fig.label}</h2>
        <div className="inline-flex rounded-full bg-muted p-1 text-sm" role="tablist" aria-label="Month">
          {(["this", "last"] as const).map((w) => (
            <button
              key={w}
              role="tab"
              aria-selected={which === w}
              onClick={() => setWhich(w)}
              className={cn("rounded-full px-3 py-1 font-medium transition", which === w ? "bg-card text-foreground shadow-soft" : "text-muted-foreground")}
            >
              {w === "this" ? "This month" : "Last month"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Tile label="My sales" value={lkr(fig.ownSales)} sub={`${myOrdersThisMonth} paid order${myOrdersThisMonth === 1 ? "" : "s"}, ${baseNote}`} icon={ShoppingBag} tone="brand" />
        <Tile label="Team sales" value={lkr(fig.teamSales)} sub={`Direct team, ${baseNote}`} icon={Users} tone="plum" to="/app/team" />
        <Tile
          label={fig.closed ? "Commission" : fig.ended ? "Commission, to be confirmed" : "Commission so far"}
          value={lkr(fig.closed ? fig.payable : fig.amount)}
          sub={<Status>{fig.state}</Status>}
          icon={Wallet}
          tone="success"
          to="/app/earnings"
        />
        <Tile label="Team who ordered" value={`${fig.activeReferrals} of ${fig.teamSize}`} sub={fig.teamSize ? (month === thisMonth ? "Ordered this month" : "Ordered last month") : "No team yet"} icon={Package} tone="info" to="/app/team" />
      </div>

      {/* qualification */}
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Monthly target</div>
            <div className="text-xs text-muted-foreground">
              {s.thresholdCounts === "team_plus_own" ? "Team and own sales" : "Team sales"} of {lkr(s.threshold, { decimals: false })} to earn {s.rate}%
            </div>
          </div>
          {met ? (
            <StatusBadge tone="success">
              <CircleCheck className="size-3" /> Achieved
            </StatusBadge>
          ) : (
            <StatusBadge tone="warning">{lkr(s.threshold - fig.thresholdBasis)} to go</StatusBadge>
          )}
        </div>
        <ProgressBar value={fig.thresholdBasis} max={s.threshold} tone={met ? "success" : "brand"} className="mt-3 h-2.5" />
        <div className="mt-1.5 flex justify-between text-xs tabular text-muted-foreground">
          <span>{lkr(fig.thresholdBasis)}</span>
          <span>{lkr(s.threshold, { decimals: false })}</span>
        </div>
        {s.referralTest.enabled && (
          <div className="mt-4 border-t border-border pt-3">
            <div className="flex items-center justify-between text-sm">
              <span>Team members who ordered</span>
              <span className={cn("font-semibold tabular", fig.activeReferrals >= s.referralTest.min ? "text-success" : "text-warning")}>
                {fig.activeReferrals} of {s.referralTest.min} needed
              </span>
            </div>
            <ProgressBar value={fig.activeReferrals} max={s.referralTest.min} tone={fig.activeReferrals >= s.referralTest.min ? "success" : "warning"} className="mt-2" />
          </div>
        )}
        {fig.why && <p className="mt-3 text-xs text-muted-foreground">{fig.why}.</p>}
        {fig.stateNote && which === "last" && <p className="mt-3 text-xs text-muted-foreground">{fig.stateNote}</p>}
      </Card>

      {/* trend */}
      {trend.length > 1 && (
        <Card>
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Monthly sales</div>
            <div className="flex gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="size-2 rounded-full bg-[var(--chart-1)]" /> Mine
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="size-2 rounded-full bg-[var(--chart-2)]" /> Team
              </span>
            </div>
          </div>
          <div className="mt-3 h-36">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} barGap={3} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                <Tooltip
                  cursor={{ fill: "var(--muted)", radius: 8 }}
                  formatter={(v: number, n: string) => [lkr(v), n === "own" ? "My sales" : "Team sales"]}
                  contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", fontSize: 12 }}
                />
                <Bar dataKey="own" fill="var(--chart-1)" radius={[6, 6, 2, 2]} maxBarSize={22} />
                <Bar dataKey="team" fill="var(--chart-2)" radius={[6, 6, 2, 2]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 text-right text-xs text-muted-foreground">Best month: {lkrShort(Math.max(...trend.map((t) => t.own + t.team)))}</div>
        </Card>
      )}

      {/* recent orders */}
      <div>
        <SectionTitle
          action={
            <Link to="/app/orders" className="text-sm font-medium text-primary">
              View all
            </Link>
          }
        >
          Recent orders
        </SectionTitle>
        {orders.length ? (
          <div className="grid gap-2">
            {orders.slice(0, 3).map((o) => (
              <Link key={o.id} to={`/app/orders/${o.id}`} className="flex items-center gap-3 rounded-2xl bg-card p-3.5 shadow-soft ring-1 ring-inset ring-border/60 transition hover:shadow-lift">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-primary">
                  <Package className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{o.id}</span>
                    <span className="shrink-0 text-sm font-semibold tabular">{lkr(o.total)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      {dateShort(o.createdAt)} · {itemCount(o)} items
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <OrderChips o={o} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <Card className="text-center text-sm text-muted-foreground">
            No orders yet.{" "}
            <Link to="/app/shop" className="font-medium text-primary">
              Place your first order
            </Link>
          </Card>
        )}
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  icon: Icon,
  tone,
  to,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  icon: typeof Wallet;
  tone: "brand" | "plum" | "success" | "info";
  to?: string;
}) {
  const toneCls = { brand: "bg-brand-soft text-primary", plum: "bg-[oklch(0.95_0.03_330)] text-plum", success: "bg-success-soft text-success", info: "bg-info-soft text-info" }[tone];
  const body = (
    <div className="h-full rounded-2xl bg-card p-3.5 shadow-soft ring-1 ring-inset ring-border/60 transition hover:shadow-lift">
      <div className={cn("mb-3 flex size-9 items-center justify-center rounded-xl", toneCls)}>
        <Icon className="size-[1.1rem]" />
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-display text-[1.2rem] font-semibold leading-tight tabular">{value}</div>
      {sub && <div className="mt-1 text-[0.7rem] leading-snug text-muted-foreground">{sub}</div>}
    </div>
  );
  return to ? (
    <Link to={to} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}
