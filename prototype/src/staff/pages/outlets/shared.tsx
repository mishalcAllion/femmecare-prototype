// Pieces shared by the retail outlet screens.

import { DateInput } from "@/components/fc/date-input";
import { useState, type ReactNode } from "react";
import { CalendarClock } from "lucide-react";
import { useDb } from "@/domain/db";
import { actions, type Result } from "@/domain/actions";
import { invoiceStatus } from "@/domain/outlets";
import { orderStatusLabel } from "@/domain/lists";
import { productName } from "@/domain/stock";
import type { Db, Invoice, Outlet, OutletOrder } from "@/domain/types";
import { date, dayKey, lkIso } from "@/domain/format";
import { act, useNow } from "@/lib/fc";
import { Status } from "@/components/fc/ui";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** Run an action, show the toast, and say whether it worked (also for actions with no value). */
export function done(r: Result<unknown>, success?: string): boolean {
  act(r, success);
  return r.ok;
}

/** Outlet order status in the words Selyn's staff use (New, Confirmed, Picking...). */
export function OrderStatusBadge({ order }: { order: OutletOrder }) {
  const db = useDb();
  return <Status>{orderStatusLabel(db, order)}</Status>;
}

export const OUTLET_STATUS_LABEL: Record<Outlet["status"], string> = { active: "Active", inactive: "Inactive", on_hold: "On Hold" };

/** Whether outlet payments are tracked in the system (decision B2). */
export function useTrackPayments() {
  return useDb().settings.outlets.trackPayments;
}

/** Invoice status as shown on screen. Without payment tracking only Issued or Cancelled make sense. */
export function shownInvoiceStatus(db: Db, inv: Invoice, now: string) {
  if (!db.settings.outlets.trackPayments) return inv.status === "cancelled" ? "Cancelled" : inv.status === "draft" ? "Draft" : "Issued";
  return invoiceStatus(db, inv, now);
}

export function Field({ label, hint, error, children, className, htmlFor }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Revise the expected date of a back-ordered balance, optionally emailing the outlet. */
export function ReviseDateDialog({
  open,
  onOpenChange,
  order,
  productId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  order: OutletOrder;
  productId: string;
}) {
  const db = useDb();
  const outlet = db.outlets.find((o) => o.id === order.outletId);
  const line = order.lines.find((l) => l.productId === productId);
  const [day, setDay] = useState(line?.expectedDate ? dayKey(line.expectedDate) : "");
  const [email, setEmail] = useState(!!outlet?.email);
  const today = dayKey(useNow());
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) {
          setDay(line?.expectedDate ? dayKey(line.expectedDate) : "");
          setEmail(!!outlet?.email);
        }
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Revise the expected date</DialogTitle>
          <DialogDescription>
            {line?.backordered} × {productName(db, productId)} still due to {outlet?.name} on PO {order.poNumber}.
            {line?.expectedDate ? ` Currently expected ${date(line.expectedDate)}.` : ""}
          </DialogDescription>
        </DialogHeader>
        <Field label="New expected date" htmlFor="exp-date">
          <DateInput id="exp-date" value={day} min={today} onChange={(e) => setDay(e.target.value)} />
        </Field>
        <label className={cn("flex items-start gap-2.5 text-sm", !outlet?.email && "opacity-60")}>
          <Checkbox checked={email} disabled={!outlet?.email} onCheckedChange={(v) => setEmail(!!v)} className="mt-0.5" />
          <span>
            Email the outlet
            <span className="block text-xs text-muted-foreground">
              {outlet?.email ? `Sends the new date to ${outlet.contactPerson} at ${outlet.email}` : "No email address on file. Call the outlet instead."}
            </span>
          </span>
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!day}
            onClick={() => {
              if (done(actions.setExpectedDate(order.id, productId, lkIso(day, "12:00"), email && !!outlet?.email), email && outlet?.email ? `New date saved and emailed to ${outlet.name}` : "New date saved"))
                onOpenChange(false);
            }}
          >
            <CalendarClock className="size-4" /> Save date
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** While printing, show only the A4 document. */
export function PrintOnlyDocument() {
  return (
    <style>{`
      @media print {
        body * { visibility: hidden !important; }
        .print-page, .print-page * { visibility: visible !important; }
        .print-page { position: absolute !important; left: 0; top: 0; width: 100% !important; max-width: none !important; padding: 0 !important; }
      }
    `}</style>
  );
}

const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function words999(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} hundred`);
  if (r) parts.push(r < 20 ? ONES[r] : `${TENS[Math.floor(r / 10)]}${r % 10 ? `-${ONES[r % 10]}` : ""}`);
  return parts.join(" and ");
}

/** "Sixty-six thousand five hundred rupees only", as printed on Sri Lankan invoices. */
export function amountInWords(n: number): string {
  const rupees = Math.floor(n);
  const cents = Math.round((n - rupees) * 100);
  const scales: [number, string][] = [
    [1_000_000_000, "billion"],
    [1_000_000, "million"],
    [1000, "thousand"],
  ];
  let left = rupees;
  const parts: string[] = [];
  for (const [v, w] of scales) {
    if (left >= v) {
      parts.push(`${words999(Math.floor(left / v))} ${w}`);
      left %= v;
    }
  }
  if (left) parts.push(words999(left));
  let s = parts.length ? parts.join(" ") : "zero";
  s = `${s} rupees`;
  if (cents) s += ` and ${words999(cents)} cents`;
  s += " only";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export { PAYMENT_TERMS, CUSTOMER_TYPES as OUTLET_TYPES, PAYMENT_METHODS, CUSTOMER_STATUSES } from "@/domain/lists";
export const DISTRICTS = [
  "Ampara", "Anuradhapura", "Badulla", "Batticaloa", "Colombo", "Galle", "Gampaha", "Hambantota", "Jaffna", "Kalutara",
  "Kandy", "Kegalle", "Kilinochchi", "Kurunegala", "Mannar", "Matale", "Matara", "Monaragala", "Mullaitivu", "Nuwara Eliya",
  "Polonnaruwa", "Puttalam", "Ratnapura", "Trincomalee", "Vavuniya",
];
