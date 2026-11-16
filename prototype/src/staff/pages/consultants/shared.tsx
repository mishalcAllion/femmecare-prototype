// Small pieces shared by the consultant and finance screens.

import type { ReactNode } from "react";
import { Link } from "react-router";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { Avatar } from "@/components/fc/brand";
import { Status, StatusBadge } from "@/components/fc/ui";
import { useDb } from "@/domain/db";
import { fullName, PAYMENT_STATUS_LABEL, DELIVERY_STATUS_LABEL, STATUS_LABEL } from "@/domain/consultants";
import { consultantCode, maskTail } from "@/domain/format";
import type { Consultant, ConsultantOrder } from "@/domain/types";
import { cn } from "@/lib/utils";

/** The configured word for sellers: "Consultant" or "Agent". */
export function useLabel() {
  const db = useDb();
  const one = db.settings.labels.consultant;
  return { one, many: `${one}s`, lower: one.toLowerCase(), lowerMany: `${one.toLowerCase()}s` };
}

export function ConsultantCell({ c, link = true, sub }: { c?: Consultant; link?: boolean; sub?: ReactNode }) {
  if (!c) return <span className="text-muted-foreground">None</span>;
  const body = (
    <span className="flex min-w-0 items-center gap-2.5">
      <Avatar name={fullName(c)} hue={c.avatarHue} size="sm" />
      <span className="min-w-0">
        <span className="block truncate font-medium">{fullName(c)}</span>
        <span className="block text-xs text-muted-foreground tabular">{sub ?? consultantCode(c.number)}</span>
      </span>
    </span>
  );
  if (!link || c.number === undefined) return body;
  return (
    <Link to={`/staff/consultants/${c.id}`} className="hover:text-primary" onClick={(e) => e.stopPropagation()}>
      {body}
    </Link>
  );
}

export function ConsultantStatus({ c }: { c: Consultant }) {
  return <Status>{STATUS_LABEL[c.status]}</Status>;
}

export function PaymentStatus({ o }: { o: ConsultantOrder }) {
  return <Status>{PAYMENT_STATUS_LABEL[o.paymentStatus]}</Status>;
}

export function DeliveryStatus({ o }: { o: ConsultantOrder }) {
  return <Status>{DELIVERY_STATUS_LABEL[o.deliveryStatus]}</Status>;
}

export const METHOD_LABEL: Record<ConsultantOrder["paymentMethod"], string> = {
  card: "Card",
  bank_transfer: "Bank transfer",
  cod: "Cash on delivery",
};

export function maskedAccount(n?: string) {
  return n ? maskTail(n, 4) : "";
}

/** A tick, warning or cross with a line of text, used for automatic checks. */
export function CheckRow({ state, children, detail }: { state: "ok" | "warn" | "fail"; children: ReactNode; detail?: ReactNode }) {
  const Icon = state === "ok" ? CheckCircle2 : state === "warn" ? AlertTriangle : XCircle;
  return (
    <li className="flex items-start gap-2.5 py-2">
      <Icon className={cn("mt-0.5 size-4.5 shrink-0", state === "ok" ? "text-success" : state === "warn" ? "text-warning" : "text-destructive")} />
      <div className="min-w-0 text-sm">
        <div className={cn(state !== "ok" && "font-medium")}>{children}</div>
        {detail && <div className="mt-0.5 text-xs text-muted-foreground">{detail}</div>}
      </div>
    </li>
  );
}

export function LaterTag() {
  return (
    <StatusBadge tone="plum" dot={false}>
      Coming later
    </StatusBadge>
  );
}

export function Money({ value, className }: { value: number; className?: string }) {
  return <span className={cn("tabular", value < 0 && "text-destructive", className)}>{value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>;
}
