// C4 Payment. Card: a FemmeCare checkout form (no gateway brand), processing,
// success or a declined card with retry. Bank transfer: FemmeCare's bank details
// with copy buttons, the order number as reference, upload a slip photo or pick a
// sample, then "Waiting for verification".

import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { Camera, CircleCheck, CircleX, Clock, CreditCard, ImageUp, Loader2, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BankSlipImage } from "@/components/fc/docs";
import { PageHeader } from "@/components/fc/ui";
import { useDb } from "@/domain/db";
import { actions } from "@/domain/actions";
import { fullName } from "@/domain/consultants";
import { dateTime, lkr, round2 } from "@/domain/format";
import type { ConsultantOrder } from "@/domain/types";
import { useConsultant, useNow } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { cn } from "@/lib/utils";
import { Card, CopyButton, done } from "./bits";
import { AppNotFound } from "./Blocked";

export function Pay() {
  const { id } = useParams();
  const db = useDb();
  const c = useConsultant()!;
  const o = db.consultantOrders.find((x) => x.id === id && x.consultantId === c.id);
  usePageTitle(o ? `Pay for ${o.id}` : "Payment");
  if (!o) return <AppNotFound />;
  if (o.deliveryStatus === "cancelled")
    return (
      <div>
        <PageHeader title="Payment" back={{ to: `/app/orders/${o.id}`, label: o.id }} />
        <Card className="text-sm text-muted-foreground">This order was cancelled, so there is nothing to pay.</Card>
      </div>
    );
  return (
    <div>
      <PageHeader title={o.paymentMethod === "card" ? "Pay by card" : o.paymentMethod === "bank_transfer" ? "Pay by bank transfer" : "Cash on delivery"} back={{ to: `/app/orders/${o.id}`, label: o.id }} />
      {o.paymentMethod === "card" ? <CardPay o={o} /> : o.paymentMethod === "bank_transfer" ? <BankPay o={o} /> : <CodNote o={o} />}
    </div>
  );
}

function AmountHeader({ o }: { o: ConsultantOrder }) {
  return (
    <div className="rounded-2xl bg-card p-4 shadow-soft ring-1 ring-inset ring-border/60">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground">Pay FemmeCare (Pvt) Ltd</div>
          <div className="font-display text-2xl font-semibold tabular">{lkr(o.total)}</div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          Order
          <div className="font-medium text-foreground">{o.id}</div>
        </div>
      </div>
    </div>
  );
}

// ---------- card ----------

