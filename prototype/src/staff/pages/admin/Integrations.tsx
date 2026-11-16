// L4 Integrations (later phase): connections to banks, couriers, SMS and card payments.

import type { ReactNode } from "react";
import { Banknote, CreditCard, MessageSquare, Truck } from "lucide-react";
import { useDb } from "@/domain/db";
import { usePageTitle } from "@/lib/title";
import { useReviewNotes } from "@/lib/fc";
import { Guard, NotFound } from "@/staff/guard";
import { PageHeader, StatusBadge, type Tone } from "@/components/fc/ui";
import { Button } from "@/components/ui/button";
import { LaterTag } from "../inventory/shared";

export function IntegrationsPage() {
  const db = useDb();
  if (db.meta.phaseLens !== "everything") return <NotFound />;
  return (
    <Guard perms={["settings.view"]}>
      <Integrations />
    </Guard>
  );
}

function Integrations() {
  usePageTitle("Integrations");
  const db = useDb();
  const label = db.settings.labels.consultant.toLowerCase();
  const notes = useReviewNotes();
  const cards: { icon: ReactNode; name: string; status: string; tone: Tone; now: string; later: string; decision?: string }[] = [
    {
      icon: <Banknote className="size-5" />,
      name: "Bank payouts",
      status: "Bank file",
      tone: "info",
      now: "Finance downloads a bank file for each payout batch, uploads it to online banking and records the results.",
      later: "Send approved payouts straight to the bank and receive paid or failed results automatically.",
      decision: "A7",
    },
    {
      icon: <Truck className="size-5" />,
      name: "Courier tracking",
      status: "Entered by hand",
      tone: "info",
      now: `Operations type the tracking number at handover; the ${label} gets the courier's own SMS and a tracking link.`,
      later: "Import delivery events from the courier so orders move to Out for delivery and Delivered on their own.",
      decision: "A10",
    },
    {
      icon: <MessageSquare className="size-5" />,
      name: "SMS gateway",
      status: "Basic sending",
      tone: "info",
      now: "Order, payment and dispatch messages go out by email and SMS for each event, without delivery reports.",
      later: "Connect a local SMS gateway with FemmeCare as the sender name, delivery reports and retries.",
    },
    {
      icon: <CreditCard className="size-5" />,
      name: "Card payments",
      status: "FemmeCare checkout",
      tone: "success",
      now: `${db.settings.labels.consultant}s pay on FemmeCare's own checkout page.`,
      later: "Connect the payment provider FemmeCare already uses, with refunds back to the card.",
      decision: "A6",
    },
  ];
  return (
    <div className="animate-rise">
      <PageHeader
        title={
          <>
            Integrations
            <LaterTag />
          </>
        }
        description="Connections to outside services. Each works by hand in the first release; these connections come later."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {cards.map((c) => (
          <div key={c.name} className="flex flex-col rounded-2xl border border-border/70 bg-card p-5 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-xl bg-brand-soft text-primary">{c.icon}</div>
                <div>
                  <div className="font-medium">{c.name}</div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <StatusBadge tone={c.tone}>{c.status}</StatusBadge>
                    {notes && c.decision && <span className="font-mono text-[0.65rem] text-muted-foreground">{c.decision}</span>}
                  </div>
                </div>
              </div>
              <LaterTag />
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <p>
                <span className="font-medium">Today: </span>
                <span className="text-muted-foreground">{c.now}</span>
              </p>
              <p>
                <span className="font-medium">Later: </span>
                <span className="text-muted-foreground">{c.later}</span>
              </p>
            </div>
            <div className="mt-auto pt-4">
              <Button variant="outline" size="sm" disabled>
                Connect
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
