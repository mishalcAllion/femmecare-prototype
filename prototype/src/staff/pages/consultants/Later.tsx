// Later previews: L1 Promotions, L2 Ranks, L3 Returns. Shown only when later-phase
// features are switched on; otherwise the route is a normal not-found page.

import { CalendarRange, Gift, HelpCircle, PackageX, RotateCcw, Trophy, Truck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Panel, SimpleTable, Status, type Column } from "@/components/fc/ui";
import { ProductPack } from "@/components/fc/brand";
import { useDb } from "@/domain/db";
import { productOf } from "@/domain/stock";
import { date, lkIso, lkr } from "@/domain/format";
import { useNow, useReviewNotes } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { Guard, NotFound } from "../../guard";
import { LaterTag, useLabel } from "./shared";

function useLater() {
  const db = useDb();
  return db.meta.phaseLens === "everything";
}

// ---------- L1 Promotions ----------

interface Promo {
  id: string;
  name: string;
  productId: string;
  rule: string;
  from: string;
  to: string;
  channel: string;
  status: string;
}

export function PromotionsPage() {
  const on = useLater();
  if (!on) return <NotFound />;
  return (
    <Guard perms={["products.edit"]}>
      <Promotions />
    </Guard>
  );
}

function Promotions() {
  usePageTitle("Promotions");
  const db = useDb();
  const now = useNow();
  const notes = useReviewNotes();
  const L = useLabel();
  const y = now.slice(0, 4);
  const promos: Promo[] = [
    { id: "PRM-01", name: "Buy 10 Ultra Care Pads, get 1 free", productId: "FC001", rule: "Every 10 packs in one order adds 1 free pack", from: lkIso(`${y}-04-01`), to: lkIso(`${y}-04-30`), channel: `${L.many}`, status: "Draft" },
    { id: "PRM-02", name: "Avurudu bundle: Night pads with Soothing Cream", productId: "FC002", rule: "LKR 150 off the bundle", from: lkIso(`${y}-04-05`), to: lkIso(`${y}-04-20`), channel: `${L.many} and outlets`, status: "Draft" },
    { id: "PRM-03", name: "New recruit starter pack", productId: "FC003", rule: "First order over LKR 5,000 gets free delivery", from: lkIso(`${y}-03-15`), to: lkIso(`${y}-06-30`), channel: `${L.many}`, status: "Planned" },
  ];
  const cols: Column<Promo>[] = [
    {
      key: "name",
      header: "Promotion",
      cell: (p) => {
        const prod = productOf(db, p.productId);
        return (
          <div className="flex items-center gap-3">
            {prod && <ProductPack product={prod} className="size-10" />}
            <div>
              <div className="font-medium">{p.name}</div>
              <div className="text-xs text-muted-foreground">{p.rule}</div>
            </div>
          </div>
        );
      },
      value: (p) => p.name,
    },
    { key: "dates", header: "Runs", cell: (p) => `${date(p.from)} to ${date(p.to)}`, value: (p) => p.from },
    { key: "ch", header: "Channel", cell: (p) => p.channel, value: (p) => p.channel },
    { key: "st", header: "Status", cell: (p) => <Status>{p.status}</Status>, value: (p) => p.status },
  ];
  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow={<LaterTag />}
        title="Promotions and offers"
        description="Time-limited offers by product and channel, applied automatically at checkout."
        actions={
          <Button disabled>
            <Gift className="size-4" /> New promotion
          </Button>
        }
      />
      <SimpleTable rows={promos} columns={cols} rowKey={(p) => p.id} searchable={false} />
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <Panel title="How an offer is set up">
          <ul className="space-y-3 text-sm">
            <li className="flex gap-2.5">
              <Gift className="mt-0.5 size-4 shrink-0 text-primary" /> Choose the product and the rule: free packs, a price off, or free delivery
            </li>
            <li className="flex gap-2.5">
              <CalendarRange className="mt-0.5 size-4 shrink-0 text-primary" /> Set the start and end dates
            </li>
            <li className="flex gap-2.5">
              <Truck className="mt-0.5 size-4 shrink-0 text-primary" /> Pick the channel: {L.lowerMany}, retail outlets, or both
            </li>
          </ul>
        </Panel>
        {notes && (
          <Panel title="Open question" className="ring-1 ring-warning/30">
            <p className="flex gap-2.5 text-sm">
              <HelpCircle className="mt-0.5 size-4 shrink-0 text-warning" />
              Does a free pack count toward the sponsor's commission and the {lkr(db.settings.commission.threshold, { decimals: false })} threshold? It has an MRP value but nobody paid for it. FemmeCare to decide before offers go live.
            </p>
          </Panel>
        )}
      </div>
    </div>
  );
}

