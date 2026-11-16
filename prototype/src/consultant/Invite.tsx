// C8 Invite: personal link, QR code, copy, and a ready-made WhatsApp message.

import { Link } from "react-router";
import { MessageCircle, Share2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QrCode } from "@/components/fc/docs";
import { PageHeader } from "@/components/fc/ui";
import { useDb } from "@/domain/db";
import { lkr } from "@/domain/format";
import { directTeam } from "@/domain/consultants";
import { labels } from "@/domain/ext/consultant-app";
import { useConsultant } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { earningExample } from "@/public/earn";
import { Card, CopyButton, SectionTitle } from "./bits";

export function Invite() {
  usePageTitle("Invite");
  const c = useConsultant()!;
  const db = useDb();
  const L = labels(db);
  const link = `${window.location.origin}${import.meta.env.BASE_URL}r/${c.number}`;
  const x = earningExample(db);
  const message = `Hi! I sell FemmeCare pads and intimate care and I'd love you to join my team. You buy at ${x.marginPct}% below the MRP and keep the difference, and you can earn ${x.rate}% on your own team's sales too. No joining fee. Apply here: ${link}`;
  const introduced = db.consultants.filter((m) => m.sponsorId === c.id && m.joinedVia === "link").length;
  const team = directTeam(db, c.id).length;
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <div>
      <PageHeader title="Invite to your team" description={`When someone joins with your link, you become their sponsor and earn ${x.rate}% on their sales each month.`} />

      <Card className="flex flex-col items-center p-6 text-center">
        <div className="rounded-3xl bg-blush p-4">
          <QrCode value={link} size={180} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Let them scan this with their phone camera</p>
        <div className="mt-5 flex w-full items-center gap-2 rounded-xl bg-muted/70 p-1.5 pl-3">
          <span className="min-w-0 flex-1 truncate text-left font-mono text-sm">{link.replace(/^https?:\/\//, "")}</span>
          <CopyButton value={link} label="Copy link" className="bg-card" />
        </div>
        <div className="mt-3 grid w-full gap-2 sm:grid-cols-2">
          <Button nativeButton={false} render={<a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer" />} className="h-11 rounded-full bg-[#25D366] text-white hover:bg-[#1ebe5a]">
            <MessageCircle className="size-4" /> Share on WhatsApp
          </Button>
          {canShare ? (
            <Button
              variant="outline"
              className="h-11 rounded-full"
              onClick={() => {
                void navigator.share({ title: "Join my FemmeCare team", text: message, url: link }).catch(() => undefined);
              }}
            >
              <Share2 className="size-4" /> More ways to share
            </Button>
          ) : (
            <CopyButton value={message} label="Copy message" className="h-11 justify-center rounded-full bg-muted text-sm" />
          )}
        </div>
      </Card>

      <SectionTitle>The message</SectionTitle>
      <Card className="text-sm leading-relaxed text-muted-foreground">
        <div className="rounded-2xl rounded-tl-sm bg-[oklch(0.95_0.05_150)] p-3 text-foreground">{message}</div>
        <div className="mt-3 flex justify-end">
          <CopyButton value={message} label="Copy message" />
        </div>
      </Card>

      <SectionTitle>How your team pays you</SectionTitle>
      <Card className="text-sm">
        <ul className="grid gap-2 text-muted-foreground">
          <li>
            Each month your team's sales{x.counts === "team_plus_own" ? " plus your own" : ""} reach {lkr(x.threshold, { decimals: false })}, you earn {x.rate}% of your team's sales.
          </li>
          <li>Only the people you introduce count. People they introduce join their team, not yours.</li>
          <li>Your new {L.lower} gets their own number and link once FemmeCare approves them, usually within two working days.</li>
        </ul>
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-brand-soft/60 px-3 py-2.5">
          <span className="flex items-center gap-2">
            <Users className="size-4 text-primary" /> {team} in your team{introduced ? `, ${introduced} joined with your link` : ""}
          </span>
          <Link to="/app/team" className="text-sm font-medium text-primary">
            See team
          </Link>
        </div>
      </Card>
    </div>
  );
}
