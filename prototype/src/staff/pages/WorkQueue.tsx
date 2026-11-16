// Staff home: what is waiting for the signed-in person's roles, with counts
// that open the right list. Approvals appear here too.

import { useMemo } from "react";
import { Link } from "react-router";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { useDb } from "@/domain/db";
import { itemsFor } from "@/domain/workqueue";
import { useNow, useStaffUser } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { PageHeader, StatusBadge } from "@/components/fc/ui";
import { ROLES } from "@/domain/permissions";
import { date, weekday } from "@/domain/format";
import { cn } from "@/lib/utils";

const TONE_BAR: Record<string, string> = {
  brand: "bg-primary",
  warning: "bg-warning",
  danger: "bg-destructive",
  info: "bg-info",
  success: "bg-success",
};

export function WorkQueue() {
  usePageTitle("What's waiting");
  const db = useDb();
  const user = useStaffUser();
  const now = useNow();
  const items = useMemo(() => (user ? itemsFor(db, now, user.roles) : []), [db, now, user]);
  const waiting = items.filter((i) => i.count > 0);
  const clear = items.filter((i) => i.count === 0);
  const hour = Number(new Date(Date.parse(now) + 5.5 * 3600_000).toISOString().slice(11, 13));
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow={`${weekday(now)} ${date(now)}`}
        title={`${greet}, ${user?.name.split(" ")[0]}`}
        description={
          waiting.length
            ? `${waiting.reduce((s, i) => s + i.count, 0)} things are waiting for ${user?.roles.map((r) => ROLES[r].label).join(" and ")}.`
            : "Nothing is waiting for you right now."
        }
      />
      {waiting.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {waiting.map((i) => (
            <Link
              key={i.key}
              to={i.to}
              className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift"
            >
              <span className={cn("absolute inset-y-0 left-0 w-1", TONE_BAR[i.tone])} />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-display text-4xl font-semibold tabular leading-none">{i.count}</div>
                  <div className="mt-2 font-medium">{i.label}</div>
                  <div className="mt-0.5 text-sm text-muted-foreground">{i.hint}</div>
                </div>
                <ArrowRight className="size-5 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-border py-16 text-center">
          <Sparkles className="size-8 text-primary" />
          <div className="mt-3 font-display text-xl font-semibold">All clear</div>
          <p className="mt-1 text-sm text-muted-foreground">New work will appear here as it comes in.</p>
        </div>
      )}
      {clear.length > 0 && (
        <div className="mt-8">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Up to date</div>
          <div className="flex flex-wrap gap-2">
            {clear.map((i) => (
              <StatusBadge key={i.key} tone="success" dot={false}>
                <CheckCircle2 className="size-3.5" /> {i.label}
              </StatusBadge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
