// C2 Shop and product page: MRP, your price, your margin per pack, In stock or
// Out of stock (never quantities), quantity steppers and add to cart.

import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Check, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ProductPack } from "@/components/fc/brand";
import { PageHeader, StatusBadge } from "@/components/fc/ui";
import { useDb } from "@/domain/db";
import { consultantPrice, deliveryCharge, inStock } from "@/domain/consultants";
import { lkr, round2 } from "@/domain/format";
import type { Product } from "@/domain/types";
import { usePageTitle } from "@/lib/title";
import { cn } from "@/lib/utils";
import { useCart } from "./cart";
import { QtyStepper } from "./bits";
import { AppNotFound } from "./Blocked";

export function Shop() {
  usePageTitle("Shop");
  const db = useDb();
  const cart = useCart();
  const products = db.products.filter((p) => p.status === "active");
  const free = db.settings.delivery.freeOver;
  return (
    <div>
      <PageHeader title="Shop" description={`Your price is shown on every pack. Delivery is free on orders of ${lkr(free, { decimals: false })} or more.`} />
      <div className="grid gap-3">
        {products.map((p) => (
          <ProductRow key={p.id} p={p} />
        ))}
      </div>
      {cart.count > 0 && (
        <div className="mt-6 hidden md:block">
          <Button nativeButton={false} render={<Link to="/app/cart" />} className="h-11 w-full rounded-full">
            <ShoppingCart className="size-4" /> Go to cart ({cart.count})
          </Button>
        </div>
      )}
    </div>
  );
}

function prices(db: ReturnType<typeof useDb>, p: Product) {
  const price = consultantPrice(db, p.mrp);
  return { price, margin: round2(p.mrp - price) };
}

function ProductRow({ p }: { p: Product }) {
  const db = useDb();
  const cart = useCart();
  const { price, margin } = prices(db, p);
  const ok = inStock(db, p.id);
  const [qty, setQty] = useState(1);
  const inCart = cart.qtyOf(p.id);
  return (
    <div className={cn("flex min-w-0 gap-3 rounded-2xl bg-card p-3 shadow-soft ring-1 ring-inset ring-border/60", !ok && "opacity-80")}>
      <Link to={`/app/shop/${p.id}`} className="shrink-0" aria-label={p.name}>
        <ProductPack product={p} className={cn("size-24 sm:size-28", !ok && "grayscale-[60%]")} />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <Link to={`/app/shop/${p.id}`} className="block min-w-0">
          <div className="truncate font-semibold leading-snug">{p.name}</div>
        </Link>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>
            {p.packSize} · {p.id}
          </span>
          <StockChip ok={ok} />
        </div>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
          <span className="text-lg font-semibold tabular">{lkr(price)}</span>
          <span className="text-xs text-muted-foreground line-through tabular">MRP {lkr(p.mrp)}</span>
        </div>
        <div className="text-xs font-medium text-success">You earn {lkr(margin)} a pack</div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          {ok ? (
            <>
              <QtyStepper value={qty} onChange={(n) => setQty(Math.max(1, n))} size="sm" label={p.name} />
              <Button
                size="sm"
                className="h-8 rounded-full px-3"
                onClick={() => {
                  cart.add(p.id, qty);
                  toast.success(`${qty} × ${p.name} added`, { description: `${inCart + qty} in your cart` });
                  setQty(1);
                }}
              >
                {inCart > 0 ? <Check className="size-4" /> : <ShoppingCart className="size-4" />}
                Add{inCart > 0 ? ` (${inCart})` : ""}
              </Button>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">Back soon. We'll restock this shortly.</span>
          )}
        </div>
      </div>
    </div>
  );
}

function StockChip({ ok }: { ok: boolean }) {
  return <StatusBadge tone={ok ? "success" : "danger"} className="shrink-0">{ok ? "In stock" : "Out of stock"}</StatusBadge>;
}

export function ShopProduct() {
  const { id } = useParams();
  const db = useDb();
  const cart = useCart();
  const navigate = useNavigate();
  const p = db.products.find((x) => x.id === id && x.status === "active");
  usePageTitle(p?.name ?? "Product");
  const [qty, setQty] = useState(1);
  if (!p) return <AppNotFound />;
  const { price, margin } = prices(db, p);
  const ok = inStock(db, p.id);
  const inCart = cart.qtyOf(p.id);
  const subtotalIfAdded = round2(cart.lines.reduce((a, l) => a + l.qty * consultantPrice(db, db.products.find((x) => x.id === l.productId)?.mrp ?? 0), 0) + qty * price);
  const charge = deliveryCharge(db, subtotalIfAdded);
  return (
    <div>
      <PageHeader title={p.name} back={{ to: "/app/shop", label: "Shop" }} />
      <div className="rounded-3xl bg-blush p-6">
        <ProductPack product={p} className={cn("mx-auto w-full max-w-[260px] drop-shadow-xl", !ok && "grayscale-[60%]")} />
      </div>
      <div className="mt-5 flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{p.category}</div>
          <div className="text-sm text-muted-foreground">
            {p.packSize} · Item code {p.id}
          </div>
        </div>
        <StockChip ok={ok} />
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{p.description}</p>
      <div className="mt-5 grid grid-cols-3 gap-2 rounded-2xl bg-card p-4 text-center shadow-soft ring-1 ring-inset ring-border/60">
        <div>
          <div className="text-xs text-muted-foreground">MRP</div>
          <div className="mt-0.5 font-semibold tabular">{lkr(p.mrp)}</div>
        </div>
        <div className="border-x border-border">
          <div className="text-xs text-muted-foreground">Your price</div>
          <div className="mt-0.5 font-semibold tabular text-primary">{lkr(price)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Your margin</div>
          <div className="mt-0.5 font-semibold tabular text-success">{lkr(margin)}</div>
        </div>
      </div>
      {ok ? (
        <>
          <div className="mt-5 flex items-center justify-between gap-3">
            <QtyStepper value={qty} onChange={(n) => setQty(Math.max(1, n))} label={p.name} />
            <div className="text-right text-sm">
              <div className="font-semibold tabular">{lkr(round2(qty * price))}</div>
              <div className="text-xs text-success">You earn {lkr(round2(qty * margin))} selling at MRP</div>
            </div>
          </div>
          <Button
            className="mt-4 h-12 w-full rounded-full text-base"
            onClick={() => {
              cart.add(p.id, qty);
              toast.success(`${qty} × ${p.name} added`, { action: { label: "View cart", onClick: () => navigate("/app/cart") } });
              setQty(1);
            }}
          >
            <ShoppingCart className="size-4" /> Add to cart{inCart > 0 ? ` (${inCart} already in it)` : ""}
          </Button>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {charge === 0 ? "Your cart qualifies for free delivery." : `Delivery ${lkr(charge)}, free over ${lkr(db.settings.delivery.freeOver, { decimals: false })}.`}
          </p>
        </>
      ) : (
        <div className="mt-5 rounded-2xl bg-muted p-4 text-sm text-muted-foreground">This product is out of stock for now. You can order it again as soon as the next batch arrives.</div>
      )}
    </div>
  );
}