function luhn(num: string) {
  let sum = 0;
  let dbl = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let d = Number(num[i]);
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

function network(num: string) {
  if (/^4/.test(num)) return "VISA";
  if (/^(5[1-5]|2[2-7])/.test(num)) return "Mastercard";
  if (/^3[47]/.test(num)) return "Amex";
  return "";
}

type CardState = "form" | "processing" | "success" | "failed" | "already";

function CardPay({ o }: { o: ConsultantOrder }) {
  const c = useConsultant()!;
  const now = useNow();
  const [state, setState] = useState<CardState>(o.paymentStatus === "paid" ? "already" : "form");
  const [num, setNum] = useState("");
  const [name, setName] = useState(fullName(c).toUpperCase());
  const [exp, setExp] = useState("");
  const [cvv, setCvv] = useState("");
  const [tried, setTried] = useState(false);
  const [failMsg, setFailMsg] = useState("");
  const digits = num.replace(/\D/g, "");
  const net = network(digits);
  const yy = Number(now.slice(2, 4));
  const mm = Number(now.slice(5, 7));
  const [em, ey] = exp.split("/").map((x) => Number(x));
  const errors = {
    num: digits.length < 13 || digits.length > 19 || !luhn(digits) ? "Check the card number" : "",
    name: !name.trim() ? "Enter the name on the card" : "",
    exp: !/^\d{2}\/\d{2}$/.test(exp) || em < 1 || em > 12 ? "Use MM/YY" : ey < yy || (ey === yy && em < mm) ? "This card has expired" : "",
    cvv: !/^\d{3,4}$/.test(cvv) ? "3 or 4 digits on the back" : "",
  };
  const valid = !Object.values(errors).some(Boolean);
  const paid = o.payments.filter((p) => p.method === "card" && p.status === "success").slice(-1)[0];

  const submit = () => {
    setTried(true);
    if (!valid) return;
    setState("processing");
    window.setTimeout(() => {
      const r = actions.payByCard(o.id, digits.slice(-4));
      if (!r.ok) {
        setFailMsg(r.error);
        setState("failed");
        return;
      }
      if (r.value.ok) setState("success");
      else if (/already paid/i.test(r.value.message)) setState("already");
      else {
        setFailMsg(r.value.message);
        setState("failed");
      }
    }, 2200);
  };

  if (state === "processing")
    return (
      <div className="flex flex-col items-center rounded-3xl bg-card px-6 py-14 text-center shadow-soft ring-1 ring-inset ring-border/60">
        <div className="relative flex size-16 items-center justify-center">
          <Loader2 className="absolute size-16 animate-spin text-primary/30" strokeWidth={1.2} />
          <Lock className="size-6 text-primary" />
        </div>
        <div className="mt-5 font-semibold">Contacting your bank</div>
        <p className="mt-1 text-sm text-muted-foreground">Paying {lkr(o.total)}. Please don't close this page.</p>
      </div>
    );

  if (state === "success" || state === "already")
    return (
      <div className="flex flex-col items-center rounded-3xl bg-card px-6 py-10 text-center shadow-soft ring-1 ring-inset ring-border/60">
        <div className="animate-pop flex size-20 items-center justify-center rounded-full bg-success-soft text-success">
          <CircleCheck className="size-11" />
        </div>
        <div className="mt-5 font-display text-2xl font-semibold">{state === "success" ? "Payment successful" : "This order is already paid"}</div>
        <p className="mt-1 text-sm text-muted-foreground">
          {state === "success" ? `${lkr(o.total)} paid for ${o.id}. We'll pack it next and text you when it's on its way.` : "No second payment was taken."}
        </p>
        {paid && (
          <div className="mt-5 w-full rounded-2xl bg-muted/60 p-3 text-left text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Card</span>
              <span className="font-medium">•••• {paid.reference.split("-")[1]}</span>
            </div>
            <div className="mt-1 flex justify-between gap-3">
              <span className="text-muted-foreground">Reference</span>
              <span className="font-mono text-xs font-medium">{paid.reference}</span>
            </div>
            <div className="mt-1 flex justify-between gap-3">
              <span className="text-muted-foreground">Paid</span>
              <span className="font-medium">{dateTime(paid.ts)}</span>
            </div>
          </div>
        )}
        <div className="mt-6 grid w-full gap-2">
          <Button nativeButton={false} render={<Link to={`/app/orders/${o.id}`} />} className="h-11 rounded-full">
            View order
          </Button>
          <Button variant="outline" nativeButton={false} render={<Link to={`/app/orders/${o.id}/receipt`} />} className="h-11 rounded-full">
            Receipt
          </Button>
        </div>
      </div>
    );

  if (state === "failed")
    return (
      <div className="flex flex-col items-center rounded-3xl bg-card px-6 py-10 text-center shadow-soft ring-1 ring-inset ring-border/60">
        <div className="animate-pop flex size-20 items-center justify-center rounded-full bg-danger-soft text-destructive">
          <CircleX className="size-11" />
        </div>
        <div className="mt-5 font-display text-2xl font-semibold">Payment declined</div>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">{/declined/i.test(failMsg) ? "Your bank declined the payment. No money was taken." : failMsg}</p>
        <p className="mt-1 text-xs text-muted-foreground">Check the card details, or try another card. Your order is saved.</p>
        <div className="mt-6 grid w-full gap-2">
          <Button
            className="h-11 rounded-full"
            onClick={() => {
              setCvv("");
              setTried(false);
              setState("form");
            }}
          >
            Try again
          </Button>
          <Button
            variant="outline"
            className="h-11 rounded-full"
            onClick={() => {
              setNum("");
              setExp("");
              setCvv("");
              setTried(false);
              setState("form");
            }}
          >
            Use another card
          </Button>
        </div>
      </div>
    );

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-4"
    >
      <AmountHeader o={o} />
      {o.paymentStatus === "failed" && (
        <div className="flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-3 text-sm text-destructive">
          <CircleX className="mt-0.5 size-4 shrink-0" /> Your last attempt was declined. No money was taken. You can try again.
        </div>
      )}
      {/* card preview */}
      <div className="relative aspect-[1.7] w-full overflow-hidden rounded-2xl bg-[linear-gradient(135deg,oklch(0.36_0.07_350),oklch(0.24_0.05_330))] p-5 text-white shadow-lift sm:max-w-sm">
        <div className="absolute -right-10 -top-16 size-48 rounded-full bg-white/10" />
        <div className="absolute -bottom-20 -left-6 size-48 rounded-full bg-white/5" />
        <div className="relative flex h-full flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="h-7 w-10 rounded-md bg-[linear-gradient(135deg,#f4d58d,#c9a24a)]" />
            <span className="text-sm font-semibold italic tracking-wide">{net}</span>
          </div>
          <div className="font-mono text-lg tracking-[0.14em] tabular sm:text-xl">{(digits.padEnd(16, "•").match(/.{1,4}/g) ?? []).join(" ")}</div>
          <div className="flex items-end justify-between gap-3 text-xs">
            <div className="min-w-0">
              <div className="text-white/60">Card holder</div>
              <div className="truncate font-medium uppercase">{name || "YOUR NAME"}</div>
            </div>
            <div className="text-right">
              <div className="text-white/60">Expires</div>
              <div className="font-medium tabular">{exp || "MM/YY"}</div>
            </div>
          </div>
        </div>
      </div>

      <Card className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="cc-num">Card number</Label>
          <div className="relative">
            <CreditCard className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="cc-num"
              inputMode="numeric"
              autoComplete="cc-number"
              value={num}
              onChange={(e) =>
                setNum(
                  e.target.value
                    .replace(/\D/g, "")
                    .slice(0, 19)
                    .replace(/(\d{4})(?=\d)/g, "$1 "),
                )
              }
              placeholder="1234 5678 9012 3456"
              className="h-12 pl-9 font-mono tracking-wider"
              aria-invalid={tried && !!errors.num}
            />
            {net && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold italic text-muted-foreground">{net}</span>}
          </div>
          {tried && errors.num && <p className="text-xs text-destructive">{errors.num}</p>}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cc-name">Name on card</Label>
          <Input id="cc-name" autoComplete="cc-name" value={name} onChange={(e) => setName(e.target.value.toUpperCase())} className="h-12 uppercase" aria-invalid={tried && !!errors.name} />
          {tried && errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="cc-exp">Expiry</Label>
            <Input
              id="cc-exp"
              inputMode="numeric"
              autoComplete="cc-exp"
              value={exp}
              onChange={(e) => {
                const d = e.target.value.replace(/\D/g, "").slice(0, 4);
                setExp(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
              }}
              placeholder="MM/YY"
              className="h-12 tabular"
              aria-invalid={tried && !!errors.exp}
            />
            {tried && errors.exp && <p className="text-xs text-destructive">{errors.exp}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cc-cvv">Security code</Label>
            <Input id="cc-cvv" type="password" inputMode="numeric" autoComplete="cc-csc" value={cvv} onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="CVV" className="h-12 tabular" aria-invalid={tried && !!errors.cvv} />
            {tried && errors.cvv && <p className="text-xs text-destructive">{errors.cvv}</p>}
          </div>
        </div>
      </Card>

      <Button type="submit" className="h-12 w-full rounded-full text-base">
        <Lock className="size-4" /> Pay {lkr(o.total)}
      </Button>
      <div className="flex items-start gap-2 rounded-xl bg-muted/60 px-3.5 py-3 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
        <span>
          <span className="font-medium text-foreground">Secure payment.</span> Your card details are encrypted and go straight to the bank. FemmeCare never stores your card number.
        </span>
      </div>
    </form>
  );
}

// ---------- bank transfer ----------

const SAMPLES = ["slip-1", "slip-2", "slip-3"] as const;

async function shrinkImage(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = dataUrl;
    });
    const scale = Math.min(1, 1000 / Math.max(img.width, img.height));
    const cv = document.createElement("canvas");
    cv.width = Math.round(img.width * scale);
    cv.height = Math.round(img.height * scale);
    cv.getContext("2d")?.drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL("image/jpeg", 0.78);
  } catch {
    return dataUrl;
  }
}

export function SlipPreview({ image, amount, reference, payer, when, className }: { image?: string; amount: number; reference: string; payer: string; when: string; className?: string }) {
  if (image?.startsWith("data:")) return <img src={image} alt="Bank slip" className={cn("max-h-80 w-full rounded-xl object-contain shadow-soft", className)} />;
  return <BankSlipImage variant={image ?? "slip-1"} amount={amount} reference={reference} payer={payer} when={when} className={className} />;
}

function BankPay({ o }: { o: ConsultantOrder }) {
  const db = useDb();
  const c = useConsultant()!;
  const now = useNow();
  const p = db.settings.payments;
  const fileRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<string>();
  const [amount, setAmount] = useState(o.total.toFixed(2));
  const [reference, setReference] = useState(o.id);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const last = o.payments.filter((x) => x.method === "bank_transfer").slice(-1)[0];
  useEffect(() => {
    if (o.paymentStatus === "rejected") setReference(o.id);
  }, [o.paymentStatus, o.id]);

  if (o.paymentStatus === "paid")
    return (
      <Card className="flex flex-col items-center py-10 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-success-soft text-success">
          <CircleCheck className="size-9" />
        </div>
        <div className="mt-4 font-display text-xl font-semibold">Payment verified</div>
        <p className="mt-1 text-sm text-muted-foreground">Your transfer for {o.id} is confirmed. No further payment is needed.</p>
        <Button nativeButton={false} render={<Link to={`/app/orders/${o.id}`} />} className="mt-5 h-11 rounded-full px-6">
          View order
        </Button>
      </Card>
    );

  if (o.paymentStatus === "proof_uploaded" && last)
    return (
      <div className="space-y-4">
        <Card className="flex flex-col items-center py-8 text-center">
          <div className={cn("flex size-16 items-center justify-center rounded-full bg-warning-soft text-warning", justSent && "animate-pop")}>
            <Clock className="size-8" />
          </div>
          <div className="mt-4 font-display text-xl font-semibold">Waiting for verification</div>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">We have your slip. FemmeCare checks it against the bank, usually within one working day, and texts you when it's confirmed.</p>
        </Card>
        <Card>
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="font-semibold">Your slip</span>
            <span className="text-xs text-muted-foreground">Sent {dateTime(last.ts)}</span>
          </div>
          <SlipPreview image={last.proofImage} amount={last.amount} reference={last.reference} payer={fullName(c)} when={last.ts} />
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Amount</dt>
              <dd className="font-medium tabular">{lkr(last.amount)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Reference</dt>
              <dd className="font-medium">{last.reference}</dd>
            </div>
          </dl>
        </Card>
        <Button variant="outline" nativeButton={false} render={<Link to={`/app/orders/${o.id}`} />} className="h-11 w-full rounded-full">
          Back to the order
        </Button>
      </div>
    );

  const amt = Number(amount);
  const amtError = !amount || Number.isNaN(amt) || amt <= 0 ? "Enter the amount on the slip" : "";
  const refError = !reference.trim() ? "Enter the reference on the slip" : "";
  const short = !amtError && amt < o.total ? round2(o.total - amt) : 0;

  const send = () => {
    setTried(true);
    if (!image || amtError || refError) return;
    setBusy(true);
    window.setTimeout(() => {
      const ok = done(actions.uploadProof(o.id, { amount: amt, reference: reference.trim(), proofImage: image }), "Slip sent for verification");
      setBusy(false);
      if (ok) setJustSent(true);
    }, 700);
  };

  return (
    <div className="space-y-4">
      <AmountHeader o={o} />
      {o.paymentStatus === "rejected" && last?.rejectReason && (
        <div className="rounded-xl bg-danger-soft px-3.5 py-3 text-sm">
          <div className="font-medium text-destructive">Your last slip was not accepted</div>
          <div className="mt-0.5 text-muted-foreground">Reason: {last.rejectReason}. Please upload the slip again.</div>
        </div>
      )}

      <Card>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">1</span> Transfer {lkr(o.total)} to
        </div>
        <dl className="mt-3 divide-y divide-border rounded-xl bg-muted/50 text-sm">
          {[
            ["Account name", p.bankAccountName],
            ["Bank", p.bankName],
            ["Branch", p.bankBranch],
            ["Account number", p.bankAccountNumber],
            ["Amount", o.total.toFixed(2)],
            ["Reference", o.id],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className={cn("truncate font-medium", (k === "Account number" || k === "Reference" || k === "Amount") && "font-mono tabular")}>{k === "Amount" ? lkr(o.total) : v}</dd>
              </div>
              {k !== "Branch" && <CopyButton value={k === "Account number" ? v.replace(/\s/g, "") : v} />}
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">Use the order number {o.id} as the reference, so we can match your payment quickly.</p>
      </Card>

      <Card>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">2</span> Add a photo of your slip
        </div>
        {image ? (
          <div className="mt-3 space-y-2">
            <SlipPreview image={image} amount={Number.isNaN(amt) ? o.total : amt} reference={reference || o.id} payer={fullName(c)} when={now} />
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => setImage(undefined)}>
              Choose a different photo
            </Button>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className={cn("flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-7 text-center transition hover:border-primary/50 hover:bg-brand-soft/40", tried && !image ? "border-destructive/50" : "border-border")}
            >
              <span className="flex size-11 items-center justify-center rounded-2xl bg-brand-soft text-primary">
                <Camera className="size-5" />
              </span>
              <span className="text-sm font-medium">Take a photo or choose one</span>
              <span className="text-xs text-muted-foreground">A clear photo of the bank slip or the transfer receipt</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setImage(await shrinkImage(f));
                e.target.value = "";
              }}
            />
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <ImageUp className="size-3.5" /> Or use a recent receipt from your banking app
              </div>
              <div className="grid grid-cols-3 gap-2">
                {SAMPLES.map((s) => (
                  <button key={s} type="button" onClick={() => setImage(s)} className="overflow-hidden rounded-xl ring-1 ring-border transition hover:ring-2 hover:ring-primary" aria-label={`Use receipt ${s.slice(-1)}`}>
                    <BankSlipImage variant={s} amount={o.total} reference={o.id} payer={fullName(c)} when={now} className="rounded-none shadow-none" />
                  </button>
                ))}
              </div>
            </div>
            {tried && !image && <p className="text-xs text-destructive">Add a photo of your slip</p>}
          </div>
        )}
      </Card>

      <Card>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">3</span> Check what the slip says
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="slip-amt">Amount paid (LKR)</Label>
            <Input id="slip-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} className="h-11 tabular" aria-invalid={tried && !!amtError} />
            {tried && amtError && <p className="text-xs text-destructive">{amtError}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="slip-ref">Reference on the slip</Label>
            <Input id="slip-ref" value={reference} onChange={(e) => setReference(e.target.value)} className="h-11" aria-invalid={tried && !!refError} />
            {tried && refError && <p className="text-xs text-destructive">{refError}</p>}
          </div>
        </div>
        {short > 0 && <p className="mt-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-[oklch(0.42_0.1_65)]">This is {lkr(short)} less than the order total. FemmeCare may ask you to pay the difference before packing.</p>}
      </Card>

      <Button className="h-12 w-full rounded-full text-base" onClick={send} disabled={busy}>
        {busy && <Loader2 className="size-4 animate-spin" />} Send slip for verification
      </Button>
    </div>
  );
}

function CodNote({ o }: { o: ConsultantOrder }) {
  return (
    <Card className="text-sm">
      <div className="font-semibold">Pay {lkr(o.total)} when your order arrives</div>
      <p className="mt-1 text-muted-foreground">Have the exact amount ready for the courier. We'll text you when it's on its way.</p>
      <Button nativeButton={false} render={<Link to={`/app/orders/${o.id}`} />} className="mt-4 h-11 w-full rounded-full">
        View order
      </Button>
    </Card>
  );
}
