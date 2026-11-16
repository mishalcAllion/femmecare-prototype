// S30 Network explorer: the sponsor tree from FemmeCare No. 1, with team size and
// this month's sales per person. Commission is paid on the first level only.

import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ChevronDown, ChevronRight, Info, Minus, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/fc/brand";
import { PageHeader, Panel, Status } from "@/components/fc/ui";
import { useDb } from "@/domain/db";
import { consultantByNumber, fullName, STATUS_LABEL } from "@/domain/consultants";
import { salesByConsultant } from "@/domain/commission";
import { consultantCode, lkr, monthKey, monthLabel } from "@/domain/format";
import type { Consultant } from "@/domain/types";
import { useNow } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { cn } from "@/lib/utils";
import { Guard } from "../../guard";
import { useLabel } from "./shared";

export function NetworkPage() {
  return (
    <Guard perms={["consultants.view"]}>
      <NetworkExplorer />
    </Guard>
  );
}

function NetworkExplorer() {
  const L = useLabel();
  usePageTitle("Network");
  const db = useDb();
  const now = useNow();
  const month = monthKey(now);
  const root = consultantByNumber(db, 1);
  const children = useMemo(() => {
    const m = new Map<string, Consultant[]>();
    for (const c of db.consultants) {
      if (c.number === undefined || !c.sponsorId) continue;
      const list = m.get(c.sponsorId) ?? [];
      list.push(c);
      m.set(c.sponsorId, list);
    }
    for (const list of m.values()) list.sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
    return m;
  }, [db]);
  const sales = useMemo(() => salesByConsultant(db, month, db.settings.commission), [db, month]);
  const parents = useMemo(() => new Map(db.consultants.map((c) => [c.id, c.sponsorId])), [db]);
  const [open, setOpen] = useState<Set<string>>(() => new Set(root ? [root.id] : []));
  const [q, setQ] = useState("");
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase().replace(/^fc0*/, "");
    if (!needle) return new Set<string>();
    return new Set(
      db.consultants
        .filter((c) => c.number !== undefined)
        .filter((c) => fullName(c).toLowerCase().includes(q.trim().toLowerCase()) || String(c.number) === needle || consultantCode(c.number).toLowerCase() === q.trim().toLowerCase())
        .map((c) => c.id),
    );
  }, [db, q]);
  // when searching, open every ancestor of a match
  const expanded = useMemo(() => {
    if (!matches.size) return open;
    const s = new Set(open);
    for (const id of matches) {
      let p = parents.get(id);
      let guard = 0;
      while (p && guard++ < 50) {
        s.add(p);
        p = parents.get(p);
      }
    }
    return s;
  }, [matches, open, parents]);
  const toggle = (id: string) => {
    const n = new Set(expanded);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setOpen(n);
  };
  const all = db.consultants.filter((c) => c.number !== undefined && children.has(c.id)).map((c) => c.id);
  const total = db.consultants.filter((c) => c.number !== undefined && c.number !== 1).length;
  const depth = useMemo(() => {
    let max = 0;
    const walk = (id: string, d: number) => {
      max = Math.max(max, d);
      for (const k of children.get(id) ?? []) walk(k.id, d + 1);
    };
    if (root) walk(root.id, 0);
    return max;
  }, [children, root]);

  const node = (c: Consultant, level: number) => {
    const kids = children.get(c.id) ?? [];
    const isOpen = expanded.has(c.id);
    const team = kids.filter((k) => k.status !== "terminated").length;
    const teamSales = kids.reduce((a, k) => a + (sales.get(k.id) ?? 0), 0);
    const hit = matches.has(c.id);
    return (
      <li key={c.id}>
        <div
          className={cn(
            "group flex items-center gap-2 rounded-xl px-2 py-1.5 transition hover:bg-accent/60",
            hit && "bg-brand-soft ring-1 ring-primary/30",
            c.status !== "active" && "opacity-70",
          )}
          style={{ paddingLeft: `${0.5 + level * 1.5}rem` }}
        >
          <button
            type="button"
            onClick={() => kids.length && toggle(c.id)}
            className={cn("flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground", kids.length ? "hover:bg-muted hover:text-foreground" : "invisible")}
            aria-label={isOpen ? "Collapse" : "Expand"}
          >
            {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
          <Avatar name={fullName(c)} hue={c.avatarHue} size="sm" />
          <Link to={`/staff/consultants/${c.id}`} className="min-w-0 flex-1 hover:text-primary">
            <span className="block truncate text-sm font-medium">{fullName(c)}</span>
            <span className="block text-xs text-muted-foreground tabular">
              {consultantCode(c.number)}
              {level === 1 && " · first level under FemmeCare"}
            </span>
          </Link>
          {c.status !== "active" && <Status>{STATUS_LABEL[c.status]}</Status>}
          <div className="hidden w-24 text-right text-xs sm:block">
            <div className="tabular font-medium">{team}</div>
            <div className="text-muted-foreground">direct team</div>
          </div>
          <div className="w-32 text-right text-xs">
            <div className="tabular font-medium">{lkr(sales.get(c.id) ?? 0)}</div>
            <div className="text-muted-foreground">own sales</div>
          </div>
          <div className="hidden w-32 text-right text-xs md:block">
            <div className="tabular font-medium">{lkr(teamSales)}</div>
            <div className="text-muted-foreground">team sales</div>
          </div>
        </div>
        {isOpen && kids.length > 0 && (
          <ul className="relative">
            <span className="absolute bottom-2 top-0 border-l border-dashed border-border" style={{ left: `${1.25 + level * 1.5}rem` }} />
            {kids.map((k) => node(k, level + 1))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className="animate-rise">
      <PageHeader
        title="Network"
        description={`Who sponsored whom, from FemmeCare No. 1. ${total} ${L.lowerMany}, up to ${depth} levels deep. Sales are for ${monthLabel(month)}.`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setOpen(new Set(all))}>
              <Plus className="size-4" /> Expand all
            </Button>
            <Button variant="outline" size="sm" onClick={() => setOpen(new Set(root ? [root.id] : []))}>
              <Minus className="size-4" /> Collapse
            </Button>
          </>
        }
      />
      <div className="mb-4 flex items-start gap-3 rounded-2xl border border-primary/20 bg-brand-soft p-4 text-sm">
        <Info className="mt-0.5 size-4.5 shrink-0 text-primary" />
        <div>
          <div className="font-medium">Commission is paid on the first level only</div>
          <p className="mt-0.5 text-muted-foreground">
            A sponsor earns {db.settings.commission.rate}% on the sales of the {L.lowerMany} she recruited herself. Deeper levels are shown here so you can see the whole network, but they earn their own sponsor nothing.
          </p>
        </div>
      </div>
      <Panel
        bodyClassName="p-3"
        title={
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Find by name or ${L.lower} number`} className="h-9 pl-9 font-normal" />
          </div>
        }
        actions={q && <span className="text-sm text-muted-foreground">{matches.size} found</span>}
      >
        {root ? (
          <ul className="space-y-0.5">
            {node(root, 0)}
          </ul>
        ) : (
          <p className="p-6 text-center text-sm text-muted-foreground">The network is empty.</p>
        )}
      </Panel>
    </div>
  );
}
