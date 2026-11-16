// Small pieces shared by the inventory, dashboard and admin screens.

import type { ReactNode } from "react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/fc/ui";
import { ProductPack } from "@/components/fc/brand";
import type { Channel, Db } from "@/domain/types";
import { CHANNEL_LABEL } from "@/domain/stock";
import { useReviewNotes } from "@/lib/fc";

export function ChannelBadge({ channel }: { channel: Channel }) {
  return (
    <StatusBadge tone={channel === "outlet" ? "info" : "plum"} dot={false}>
      {CHANNEL_LABEL[channel]}
    </StatusBadge>
  );
}

/** Channel name using the Consultant/Agent label setting. */
export function channelName(db: Db, ch: Channel) {
  return ch === "outlet" ? "Retail outlets" : `${db.settings.labels.consultant}s`;
}

export function ProductCell({ db, id, link = true, sub }: { db: Db; id: string; link?: boolean; sub?: ReactNode }) {
  const p = db.products.find((x) => x.id === id);
  if (!p) return <span>{id}</span>;
  const body = (
    <span className="flex min-w-0 items-center gap-2.5">
      <ProductPack product={p} className="size-9 shrink-0" />
      <span className="min-w-0">
        <span className="block truncate font-medium">{p.name}</span>
        <span className="block text-xs text-muted-foreground">
          {p.id}
          {sub ? <> · {sub}</> : null}
        </span>
      </span>
    </span>
  );
  return link ? (
    <Link to={`/staff/products/${p.id}`} className="hover:text-primary">
      {body}
    </Link>
  ) : (
    body
  );
}

export function Field({ label, htmlFor, hint, error, children, className }: { label: string; htmlFor?: string; hint?: ReactNode; error?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-xs font-medium">
        {label}
      </Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Hides the console frame when printing a report, label sheet or recall list. */
export function PrintFrame() {
  return (
    <style>{`@media print {
  [data-slot="sidebar-gap"], [data-slot="sidebar-container"], [data-slot="sidebar-rail"] { display: none !important; }
  [data-slot="sidebar-inset"] main { max-width: none !important; padding: 0 !important; }
  .print-wide { overflow: visible !important; max-height: none !important; }
}`}</style>
  );
}

export function LaterTag() {
  return (
    <span className="ml-2 inline-flex items-center rounded-full bg-muted px-2 py-0.5 align-middle text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
      Coming later
    </span>
  );
}

export function DecisionTag({ id }: { id: string }) {
  const notes = useReviewNotes();
  if (!notes) return null;
  return (
    <span title={`Decision ${id}`} className="inline-flex items-center rounded-md bg-plum/10 px-1.5 py-0.5 font-mono text-[0.65rem] font-semibold text-plum ring-1 ring-inset ring-plum/20">
      {id}
    </span>
  );
}

export function daysLeftTone(days: number, warn: number) {
  if (days < 0) return "danger" as const;
  if (days <= warn) return "warning" as const;
  return "success" as const;
}
