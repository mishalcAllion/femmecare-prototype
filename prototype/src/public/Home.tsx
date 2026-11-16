// W1 Home: hero, product range, why FemmeCare, becoming a consultant, where to buy.

import { Link } from "react-router";
import { ArrowRight, Feather, Leaf, MapPin, ShieldCheck, Sparkles, Store, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeartMark, ProductPack } from "@/components/fc/brand";
import { useDb } from "@/domain/db";
import { lkr } from "@/domain/format";
import { labels } from "@/domain/ext/consultant-app";
import { usePageTitle } from "@/lib/title";
import { EarningWays, WorkedExample } from "./earn";
import { Eyebrow, Section } from "./layout";

export function Home() {
  usePageTitle("FemmeCare", "Sustainable Hygiene. Dignified Care.");
  const db = useDb();
  const L = labels(db);
  const products = db.products.filter((p) => p.status === "active");
  const hero = ["FC001", "FC002", "FC005"].map((id) => products.find((p) => p.id === id)).filter(Boolean) as typeof products;
  const outlets = db.outlets.filter((o) => o.status === "active");
  return (
    <div className="animate-rise">
      {/* hero */}
      <section className="relative overflow-hidden bg-blush px-4 pb-16 pt-10 sm:px-6 md:pb-24 md:pt-16">
        <div className="mx-auto grid max-w-6xl items-center gap-10 md:grid-cols-[1.05fr_1fr]">
          <div>
            <Eyebrow>Sustainable Hygiene. Dignified Care.</Eyebrow>
            <h1 className="font-display text-[2.4rem] font-semibold leading-[1.05] sm:text-5xl md:text-[3.6rem]">
              Care you can count on, <span className="text-primary">every day</span> of the month.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
              Soft, secure pads, liners and intimate care made for women in Sri Lanka. Buy from a FemmeCare {L.lower} near you, or at your favourite store.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button nativeButton={false} render={<Link to="/products" />} className="h-12 rounded-full px-6 text-base">
                See our products <ArrowRight className="size-4" />
              </Button>
              <Button variant="outline" nativeButton={false} render={<Link to="/#become" />} className="h-12 rounded-full bg-white/70 px-6 text-base">
                Become {L.a}
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Feather className="size-4 text-primary" /> Soft comfort
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="size-4 text-primary" /> Secure protection
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Leaf className="size-4 text-primary" /> Skin friendly
              </span>
            </div>
          </div>
          <div className="relative mx-auto aspect-square w-full max-w-[460px]">
            <div className="absolute inset-[6%] rounded-full bg-gradient-to-br from-[oklch(0.9_0.06_17)] via-[oklch(0.94_0.04_350)] to-[oklch(0.95_0.03_320)]" />
            <HeartMark className="absolute right-[4%] top-[2%] size-20 opacity-25" />
            {hero[0] && <ProductPack product={hero[0]} className="absolute left-[18%] top-[16%] w-[52%] rotate-[-6deg] drop-shadow-xl" />}
            {hero[1] && <ProductPack product={hero[1]} className="absolute right-[4%] top-[34%] w-[42%] rotate-[7deg] drop-shadow-xl" />}
            {hero[2] && <ProductPack product={hero[2]} className="absolute bottom-[4%] left-[6%] w-[34%] rotate-[-3deg] drop-shadow-xl" />}
            <div className="absolute bottom-[14%] right-[6%] rounded-2xl bg-white/90 px-4 py-3 shadow-lift backdrop-blur">
              <div className="text-xs text-muted-foreground">Ultra Care Pads, from</div>
              <div className="font-display text-xl font-semibold tabular">{lkr(Math.min(...products.filter((p) => p.category === "Sanitary pads").map((p) => p.mrp)))}</div>
            </div>
            <div className="absolute left-[2%] top-[8%] inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium shadow-soft">
              <Sparkles className="size-3.5 text-primary" /> Night pads, 320 mm long
            </div>
          </div>
        </div>
      </section>

      {/* range */}
      <Section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>Our range</Eyebrow>
            <h2 className="font-display text-3xl font-semibold md:text-4xl">Everyday essentials</h2>
            <p className="mt-2 max-w-xl text-muted-foreground">Six products for every day of your cycle and beyond. Prices shown are the maximum retail price.</p>
          </div>
          <Button variant="outline" nativeButton={false} render={<Link to="/products" />} className="rounded-full">
            All products <ArrowRight className="size-4" />
          </Button>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
          {products.map((p) => (
            <Link key={p.id} to={`/products/${p.id}`} className="group rounded-2xl bg-card p-3 shadow-soft ring-1 ring-inset ring-border/60 transition hover:-translate-y-0.5 hover:shadow-lift sm:p-4">
              <ProductPack product={p} className="mx-auto w-full max-w-[200px] transition group-hover:scale-[1.03]" />
              <div className="mt-3 text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">{p.category}</div>
              <div className="mt-0.5 font-semibold leading-snug">{p.name}</div>
              <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
                <span className="text-muted-foreground">{p.packSize}</span>
                <span className="font-semibold tabular">MRP {lkr(p.mrp)}</span>
              </div>
            </Link>
          ))}
        </div>
      </Section>

      {/* why */}
      <Section className="bg-[oklch(0.975_0.012_17)]">
        <div className="grid gap-10 md:grid-cols-[1fr_1.3fr] md:items-center">
          <div>
            <Eyebrow>Why FemmeCare</Eyebrow>
            <h2 className="font-display text-3xl font-semibold md:text-4xl">Made with care, for every woman.</h2>
            <p className="mt-3 text-muted-foreground">
              Good hygiene should be comfortable, dependable and within reach. We design every pack to be gentle on skin and easy to find, through women in your own community.
            </p>
            <blockquote className="mt-6 border-l-2 border-primary pl-4 font-display text-xl italic text-plum">Income for me. Confidence for her.</blockquote>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { icon: Feather, t: "Soft comfort", b: "A soft top layer and slim fit that you forget you're wearing." },
              { icon: ShieldCheck, t: "Secure protection", b: "Wings and a wide back on night pads for confidence day and night." },
              { icon: Leaf, t: "Skin friendly", b: "Breathable layers and pH-balanced care products for sensitive skin." },
              { icon: HeartIcon, t: "Dignified care", b: "Sold woman to woman, so buying what you need feels easy and private." },
            ].map((x) => (
              <div key={x.t} className="rounded-2xl bg-card p-5 shadow-soft ring-1 ring-inset ring-border/60">
                <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-brand-soft text-primary">
                  <x.icon className="size-5" />
                </div>
                <div className="font-semibold">{x.t}</div>
                <p className="mt-1 text-sm text-muted-foreground">{x.b}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* become */}
      <section id="become" className="relative scroll-mt-16 overflow-hidden bg-brand-gradient px-4 py-16 text-white sm:px-6 md:py-24">
        <svg className="pointer-events-none absolute -right-24 -top-24 size-[420px] opacity-10" viewBox="0 0 48 48" aria-hidden="true">
          <path d="M24 41.5c-1 0-2-.4-2.7-1.1L8.6 28.2C4.3 24 4 17.2 8 12.9c4-4.3 10.5-4.4 14.6-.4l1.4 1.4 1.4-1.4c4.1-4 10.6-3.9 14.6.4 4 4.3 3.7 11.1-.6 15.3L26.7 40.4c-.7.7-1.7 1.1-2.7 1.1z" fill="none" stroke="white" strokeWidth="2" />
        </svg>
        <div className="relative mx-auto max-w-6xl">
          <div className="grid gap-10 md:grid-cols-[1.2fr_1fr] md:items-center">
            <div>
              <Eyebrow className="text-white/80">Become {L.a}</Eyebrow>
              <h2 className="font-display text-3xl font-semibold leading-tight md:text-[2.75rem]">Earn with FemmeCare, in two simple ways.</h2>
              <p className="mt-3 max-w-xl text-white/80">
                Sell to friends, family and your community at the MRP, and build a small team of your own. No joining fee and no stock to hold: order when you need it, delivered to your door.
              </p>
              <EarningWays tone="dark" className="mt-8" />
            </div>
            <WorkedExample />
          </div>
          <div className="mt-12 grid gap-4 rounded-3xl bg-white/10 p-5 ring-1 ring-inset ring-white/15 sm:grid-cols-3 sm:p-6">
            {[
              ["1", "Apply online", "Five short steps, about five minutes. Have your NIC and bank details ready."],
              ["2", "We check your details", "Within two working days. We email and text you your number."],
              ["3", "Start selling", "Sign in, order at your price and share your own invite link."],
            ].map(([n, t, b]) => (
              <div key={n} className="flex gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-primary">{n}</span>
                <div>
                  <div className="font-semibold">{t}</div>
                  <p className="mt-0.5 text-sm text-white/75">{b}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button nativeButton={false} render={<Link to="/join" />} className="h-12 rounded-full bg-white px-6 text-base text-primary hover:bg-white/90">
              Apply now <ArrowRight className="size-4" />
            </Button>
            <Button variant="ghost" nativeButton={false} render={<Link to="/signin" />} className="h-12 rounded-full px-6 text-base text-white hover:bg-white/10 hover:text-white">
              Already {L.a}? Sign in
            </Button>
          </div>
        </div>
      </section>

      {/* where */}
      <Section id="where">
        <div className="grid gap-10 md:grid-cols-[1fr_1.4fr]">
          <div>
            <Eyebrow>Where to buy</Eyebrow>
            <h2 className="font-display text-3xl font-semibold md:text-4xl">Find FemmeCare near you</h2>
            <p className="mt-3 text-muted-foreground">
              Ask any FemmeCare {L.lower}, or pick up a pack at these stores. Every pack is sold at or below its printed MRP.
            </p>
            <div className="mt-6 rounded-2xl bg-brand-soft p-5">
              <div className="flex items-center gap-2 font-semibold">
                <Users className="size-4 text-primary" /> Buy from {L.a}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{L.many} deliver to friends, family and workplaces in their area. Ask the person who shared FemmeCare with you.</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {outlets.map((o) => (
              <div key={o.id} className="flex items-start gap-3 rounded-2xl bg-card p-4 shadow-soft ring-1 ring-inset ring-border/60">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-primary">
                  <Store className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold">{o.name}</div>
                  <div className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="size-3.5" />
                    {Array.from(new Set([o.city, ...o.deliveryAddresses.map((a) => a.city)])).slice(0, 3).join(", ")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>
    </div>
  );
}

function HeartIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20.5s-7.5-4.4-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.8-7.5 10.2-7.5 10.2z" />
    </svg>
  );
}
