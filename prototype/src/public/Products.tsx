// W2 Catalogue and product page, at MRP only. Visitors can't buy here: they buy
// from a consultant or at a retail outlet.

import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowRight, Check, ChevronLeft, MapPin, Store, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductPack } from "@/components/fc/brand";
import { FilterTabs } from "@/components/fc/ui";
import { useDb } from "@/domain/db";
import { lkr } from "@/domain/format";
import { labels } from "@/domain/ext/consultant-app";
import { usePageTitle } from "@/lib/title";
import { Eyebrow, Section } from "./layout";
import { NotFound } from "./NotFound";

const FEATURES: Record<string, string[]> = {
  "Sanitary pads": ["Soft cotton-feel top layer", "Wings that stay in place", "Individually wrapped for your bag"],
  "Panty liners": ["Thin and breathable", "For everyday freshness", "Individually wrapped"],
  "Intimate care": ["pH balanced", "Alcohol free", "Gentle enough for daily use"],
  "Skin care": ["Calms chafing and redness", "Non-greasy finish", "With chamomile"],
};

export function Catalogue() {
  usePageTitle("Products");
  const db = useDb();
  const L = labels(db);
  const products = db.products.filter((p) => p.status === "active");
  const cats = useMemo(() => Array.from(new Set(products.map((p) => p.category))), [products]);
  const [cat, setCat] = useState("all");
  const shown = products.filter((p) => cat === "all" || p.category === cat);
  return (
    <div className="animate-rise">
      <div className="bg-blush px-4 pb-8 pt-10 sm:px-6 md:pt-14">
        <div className="mx-auto max-w-6xl">
          <Eyebrow>Products</Eyebrow>
          <h1 className="font-display text-4xl font-semibold md:text-5xl">Our products</h1>
          <p className="mt-3 max-w-xl text-muted-foreground">
            Everyday feminine hygiene at the printed maximum retail price (MRP). Buy from a FemmeCare {L.lower} or at retail outlets.
          </p>
          <div className="mt-6">
            <FilterTabs
              value={cat}
              onChange={setCat}
              options={[{ value: "all", label: "All", count: products.length }, ...cats.map((c) => ({ value: c, label: c, count: products.filter((p) => p.category === c).length }))]}
            />
          </div>
        </div>
      </div>
      <Section className="pt-8 md:pt-10">
        {shown.length ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
            {shown.map((p) => (
              <Link key={p.id} to={`/products/${p.id}`} className="group flex flex-col rounded-2xl bg-card p-3 shadow-soft ring-1 ring-inset ring-border/60 transition hover:-translate-y-0.5 hover:shadow-lift sm:p-4">
                <ProductPack product={p} className="mx-auto w-full max-w-[220px] transition group-hover:scale-[1.03]" />
                <div className="mt-3 text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">{p.category}</div>
                <div className="mt-0.5 font-semibold leading-snug">{p.name}</div>
                <div className="text-sm text-muted-foreground">{p.packSize}</div>
                <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                  <span className="font-semibold tabular">{lkr(p.mrp)}</span>
                  <span className="text-xs text-muted-foreground">MRP</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">No products in this group right now.</p>
        )}
        <HowToBuy className="mt-10" />
      </Section>
    </div>
  );
}

export function ProductPage() {
  const { id } = useParams();
  const db = useDb();
  const p = db.products.find((x) => x.id.toLowerCase() === (id ?? "").toLowerCase() && x.status === "active");
  usePageTitle(p?.name ?? "Product");
  if (!p) return <NotFound />;
  const others = db.products.filter((x) => x.status === "active" && x.id !== p.id).slice(0, 3);
  return (
    <div className="animate-rise">
      <Section className="pt-6 md:pt-10">
        <Link to="/products" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> All products
        </Link>
        <div className="grid gap-8 md:grid-cols-2 md:gap-12">
          <div className="rounded-3xl bg-blush p-6 sm:p-10">
            <ProductPack product={p} className="mx-auto w-full max-w-[380px] drop-shadow-xl" />
          </div>
          <div className="md:py-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{p.category}</div>
            <h1 className="mt-2 font-display text-3xl font-semibold leading-tight md:text-[2.6rem]">{p.name}</h1>
            <div className="mt-1 text-muted-foreground">
              {p.packSize} · Item code {p.id}
            </div>
            <div className="mt-6 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="whitespace-nowrap font-display text-3xl font-semibold tabular sm:text-4xl">{lkr(p.mrp)}</span>
              <span className="text-sm text-muted-foreground">Maximum retail price</span>
            </div>
            <p className="mt-5 leading-relaxed text-muted-foreground">{p.description}</p>
            <ul className="mt-5 grid gap-2 text-sm">
              {(FEATURES[p.category] ?? []).map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <span className="flex size-5 items-center justify-center rounded-full bg-success-soft text-success">
                    <Check className="size-3" />
                  </span>
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-8 rounded-2xl border border-border bg-muted/40 p-4 text-sm">
              <div className="font-semibold">Buy from a FemmeCare {labels(db).lower} or at retail outlets</div>
              <p className="mt-1 text-muted-foreground">We don't sell online. Ask a {labels(db).lower} near you, or find us at the stores below.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="outline" nativeButton={false} render={<Link to="/#where" />} className="rounded-full">
                  <MapPin className="size-4" /> Where to buy
                </Button>
                <Button variant="ghost" nativeButton={false} render={<Link to="/#become" />} className="rounded-full text-primary hover:text-primary">
                  Become {labels(db).a} <ArrowRight className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Section>
      <Section className="bg-[oklch(0.975_0.012_17)] py-12 md:py-14">
        <h2 className="font-display text-2xl font-semibold">You may also like</h2>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
          {others.map((o) => (
            <Link key={o.id} to={`/products/${o.id}`} className="group rounded-2xl bg-card p-3 shadow-soft ring-1 ring-inset ring-border/60 transition hover:-translate-y-0.5 hover:shadow-lift sm:p-4">
              <ProductPack product={o} className="mx-auto w-full max-w-[160px]" />
              <div className="mt-2 font-semibold leading-snug">{o.name}</div>
              <div className="text-sm tabular text-muted-foreground">MRP {lkr(o.mrp)}</div>
            </Link>
          ))}
        </div>
      </Section>
    </div>
  );
}

function HowToBuy({ className }: { className?: string }) {
  const db = useDb();
  const L = labels(db);
  const outlets = db.outlets.filter((o) => o.status === "active");
  return (
    <div className={`grid gap-3 md:grid-cols-2 ${className ?? ""}`}>
      <div className="rounded-2xl bg-brand-soft p-5">
        <div className="flex items-center gap-2 font-semibold">
          <Users className="size-4 text-primary" /> From a FemmeCare {L.lower}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {L.many} sell at the MRP and deliver in their area. Want to sell too? {L.many} buy at their own price and keep the margin.
        </p>
        <Link to="/#become" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          How earning works <ArrowRight className="size-4" />
        </Link>
      </div>
      <div className="rounded-2xl bg-card p-5 shadow-soft ring-1 ring-inset ring-border/60">
        <div className="flex items-center gap-2 font-semibold">
          <Store className="size-4 text-primary" /> At retail outlets
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{outlets.slice(0, 5).map((o) => o.name).join(", ")} and more.</p>
        <Link to="/#where" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          See all stores <ArrowRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}
