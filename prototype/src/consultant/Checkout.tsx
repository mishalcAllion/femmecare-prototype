// C3 Cart and checkout: lines, subtotal, delivery charge from the rule in settings
// (free over the limit, with a nudge), delivery address, payment method, place order.

import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Banknote, CreditCard, Landmark, Loader2, MapPin, ShoppingBag, Trash2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ProductPack } from "@/components/fc/brand";
import { EmptyState, PageHeader, ProgressBar } from "@/components/fc/ui";
import { useDb } from "@/domain/db";
import { actions } from "@/domain/actions";
import { consultantPrice, deliveryCharge, inStock } from "@/domain/consultants";
import { addressLine, lkr, round2 } from "@/domain/format";
import type { PaymentMethod } from "@/domain/types";
import { act, useConsultant } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { cn } from "@/lib/utils";
import { useCart } from "./cart";
import { Card, QtyStepper, SectionTitle } from "./bits";

export function Cart() {
  usePageTitle("Cart");
  const c = useConsultant()!;
  const db = useDb();
  const cart = useCart();
  const navigate = useNavigate();
  const pay = db.settings.payments;
  const methods = (
    [
      pay.card && { id: "card", title: "Card", body: "Credit or debit card, paid now", icon: CreditCard },
      pay.bankTransfer && { id: "bank_transfer", title: "Bank transfer", body: "Transfer to FemmeCare and upload the slip", icon: Landmark },
      pay.cod && { id: "cod", title: "Cash on delivery", body: "Pay the courier when it arrives", icon: Banknote },
    ] as const
  ).filter(Boolean) as { id: PaymentMethod; title: string; body: string; icon: typeof CreditCard }[];
  const [method, setMethod] = useState<PaymentMethod | undefined>(methods[0]?.id);
  const [other, setOther] = useState(false);
  const [addr, setAddr] = useState("");
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  const rows = cart.lines
    .map((l) => {
      const p = db.products.find((x) => x.id === l.productId && x.status === "active");
      return p ? { l, p, price: consultantPrice(db, p.mrp), ok: inStock(db, p.id) } : undefined;
    })
    .filter(Boolean) as { l: { productId: string; qty: number }; p: (typeof db.products)[number]; price: number; ok: boolean }[];

  if (!rows.length) {
    return (
      <div>
        <PageHeader title="Cart" />
        <EmptyState
          icon={<ShoppingBag className="size-5" />}
          title="Your cart is empty"
          description="Add packs from the shop. Your price and margin are shown on every product."
          action={
            <Button nativeButton={false} render={<Link to="/app/shop" />} className="rounded-full">
              Go to the shop
            </Button>
          }
        />
      </div>
    );
  }

  const subtotal = round2(rows.reduce((a, r) => a + r.l.qty * r.price, 0));
  const mrpValue = round2(rows.reduce((a, r) => a + r.l.qty * r.p.mrp, 0));
  const charge = deliveryCharge(db, subtotal);
  const total = round2(subtotal + charge);
  const freeOver = db.settings.delivery.freeOver;
  const toFree = round2(freeOver - subtotal);
  const blocked = rows.filter((r) => !r.ok);
  const addrError = other && tried && (!addr.trim() ? "Enter the delivery address" : !city.trim() ? "Enter the city" : undefined);

  const place = () => {
    setTried(true);
    if (blocked.length || !method) return;
    if (other && (!addr.trim() || !city.trim())) return;
    setBusy(true);
    window.setTimeout(() => {
      const id = act(
        actions.placeOrder({
          consultantId: c.id,
          lines: rows.map((r) => ({ productId: r.p.id, qty: r.l.qty })),
          address: other ? addr.trim() : c.address,
          city: other ? city.trim() : c.city,
          method,
        }),
      );
      setBusy(false);
      if (!id) return;
      cart.clear();
      navigate(method === "cod" ? `/app/orders/${id}?placed=1` : `/app/orders/${id}/pay`, { replace: true });
    }, 500);
  };

  return (
    <div>
      <PageHeader title="Cart" description={`${cart.count} pack${cart.count === 1 ? "" : "s"}`} back={{ to: "/app/shop", label: "Keep shopping" }} />

      <div className="grid gap-2">
        {rows.map((r) => (
          <Card key={r.p.id} className={cn("flex gap-3 p-3", !r.ok && "ring-destructive/40")}>
            <ProductPack product={r.p} className="size-16 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{r.p.name}</div>
                  <div className="text-xs text-muted-foreground tabular">{lkr(r.price)} each</div>
                </div>
                <button onClick={() => cart.remove(r.p.id)} className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive" aria-label={`Remove ${r.p.name}`}>
                  <Trash2 className="size-4" />
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <QtyStepper value={r.l.qty} onChange={(n) => cart.setQty(r.p.id, n)} size="sm" label={r.p.name} />
                <span className="text-sm font-semibold tabular">{lkr(round2(r.l.qty * r.price))}</span>
              </div>
              {!r.ok && <p className="mt-1.5 text-xs text-destructive">Out of stock now. Remove it to continue.</p>}
            </div>
          </Card>
        ))}
      </div>

      {/* free delivery nudge */}
      <Card className="mt-3 bg-brand-soft/50 ring-primary/10">
        <div className="flex items-center gap-2 text-sm">
          <Truck className="size-4 text-primary" />
          {charge === 0 ? <span className="font-medium">Free delivery on this order</span> : <span>Add {lkr(toFree)} more for free delivery</span>}
        </div>
        <ProgressBar value={subtotal} max={freeOver} tone={charge === 0 ? "success" : "brand"} className="mt-2" />
      </Card>

      <SectionTitle>Deliver to</SectionTitle>
      <div className="grid gap-2">
        <AddrChoice active={!other} onClick={() => setOther(false)} title="My registered address" body={addressLine(c.address, c.city)} />
        <AddrChoice active={other} onClick={() => setOther(true)} title="Somewhere else" body="A different address for this order" />
        {other && (
          <Card className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="addr">Address</Label>
              <Textarea id="addr" rows={2} value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="House number, street" aria-invalid={!!addrError && !addr.trim()} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="city">City</Label>
              <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} className="h-10" aria-invalid={!!addrError && !city.trim()} />
            </div>
            {addrError && <p className="text-xs text-destructive">{addrError}</p>}
          </Card>
        )}
      </div>

      <SectionTitle>Pay by</SectionTitle>
      {methods.length ? (
        <div className="grid gap-2" role="radiogroup" aria-label="Payment method">
          {methods.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={method === m.id}
              onClick={() => setMethod(m.id)}
              className={cn("flex items-center gap-3 rounded-2xl border bg-card p-3.5 text-left transition", method === m.id ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/40")}
            >
              <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", method === m.id ? "bg-brand-soft text-primary" : "bg-muted text-muted-foreground")}>
                <m.icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{m.title}</span>
                <span className="block text-xs text-muted-foreground">{m.body}</span>
              </span>
              <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border-2", method === m.id ? "border-primary" : "border-muted-foreground/40")}>
                {method === m.id && <span className="size-2.5 rounded-full bg-primary" />}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <Card className="text-sm text-muted-foreground">Online payment is not available right now. Call FemmeCare on {db.settings.company.phone} to order.</Card>
      )}

      <SectionTitle>Summary</SectionTitle>
      <Card>
        <dl className="grid gap-2 text-sm">
          <Line k="Subtotal, at your price" v={lkr(subtotal)} />
          <Line k="Delivery" v={charge === 0 ? "Free" : lkr(charge)} />
          <div className="my-1 border-t border-border" />
          <Line k={<span className="font-semibold">Total to pay</span>} v={<span className="font-display text-xl font-semibold">{lkr(total)}</span>} />
          <Line k={<span className="text-success">Your margin when sold at MRP</span>} v={<span className="text-success">{lkr(round2(mrpValue - subtotal))}</span>} />
        </dl>
      </Card>

      {tried && blocked.length > 0 && <p className="mt-3 text-sm text-destructive">Remove the out-of-stock items to place this order.</p>}
      <Button className="mt-4 h-12 w-full rounded-full text-base" onClick={place} disabled={busy || !methods.length}>
        {busy && <Loader2 className="size-4 animate-spin" />}
        {method === "cod" ? `Place order, pay ${lkr(total)} on delivery` : `Place order and pay ${lkr(total)}`}
      </Button>
      <p className="mt-2 flex items-center justify-center gap-1 text-center text-xs text-muted-foreground">
        <MapPin className="size-3.5" /> Orders are packed once fully paid, usually the next working day.
      </p>
    </div>
  );
}

function AddrChoice({ active, onClick, title, body }: { active: boolean; onClick: () => void; title: string; body: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn("flex items-start gap-3 rounded-2xl border bg-card p-3.5 text-left transition", active ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/40")}
    >
      <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2", active ? "border-primary" : "border-muted-foreground/40")}>
        {active && <span className="size-2.5 rounded-full bg-primary" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground">{body}</span>
      </span>
    </button>
  );
}

function Line({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-medium tabular">{v}</dd>
    </div>
  );
}
