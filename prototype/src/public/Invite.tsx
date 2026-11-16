// W3 Invite landing at /r/:number: "Nimali Perera invited you to join FemmeCare".
// An unknown or inactive number gets a friendly message and a way to join anyway.

import { Link, useParams } from "react-router";
import { ArrowRight, Link2Off } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, HeartMark } from "@/components/fc/brand";
import { useDb } from "@/domain/db";
import { consultantByNumber, fullName, sponsorCheck } from "@/domain/consultants";
import { consultantCode, monthLabel, monthKey } from "@/domain/format";
import { labels, parseConsultantNumber } from "@/domain/ext/consultant-app";
import type { Consultant } from "@/domain/types";
import { usePageTitle } from "@/lib/title";
import { EarningWays, WorkedExample } from "./earn";

export function SponsorCard({ c, note, className }: { c: Consultant; note?: string; className?: string }) {
  const db = useDb();
  const L = labels(db);
  const no1 = c.number === 1;
  return (
    <div className={`flex items-center gap-4 rounded-2xl bg-card p-4 shadow-soft ring-1 ring-inset ring-border/60 ${className ?? ""}`}>
      {no1 ? (
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-brand-soft">
          <HeartMark className="size-9" />
        </span>
      ) : (
        <Avatar name={fullName(c)} hue={c.avatarHue} size="xl" className="size-14 text-base" />
      )}
      <div className="min-w-0">
        <div className="truncate text-lg font-semibold">{no1 ? "FemmeCare" : fullName(c)}</div>
        <div className="text-sm text-muted-foreground">
          {no1 ? "FemmeCare's own team (No. 1)" : `${consultantCode(c.number)} · FemmeCare ${L.lower} since ${monthLabel(monthKey(c.joinedAt ?? c.appliedAt))}`}
        </div>
        {note && <div className="mt-1 text-xs text-muted-foreground">{note}</div>}
      </div>
    </div>
  );
}

export function InviteLanding() {
  const { number } = useParams();
  const db = useDb();
  const L = labels(db);
  const n = parseConsultantNumber(number ?? "");
  const sponsor = n !== undefined ? consultantByNumber(db, n) : undefined;
  const check = n !== undefined ? sponsorCheck(db, n) : { ok: false };
  const valid = !!sponsor && check.ok && sponsor.number !== 1;
  usePageTitle(valid ? `${fullName(sponsor!)} invited you` : "Invitation");

  if (!valid) {
    return (
      <div className="animate-rise bg-blush px-4 py-16 sm:px-6 md:py-24">
        <div className="mx-auto max-w-lg rounded-3xl bg-card p-6 text-center shadow-lift ring-1 ring-inset ring-border/60 sm:p-10">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Link2Off className="size-6" />
          </div>
          <h1 className="mt-5 font-display text-2xl font-semibold">{sponsor ? "This invitation link is no longer active" : "We couldn't find this invitation"}</h1>
          <p className="mt-2 text-muted-foreground">
            {sponsor
              ? `The ${L.lower} who shared it can't introduce new ${L.manyLower} at the moment.`
              : "The link may have been mistyped."}{" "}
            You can still join: we'll place you in FemmeCare's own team, or you can enter another {L.lower}'s number on the form.
          </p>
          <div className="mt-6 grid gap-2 sm:flex sm:justify-center">
            <Button nativeButton={false} render={<Link to="/join?sponsor=none" />} className="h-11 rounded-full px-6">
              Join FemmeCare <ArrowRight className="size-4" />
            </Button>
            <Button variant="outline" nativeButton={false} render={<Link to="/join" />} className="h-11 rounded-full px-6">
              Enter a sponsor's number
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const s = sponsor!;
  return (
    <div className="animate-rise">
      <section className="bg-blush px-4 pb-14 pt-10 sm:px-6 md:pb-20 md:pt-16">
        <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[1.1fr_1fr] md:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-primary shadow-soft">
              <HeartMark className="size-4" /> Personal invitation
            </div>
            <h1 className="mt-5 font-display text-[2.2rem] font-semibold leading-[1.08] sm:text-5xl">
              {fullName(s)} invited you to join FemmeCare
            </h1>
            <p className="mt-4 max-w-lg text-muted-foreground sm:text-lg">
              Become {L.a}: sell everyday feminine care to people you know, earn on every pack, and grow a small team of your own with {s.givenName} as your sponsor.
            </p>
            <SponsorCard c={s} className="mt-6 max-w-md" note={`${s.givenName} will be your sponsor`} />
            <div className="mt-6 flex flex-wrap gap-3">
              <Button nativeButton={false} render={<Link to={`/join?ref=${s.number}`} />} className="h-12 rounded-full px-6 text-base">
                Start my application <ArrowRight className="size-4" />
              </Button>
              <Button variant="ghost" nativeButton={false} render={<Link to="/products" />} className="h-12 rounded-full px-5 text-base">
                See the products
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Takes about five minutes. Have your NIC and bank details ready.</p>
          </div>
          <WorkedExample />
        </div>
      </section>
      <section className="px-4 py-14 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-display text-2xl font-semibold md:text-3xl">How you earn</h2>
          <EarningWays className="mt-6" />
          <div className="mt-8 rounded-2xl bg-brand-soft p-5 text-sm">
            <span className="font-semibold">Already {L.a}?</span>{" "}
            <Link to="/signin" className="text-primary hover:underline">
              Sign in
            </Link>{" "}
            to order and see your team.
          </div>
        </div>
      </section>
    </div>
  );
}
