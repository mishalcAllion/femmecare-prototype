// "How earning works" with a small worked example, figured from the current
// pricing and commission settings so it always matches the rules in use.

import { BadgeCheck, Store, Users } from "lucide-react";
import { useDb } from "@/domain/db";
import { consultantPrice } from "@/domain/consultants";
import { lkr, round2 } from "@/domain/format";
import { labels } from "@/domain/ext/consultant-app";
import type { Db } from "@/domain/types";
import { cn } from "@/lib/utils";

export function earningExample(db: Db) {
  const p = db.products.find((x) => x.id === "FC001" && x.status === "active") ?? db.products.find((x) => x.status === "active");
  const mrp = p?.mrp ?? 950;
  const price = consultantPrice(db, mrp);
  const margin = round2(mrp - price);
  const marginPct = Math.round((margin / mrp) * 100);
  const s = db.settings.commission;
  const ownPacks = 10;
  const teamSize = 5;
  const teamPacks = 50;
  const teamValue = round2(teamPacks * (s.base === "mrp" ? mrp : price));
  const commission = round2((teamValue * s.rate) / 100);
  const ownMargin = round2(ownPacks * margin);
  return { product: p, mrp, price, margin, marginPct, rate: s.rate, threshold: s.threshold, base: s.base, counts: s.thresholdCounts, ownPacks, teamSize, teamPacks, teamValue, commission, ownMargin, total: round2(commission + ownMargin) };
}

export function EarningWays({ className, tone = "light" }: { className?: string; tone?: "light" | "dark" }) {
  const db = useDb();
  const L = labels(db);
  const x = earningExample(db);
  const dark = tone === "dark";
  const items = [
    {
      icon: Store,
      title: `${x.marginPct}% on everything you sell`,
      body: `You buy at ${x.marginPct}% below the MRP and sell at the MRP. The difference is yours, straight away.`,
    },
    {
      icon: Users,
      title: `${x.rate}% on your direct team's sales`,
      body: `Introduce friends as ${L.manyLower}. In any month their sales${x.counts === "team_plus_own" ? " plus your own" : ""} reach ${lkr(x.threshold, { decimals: false })}, FemmeCare pays you ${x.rate}% of your team's sales.`,
    },
    {
      icon: BadgeCheck,
      title: "Single level, clear rules",
      body: "You earn on the people you introduce, not on the people they introduce. Your statement shows the working every month.",
    },
  ];
  return (
    <div className={cn("grid gap-3 sm:grid-cols-3", className)}>
      {items.map((it) => (
        <div key={it.title} className={cn("rounded-2xl p-5", dark ? "bg-white/10 ring-1 ring-inset ring-white/15" : "bg-card shadow-soft ring-1 ring-inset ring-border/60")}>
          <div className={cn("mb-4 flex size-10 items-center justify-center rounded-xl", dark ? "bg-white/15 text-white" : "bg-brand-soft text-primary")}>
            <it.icon className="size-5" />
          </div>
          <div className={cn("font-semibold", dark && "text-white")}>{it.title}</div>
          <p className={cn("mt-1.5 text-sm leading-relaxed", dark ? "text-white/75" : "text-muted-foreground")}>{it.body}</p>
        </div>
      ))}
    </div>
  );
}

export function WorkedExample({ className }: { className?: string }) {
  const db = useDb();
  const L = labels(db);
  const x = earningExample(db);
  const name = x.product?.name ?? "Ultra Care Pads Regular";
  return (
    <div className={cn("rounded-3xl bg-card p-5 text-foreground shadow-lift ring-1 ring-inset ring-border/60 sm:p-6", className)}>
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">An example month</div>
      <div className="mt-4 space-y-4 text-sm">
        <Row
          label={`You sell ${x.ownPacks} packs of ${name}`}
          note={`MRP ${lkr(x.mrp)} each, you keep ${lkr(x.margin)} a pack`}
          value={lkr(x.ownMargin)}
        />
        <Row
          label={`Your team of ${x.teamSize} sells ${x.teamPacks} packs`}
          note={`${x.base === "mrp" ? "Team sales at MRP" : "Team purchases"} ${lkr(x.teamValue)} × ${x.rate}%, paid by FemmeCare`}
          value={lkr(x.commission)}
        />
        <div className="flex items-end justify-between gap-4 border-t border-dashed border-border pt-4">
          <div>
            <div className="font-semibold">Your month</div>
            <div className="text-xs text-muted-foreground">Margin in hand plus commission to your bank</div>
          </div>
          <div className="shrink-0 whitespace-nowrap font-display text-xl font-semibold tabular text-primary sm:text-2xl">{lkr(x.total)}</div>
        </div>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Illustration only. Commission is paid on your direct team's paid orders once the month is closed. What a {L.lower} earns depends on what they and their team sell.
      </p>
    </div>
  );
}

function Row({ label, note, value }: { label: string; note: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="font-medium">{label}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{note}</div>
      </div>
      <div className="shrink-0 font-semibold tabular">{value}</div>
    </div>
  );
}
