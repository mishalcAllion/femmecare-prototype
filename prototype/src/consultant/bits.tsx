// Small pieces shared by the consultant app screens.

import { useState, type ReactNode } from "react";
import { Check, Copy, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Status } from "@/components/fc/ui";
import { DELIVERY_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "@/domain/consultants";
import type { ConsultantOrder } from "@/domain/types";
import type { Result } from "@/domain/actions";
import { act } from "@/lib/fc";

export function Card({ className, children, as: As = "div" }: { className?: string; children: ReactNode; as?: "div" | "section" }) {
  return <As className={cn("rounded-2xl bg-card p-4 shadow-soft ring-1 ring-inset ring-border/60", className)}>{children}</As>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2.5 mt-7 flex items-center justify-between gap-3 first:mt-0">
      <h2 className="text-[0.95rem] font-semibold">{children}</h2>
      {action}
    </div>
  );
}

export function QtyStepper({ value, onChange, disabled, size = "md", label }: { value: number; onChange: (n: number) => void; disabled?: boolean; size?: "sm" | "md"; label: string }) {
  const btn = size === "sm" ? "size-8" : "size-10";
  return (
    <div className={cn("inline-flex items-center rounded-full bg-muted p-0.5", disabled && "opacity-50")}>
      <button type="button" className={cn("flex items-center justify-center rounded-full text-foreground transition hover:bg-background disabled:opacity-40", btn)} onClick={() => onChange(value - 1)} disabled={disabled || value <= 0} aria-label={`One less ${label}`}>
        <Minus className="size-4" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, "")) || 0)}
        onFocus={(e) => e.target.select()}
        className={cn("w-9 bg-transparent text-center font-semibold tabular outline-none", size === "sm" ? "text-sm" : "text-base")}
        aria-label={`Quantity of ${label}`}
      />
      <button type="button" className={cn("flex items-center justify-center rounded-full text-foreground transition hover:bg-background disabled:opacity-40", btn)} onClick={() => onChange(value + 1)} disabled={disabled} aria-label={`One more ${label}`}>
        <Plus className="size-4" />
      </button>
    </div>
  );
}

export function CopyButton({ value, label = "Copy", className }: { value: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={cn("inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground transition hover:bg-brand-soft hover:text-primary", className)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          /* clipboard blocked: still confirm, the text is on screen */
        }
        setDone(true);
        toast.success("Copied");
        window.setTimeout(() => setDone(false), 1600);
      }}
      aria-label={`${label}: ${value}`}
    >
      {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {done ? "Copied" : label}
    </button>
  );
}

export function OrderChips({ o }: { o: ConsultantOrder }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {(o.deliveryStatus !== "cancelled" || o.paymentStatus === "refunded") && <Status>{paymentLabel(o)}</Status>}
      <Status>{DELIVERY_STATUS_LABEL[o.deliveryStatus]}</Status>
    </div>
  );
}

/** Payment status words, with refund requests shown as they stand. */
export function paymentLabel(o: ConsultantOrder) {
  if (o.refund?.status === "requested") return "Refund requested";
  return PAYMENT_STATUS_LABEL[o.paymentStatus];
}

export function needsPayment(o: ConsultantOrder) {
  return o.deliveryStatus !== "cancelled" && (o.paymentStatus === "awaiting" || o.paymentStatus === "failed" || o.paymentStatus === "rejected");
}

export function itemCount(o: ConsultantOrder) {
  return o.lines.reduce((a, l) => a + l.qty, 0);
}

export const METHOD_LABEL: Record<ConsultantOrder["paymentMethod"], string> = {
  card: "Card",
  bank_transfer: "Bank transfer",
  cod: "Cash on delivery",
};

/** Run an action, show the toast or the error, and say whether it worked (act() can't for actions with no return value). */
export function done<T>(r: Result<T>, success?: string): boolean {
  act(r, success);
  return r.ok;
}

/** "0771234567" -> "077 123 4567" for display. */
export function phone(s?: string) {
  if (!s) return s;
  const d = s.replace(/\s/g, "");
  return /^0\d{9}$/.test(d) ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : s;
}
