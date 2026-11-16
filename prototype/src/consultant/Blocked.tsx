// /app/blocked for suspended (or closed) accounts: why, what it means, whom to call.
// Also the app's own page-not-found.

import { Link, Navigate, useNavigate } from "react-router";
import { LogOut, Mail, PauseCircle, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/fc/brand";
import { useDb } from "@/domain/db";
import { fullName } from "@/domain/consultants";
import { consultantCode, date } from "@/domain/format";
import { labels, lastStatusReason } from "@/domain/ext/consultant-app";
import { useConsultant } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { signOut } from "./shell";

export function Blocked() {
  const c = useConsultant();
  const db = useDb();
  const navigate = useNavigate();
  const L = labels(db);
  usePageTitle("Account on hold");
  if (!c) return <Navigate to="/signin" replace />;
  if (c.status === "active") return <Navigate to="/app" replace />;
  const closed = c.status === "terminated";
  const reason = lastStatusReason(c);
  const since = [...c.statusHistory].reverse().find((h) => h.to === c.status)?.ts;
  const co = db.settings.company;
  return (
    <div className="flex min-h-svh flex-col items-center bg-blush px-4 py-10">
      <Logo tagline />
      <div className="animate-rise mt-10 w-full max-w-md rounded-3xl bg-card p-6 shadow-lift ring-1 ring-inset ring-border/60 sm:p-8">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-warning-soft text-warning">
          <PauseCircle className="size-7" />
        </div>
        <h1 className="mt-5 font-display text-2xl font-semibold">{closed ? "Your account is closed" : "Your account is on hold"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {fullName(c)}, {consultantCode(c.number)}
          {since && `, since ${date(since)}`}
        </p>
        {reason && (
          <div className="mt-5 rounded-2xl bg-muted/60 p-4 text-sm">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Reason</div>
            <div className="mt-1">{reason}</div>
          </div>
        )}
        <ul className="mt-5 grid gap-2 text-sm text-muted-foreground">
          {closed ? (
            <>
              <li>You can no longer place orders or earn commission.</li>
              <li>Any commission already approved is still paid to your bank account.</li>
            </>
          ) : (
            <>
              <li>You can't place new orders or earn commission while your account is on hold.</li>
              <li>Orders you have already paid for are still delivered.</li>
              <li>Your team stays with you. Their sales count again once your account is active.</li>
            </>
          )}
        </ul>
        <div className="mt-6 rounded-2xl bg-brand-soft/60 p-4 text-sm">
          <div className="font-semibold">Talk to the FemmeCare {L.lower} team</div>
          <div className="mt-1 text-muted-foreground">Monday to Friday, 8.30 am to 5.00 pm</div>
          <div className="mt-3 grid gap-2">
            <Button nativeButton={false} render={<a href={`tel:${co.phone.replace(/\s/g, "")}`} />} className="h-11 rounded-full">
              <Phone className="size-4" /> Call {co.phone}
            </Button>
            <Button variant="outline" nativeButton={false} render={<a href={`mailto:${co.email}?subject=${encodeURIComponent(`Account ${consultantCode(c.number)}`)}`} />} className="h-11 rounded-full bg-card">
              <Mail className="size-4" /> Email {co.email}
            </Button>
          </div>
        </div>
        <Button variant="ghost" className="mt-4 h-11 w-full rounded-full" onClick={() => signOut(navigate)}>
          <LogOut className="size-4" /> Sign out
        </Button>
      </div>
    </div>
  );
}

export function AppNotFound() {
  usePageTitle("Page not found");
  return (
    <div className="flex flex-col items-center py-20 text-center">
      <h1 className="font-display text-2xl font-semibold">We can't find that page</h1>
      <p className="mt-2 max-w-xs text-sm text-muted-foreground">It may have moved, or the link is old.</p>
      <Button nativeButton={false} render={<Link to="/app" />} className="mt-6 h-11 rounded-full px-6">
        Back to home
      </Button>
    </div>
  );
}
