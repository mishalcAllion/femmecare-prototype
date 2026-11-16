// Change a consultant's sponsor (Administrator only, with a reason, audited).

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar } from "@/components/fc/brand";
import { Status } from "@/components/fc/ui";
import { useDb } from "@/domain/db";
import { actions } from "@/domain/actions";
import { consultantById, fullName, isDownline, STATUS_LABEL } from "@/domain/consultants";
import { consultantCode } from "@/domain/format";
import type { Consultant } from "@/domain/types";
import { act } from "@/lib/fc";
import { cn } from "@/lib/utils";
import { useLabel } from "./shared";

export function ChangeSponsorDialog({ open, onOpenChange, consultant }: { open: boolean; onOpenChange: (v: boolean) => void; consultant: Consultant }) {
  const db = useDb();
  const L = useLabel();
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<string>();
  const [reason, setReason] = useState("");
  const current = consultantById(db, consultant.sponsorId);
  const options = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return db.consultants
      .filter((c) => c.number !== undefined && c.id !== consultant.id && c.id !== consultant.sponsorId)
      .filter((c) => !needle || `${fullName(c)} ${consultantCode(c.number)} ${c.number}`.toLowerCase().includes(needle))
      .sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
      .slice(0, 8);
  }, [db, q, consultant]);
  const chosen = consultantById(db, pick);
  const ownTeam = chosen ? isDownline(db, consultant.id, chosen.id) : false;
  const inactive = chosen ? chosen.status !== "active" : false;
  const close = () => {
    setQ("");
    setPick(undefined);
    setReason("");
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(v) : close())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Change sponsor</DialogTitle>
          <DialogDescription>
            {fullName(consultant)}'s sponsor is now {current ? `${fullName(current)} (${consultantCode(current.number)})` : "not set"}. Commission on her sales goes to the new sponsor from today. The change is recorded in the audit log.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="sponsor-search">New sponsor</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="sponsor-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search by name or ${L.lower} number`} className="pl-9" />
          </div>
          <ul className="max-h-60 divide-y divide-border/60 overflow-y-auto rounded-xl border border-border/70">
            {options.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setPick(c.id)}
                  className={cn("flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-accent/60", pick === c.id && "bg-brand-soft")}
                >
                  <Avatar name={fullName(c)} hue={c.avatarHue} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{fullName(c)}</span>
                    <span className="block text-xs text-muted-foreground tabular">{consultantCode(c.number)}</span>
                  </span>
                  {isDownline(db, consultant.id, c.id) && <span className="text-xs text-muted-foreground">In her team</span>}
                  <Status>{STATUS_LABEL[c.status]}</Status>
                </button>
              </li>
            ))}
            {!options.length && <li className="px-3 py-4 text-center text-sm text-muted-foreground">No {L.lowerMany} match</li>}
          </ul>
          {chosen && ownTeam && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-destructive">
              {fullName(chosen)} is in {fullName(consultant)}'s own team, so she can't become her sponsor.
            </p>
          )}
          {chosen && !ownTeam && inactive && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-destructive">{fullName(chosen)} is {STATUS_LABEL[chosen.status].toLowerCase()} and can't sponsor anyone.</p>
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="sponsor-reason">Reason</Label>
          <Textarea id="sponsor-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: registered under the wrong sponsor number" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button
            disabled={!chosen || !reason.trim() || ownTeam || inactive}
            onClick={() => {
              if (!chosen) return;
              const r = actions.changeSponsor(consultant.id, chosen.id, reason.trim());
              act(r, `Sponsor changed to ${fullName(chosen)}`);
              if (r.ok) close();
            }}
          >
            Change sponsor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
