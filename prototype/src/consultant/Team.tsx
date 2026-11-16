// C6 My team: direct recruits only, with join date, status, whether they ordered
// this month and this month's sales. No contact or bank details. Second-level
// recruits are not listed.

import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Info, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/fc/brand";
import { EmptyState, FilterTabs, PageHeader, Status, StatusBadge } from "@/components/fc/ui";
import { useDb } from "@/domain/db";
import { fullName, STATUS_LABEL } from "@/domain/consultants";
import { consultantCode, date, lkr, lkrShort, monthKey, monthLabel } from "@/domain/format";
import { labels, monthFigures } from "@/domain/ext/consultant-app";
import { useConsultant, useNow } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { Card } from "./bits";

export function Team() {
  usePageTitle("My team");
  const c = useConsultant()!;
  const db = useDb();
  const now = useNow();
  const L = labels(db);
  const month = monthKey(now);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fig = useMemo(() => monthFigures(db, c.id, month, now), [db, c.id, month]);
  const pending = db.consultants.filter((x) => x.sponsorId === c.id && x.status === "pending").length;
  const [filter, setFilter] = useState<"all" | "ordered" | "not">("all");
  const rows = [...fig.team].sort((a, b) => b.sales - a.sales || (a.consultant.joinedAt ?? "").localeCompare(b.consultant.joinedAt ?? ""));
  const shown = rows.filter((r) => filter === "all" || (filter === "ordered" ? r.sales > 0 : r.sales === 0));
  const baseNote = fig.settings.base === "mrp" ? "at MRP value" : "at their price";

  return (
    <div>
      <PageHeader
        title="My team"
        description={`The ${L.manyLower} you introduced. ${monthLabel(month)} sales are ${baseNote}.`}
        actions={
          <Button nativeButton={false} render={<Link to="/app/invite" />} size="sm" className="rounded-full">
            <UserPlus className="size-4" /> Invite
          </Button>
        }
      />

      <div className="grid grid-cols-3 gap-2">
        <Stat label="In your team" value={String(fig.teamSize)} />
        <Stat label="Ordered this month" value={`${fig.activeReferrals}`} />
        <Stat label="Team sales" value={lkrShort(fig.teamSales)} />
      </div>

      {pending > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-2xl bg-info-soft px-4 py-3 text-sm">
          <Info className="size-4 shrink-0 text-info" />
          {pending} {pending === 1 ? "person has" : "people have"} applied with your link. They join your team once FemmeCare approves them.
        </div>
      )}

      {rows.length > 0 && (
        <div className="mt-5">
          <FilterTabs
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All", count: rows.length },
              { value: "ordered", label: "Ordered", count: rows.filter((r) => r.sales > 0).length },
              { value: "not", label: "Not yet", count: rows.filter((r) => r.sales === 0).length },
            ]}
          />
        </div>
      )}

      <div className="mt-3 grid gap-2">
        {shown.map(({ consultant: m, sales }) => (
          <Card key={m.id} className="flex items-center gap-3 p-3.5">
            <Avatar name={fullName(m)} hue={m.avatarHue} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold">{fullName(m)}</span>
                <span className="shrink-0 text-sm font-semibold tabular">{lkr(sales)}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <span className="text-xs text-muted-foreground">
                  {consultantCode(m.number)} · Joined {date(m.joinedAt)}
                </span>
                <span className="flex gap-1">
                  {m.status !== "active" && <Status>{STATUS_LABEL[m.status]}</Status>}
                  <StatusBadge tone={sales > 0 ? "success" : "neutral"}>{sales > 0 ? "Ordered" : "Not yet"}</StatusBadge>
                </span>
              </div>
            </div>
          </Card>
        ))}
        {!rows.length && (
          <EmptyState
            icon={<Users className="size-5" />}
            title="No one in your team yet"
            description={`Share your invite link. When someone you introduce joins, you earn ${fig.settings.rate}% on their sales each month.`}
            action={
              <Button nativeButton={false} render={<Link to="/app/invite" />} className="rounded-full">
                Invite someone
              </Button>
            }
          />
        )}
      </div>

      <p className="mt-5 flex gap-2 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        Only your direct team is listed. People your team members introduce join their teams, not yours, and their sales don't count toward your commission. Contact details stay private: ask FemmeCare if you need to reach someone.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-card p-3 text-center shadow-soft ring-1 ring-inset ring-border/60">
      <div className="whitespace-nowrap font-display text-base font-semibold leading-tight tabular sm:text-lg">{value}</div>
      <div className="mt-0.5 text-[0.7rem] text-muted-foreground">{label}</div>
    </div>
  );
}