// ---------- L2 Ranks ----------

export function RanksPage() {
  const on = useLater();
  if (!on) return <NotFound />;
  return (
    <Guard perms={["consultants.edit"]}>
      <Ranks />
    </Guard>
  );
}

function Ranks() {
  usePageTitle("Ranks");
  const L = useLabel();
  const db = useDb();
  const ranks = [
    { name: `Starter ${L.one}`, tag: "Start your journey", perks: "Access to the full range, training and support" },
    { name: `Active ${L.one}`, tag: "Build your business", perks: "Monthly promotions and incentives, mentoring" },
    { name: "Team Builder", tag: "Create a team", perks: "Team bonuses and recognition, exclusive training" },
    { name: "Business Leader", tag: "Lead and grow", perks: "Leadership bonuses, rewards and trips" },
  ];
  return (
    <div className="animate-rise">
      <PageHeader eyebrow={<LaterTag />} title="Participation options and ranks" description={`The four ways to take part, from the FemmeCare business plan. Each ${L.lower} would show her rank in the app.`} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {ranks.map((r, i) => (
          <Panel key={r.name} className="relative">
            <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-brand-soft text-primary">
              <Trophy className="size-5" />
            </div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Option {i + 1}</div>
            <div className="mt-1 font-display text-lg font-semibold">{r.name}</div>
            <div className="text-sm text-muted-foreground">{r.tag}</div>
            <p className="mt-3 text-sm">{r.perks}</p>
            <div className="mt-4 space-y-2 border-t border-border/60 pt-3 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Monthly sales to qualify</span>
                <span className="font-medium">To be agreed</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Active team members</span>
                <span className="font-medium">To be agreed</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Extra benefit</span>
                <span className="font-medium">To be agreed</span>
              </div>
            </div>
          </Panel>
        ))}
      </div>
      <p className="mt-5 text-sm text-muted-foreground">The qualifying rules for each rank are left blank until FemmeCare agrees them. The first release has no ranks: every {L.lower} earns the same {db.settings.commission.rate}% on her direct team.</p>
    </div>
  );
}

// ---------- L3 Returns ----------

export function ReturnsPage() {
  const on = useLater();
  if (!on) return <NotFound />;
  return (
    <Guard perms={["consultantOrders.manage"]}>
      <Returns />
    </Guard>
  );
}

function Returns() {
  usePageTitle("Returns");
  const L = useLabel();
  const steps = [
    { icon: RotateCcw, title: `${L.one} asks to return`, text: "From the order in the app, within the return window, choosing the packs and the reason, with a photo." },
    { icon: Truck, title: "Goods come back", text: "By courier to the warehouse. Operations records what arrived." },
    { icon: PackageX, title: "Stores inspect", text: "Good packs go back to consultant stock in their batch. Damaged packs are written off with a reason." },
    { icon: Wallet, title: "Finance refunds", text: "Refund to the bank account. If the sale's month is closed, the sponsor's commission is adjusted next month." },
  ];
  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow={<LaterTag />}
        title={`${L.one} returns`}
        description={`Today a ${L.lower} can cancel before dispatch, and Operations can refund a delivered order. A full returns flow would add the steps below. Retail outlets do not return goods.`}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {steps.map((s, i) => (
          <Panel key={s.title}>
            <div className="mb-3 flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{i + 1}</span>
              <s.icon className="size-5 text-primary" />
            </div>
            <div className="font-medium">{s.title}</div>
            <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
          </Panel>
        ))}
      </div>
      <Panel title="Open questions" className="mt-5">
        <ul className="list-disc space-y-1.5 pl-5 text-sm">
          <li>How many days after delivery can a {L.lower} return goods?</li>
          <li>Are opened packs accepted back, given they are hygiene products?</li>
          <li>Who pays the courier for a return?</li>
        </ul>
      </Panel>
    </div>
  );
}
