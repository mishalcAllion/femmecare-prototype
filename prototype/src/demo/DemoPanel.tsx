// The demo panel: out of sight behind a small corner button or Ctrl+Shift+D.
// Switch persona, load a scenario, move the clock, simulate outside events,
// save and restore snapshots, read the Outbox. Presenter mode hides the button.

import { DateInput } from "@/components/fc/date-input";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import {
  Building2,
  CalendarClock,
  Camera,
  CircleDot,
  Clapperboard,
  Download,
  Eye,
  EyeOff,
  FlaskConical,
  Mail,
  MessageSquare,
  RotateCcw,
  Save,
  Sparkles,
  Store,
  Trash2,
  Truck,
  Upload,
  UserRound,
  Users,
} from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { actions, simulate } from "@/domain/actions";
import {
  deleteSnapshot,
  exportStateBlob,
  importStateFile,
  listSnapshots,
  nowIso,
  restoreSnapshot,
  saveSnapshot,
  useDb,
  type SnapshotInfo,
} from "@/domain/db";
import { SCENARIOS } from "@/domain/seed/generate";
import { ROLES } from "@/domain/permissions";
import { consultantCode, dateTime, lkIso, relative, weekday } from "@/domain/format";
import { fullName, directTeam } from "@/domain/consultants";
import { act, downloadBlob } from "@/lib/fc";
import { Avatar } from "@/components/fc/brand";
import type { ScenarioId } from "@/domain/types";

type Tab = "people" | "scenario" | "events" | "snapshots" | "outbox";

export function DemoPanel() {
  const db = useDb();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("people");
  const inApp = useLocation().pathname.startsWith("/app");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "D" || e.key === "d")) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("fc:open-demo", onOpen);
    return () => window.removeEventListener("fc:open-demo", onOpen);
  }, []);

  return (
    <>
      {!db.meta.presenterMode && (
        <button
          onClick={() => setOpen(true)}
          className={cn(
            "no-print fixed right-4 z-[60] flex size-9 items-center justify-center rounded-full border border-border bg-card/80 text-muted-foreground opacity-60 shadow-soft backdrop-blur transition hover:opacity-100",
            inApp ? "bottom-24 md:bottom-4" : "bottom-4",
          )}
          aria-label="Open demo controls (Ctrl+Shift+D)"
          title="Demo controls (Ctrl+Shift+D)"
        >
          <FlaskConical className="size-4" />
        </button>
      )}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-[440px]">
          <SheetHeader className="border-b border-border px-5 pb-3 pt-5">
            <SheetTitle className="flex items-center gap-2">
              <FlaskConical className="size-4 text-primary" /> Demo controls
            </SheetTitle>
            <SheetDescription>
              {SCENARIOS[db.meta.scenario].label} scenario · {weekday(nowIso())} {dateTime(nowIso())}
              {db.meta.changed && <span className="ml-1 rounded bg-warning-soft px-1.5 py-0.5 text-[0.7rem] text-warning">changed</span>}
              <br />
              Demo data only. Nothing is sent to anyone.
            </SheetDescription>
          </SheetHeader>
          <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-border px-3 py-2">
            {(
              [
                ["people", "People", Users],
                ["scenario", "Scenario", CalendarClock],
                ["events", "Events", Sparkles],
                ["snapshots", "Snapshots", Camera],
                ["outbox", "Outbox", Mail],
              ] as const
            ).map(([k, label, Icon]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm", tab === k ? "bg-brand-soft font-medium text-primary" : "text-muted-foreground hover:bg-muted")}
              >
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {tab === "people" && <People close={() => setOpen(false)} />}
            {tab === "scenario" && <ScenarioTab />}
            {tab === "events" && <Events />}
            {tab === "snapshots" && <Snapshots />}
            {tab === "outbox" && <Outbox />}
          </div>
          <div className="space-y-3 border-t border-border px-5 py-3">
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2">
                {db.meta.presenterMode ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                Presenter mode
                <span className="text-xs text-muted-foreground">hides the corner button</span>
              </span>
              <Switch checked={db.meta.presenterMode} onCheckedChange={(v) => actions.setPresenterMode(!!v)} />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2">
                <Clapperboard className="size-4" /> Show later-phase features
              </span>
              <Switch checked={db.meta.phaseLens === "everything"} onCheckedChange={(v) => actions.setPhaseLens(v ? "everything" : "first_release")} />
            </label>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

function People({ close }: { close: () => void }) {
  const db = useDb();
  const navigate = useNavigate();
  const session = db.meta.session;
  const staff = db.users.filter((u) => u.status === "active");
  const consultants = useMemo(() => {
    const active = db.consultants.filter((c) => c.status === "active" && (c.number ?? 0) > 1);
    const top = [...active].sort((a, b) => directTeam(db, b.id).length - directTeam(db, a.id).length)[0];
    const nimali = active.find((c) => c.givenName === "Nimali" && c.surname === "Perera") ?? top;
    const fresh = [...active].reverse().find((c) => directTeam(db, c.id).length === 0);
    const suspended = db.consultants.find((c) => c.status === "suspended");
    return [
      nimali && { c: nimali, note: `Top sponsor, ${directTeam(db, nimali.id).length} in her team` },
      fresh && { c: fresh, note: "New, no team yet" },
      suspended && { c: suspended, note: "Suspended account" },
    ].filter(Boolean) as { c: (typeof active)[number]; note: string }[];
  }, [db]);
  const isMe = (id: string) => (session.kind === "staff" && session.userId === id) || (session.kind === "consultant" && session.consultantId === id);
  return (
    <>
      <Section title="Staff console">
        <div className="grid gap-1.5">
          {staff.map((u) => (
            <button
              key={u.id}
              onClick={() => {
                act(actions.signInStaff(u.id));
                close();
                // navigate once the new session has rendered, so the old app's sign-in check does not win
                setTimeout(() => navigate("/staff"), 30);
              }}
              className={cn("flex items-center gap-3 rounded-xl border border-transparent px-2.5 py-2 text-left hover:border-border hover:bg-muted/60", isMe(u.id) && "border-primary/30 bg-brand-soft")}
            >
              <Avatar name={u.name} hue={u.avatarHue} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{u.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{u.roles.map((r) => ROLES[r].label).join(", ")}</span>
              </span>
              {isMe(u.id) && <CircleDot className="size-4 text-primary" />}
            </button>
          ))}
        </div>
      </Section>
      <Section title={`${db.settings.labels.consultant} app`}>
        <div className="grid gap-1.5">
          {consultants.map(({ c, note }) => (
            <button
              key={c.id}
              onClick={() => {
                act(actions.signInConsultant(c.id));
                close();
                setTimeout(() => navigate(c.status === "active" ? "/app" : "/app/blocked"), 30);
              }}
              className={cn("flex items-center gap-3 rounded-xl border border-transparent px-2.5 py-2 text-left hover:border-border hover:bg-muted/60", isMe(c.id) && "border-primary/30 bg-brand-soft")}
            >
              <Avatar name={fullName(c)} hue={c.avatarHue} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {fullName(c)} <span className="font-normal text-muted-foreground">{consultantCode(c.number)}</span>
                </span>
                <span className="block truncate text-xs text-muted-foreground">{note}</span>
              </span>
            </button>
          ))}
        </div>
      </Section>
      <Section title="Public website">
        <div className="grid gap-1.5">
          <Button
            variant="outline"
            className="justify-start"
            onClick={() => {
              actions.signOut();
              navigate("/");
              close();
            }}
          >
            <UserRound className="size-4" /> Visitor on femmecare.lk
          </Button>
          {consultants[0] && (
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => {
                actions.signOut();
                navigate(`/r/${consultants[0].c.number}`);
                close();
              }}
            >
              <Store className="size-4" /> Visitor opening {consultants[0].c.givenName}'s invite link
            </Button>
          )}
        </div>
      </Section>
    </>
  );
}

function ScenarioTab() {
  const db = useDb();
  const [day, setDay] = useState("");
  const [time, setTime] = useState("09:00");
  return (
    <>
      <Section title="Load a scenario">
        <div className="grid gap-2">
          {(Object.keys(SCENARIOS) as ScenarioId[]).map((k) => (
            <button
              key={k}
              onClick={() => {
                if (db.meta.changed && !window.confirm("Discard the changes made in this scenario?")) return;
                actions.loadScenario(k);
                toast.success(`${SCENARIOS[k].label} scenario loaded`);
              }}
              className={cn("rounded-xl border px-3 py-2.5 text-left transition hover:border-primary/40 hover:bg-brand-soft/50", db.meta.scenario === k ? "border-primary/40 bg-brand-soft/60" : "border-border")}
            >
              <div className="text-sm font-medium">{SCENARIOS[k].label}</div>
              <div className="text-xs text-muted-foreground">{SCENARIOS[k].description}</div>
            </button>
          ))}
          <Button
            variant="outline"
            onClick={() => {
              if (!window.confirm("Go back to the start of this scenario? Changes are lost unless you saved a snapshot.")) return;
              actions.loadScenario(db.meta.scenario);
              toast.success("Demo data reset");
            }}
          >
            <RotateCcw className="size-4" /> Reset to the start of this scenario
          </Button>
        </div>
      </Section>
      <Section title="Demo clock">
        <div className="mb-2 rounded-xl bg-muted px-3 py-2 text-sm">
          {weekday(nowIso())} {dateTime(nowIso())}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => act(actions.advanceDays(1), "Moved forward one day")}>
            +1 day
          </Button>
          <Button variant="outline" onClick={() => act(actions.jumpToMonthEnd(), "Moved to the last day of the month")}>
            Month end
          </Button>
        </div>
        <div className="mt-2 flex gap-2">
          <DateInput value={day} onChange={(e) => setDay(e.target.value)} />
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-28" />
          <Button disabled={!day} onClick={() => act(actions.setClockTo(lkIso(day, time)), "Clock moved")}>
            Go
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Overdue invoices, expiry alerts, month-end prompts and the commission month all follow this clock.</p>
      </Section>
    </>
  );
}

function Events() {
  const items: { label: string; detail: string; icon: React.ElementType; run: () => ReturnType<typeof simulate.courierDelivers> }[] = [
    { label: "Courier delivers an order", detail: "A dispatched consultant order becomes Delivered", icon: Truck, run: simulate.courierDelivers },
    { label: "Bank returns payout results", detail: "Each payout marked paid, with one failure", icon: Building2, run: simulate.bankReturnsResults },
    { label: "New application through a referral link", detail: "Appears in the Admin's queue under the sponsor", icon: UserRound, run: simulate.newApplication },
    { label: "Next card payment fails", detail: "The next consultant card payment is declined", icon: FlaskConical, run: simulate.nextCardFails },
    { label: "Production sends stock", detail: "A goods-received note waits for Stores", icon: Store, run: simulate.productionSendsStock },
    { label: "Outlet returns a signed note with a difference", detail: "\"2 packs damaged\" written on the note", icon: Upload, run: simulate.signedNoteWithDifference },
  ];
  return (
    <Section title="Things that happen outside the system">
      <div className="grid gap-2">
        {items.map((it) => (
          <button
            key={it.label}
            onClick={() => act(it.run(), (v) => String(v))}
            className="flex items-start gap-3 rounded-xl border border-border px-3 py-2.5 text-left transition hover:border-primary/40 hover:bg-brand-soft/50"
          >
            <it.icon className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              <span className="block text-sm font-medium">{it.label}</span>
              <span className="block text-xs text-muted-foreground">{it.detail}</span>
            </span>
          </button>
        ))}
      </div>
    </Section>
  );
}

function Snapshots() {
  const [list, setList] = useState<SnapshotInfo[]>([]);
  const [name, setName] = useState("");
  const refresh = () => void listSnapshots().then(setList);
  useEffect(refresh, []);
  return (
    <>
      <Section title="Save the current state">
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Before Sachindra's walkthrough" />
          <Button
            disabled={!name.trim()}
            onClick={async () => {
              await saveSnapshot(name.trim());
              setName("");
              refresh();
              toast.success("Snapshot saved");
            }}
          >
            <Save className="size-4" /> Save
          </Button>
        </div>
      </Section>
      <Section title="Saved snapshots">
        {!list.length && <p className="text-sm text-muted-foreground">No snapshots yet.</p>}
        <div className="grid gap-2">
          {list.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{s.name}</div>
                <div className="text-xs text-muted-foreground">
                  Demo date {dateTime(s.demoDate)} · saved {relative(s.savedAt, new Date().toISOString())}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await restoreSnapshot(s.id);
                  toast.success(`Restored "${s.name}"`);
                }}
              >
                Restore
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Delete snapshot"
                onClick={async () => {
                  await deleteSnapshot(s.id);
                  refresh();
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Move a state to another laptop">
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => downloadBlob(`femmecare-demo-${new Date().toISOString().slice(0, 10)}.json`, exportStateBlob())}>
            <Download className="size-4" /> Export file
          </Button>
          <label className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-muted">
            <Upload className="size-4" /> Load file
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  await importStateFile(f);
                  toast.success("Demo state loaded");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Could not read the file");
                }
              }}
            />
          </label>
        </div>
      </Section>
    </>
  );
}

function Outbox() {
  const db = useDb();
  const [kind, setKind] = useState<"all" | "email" | "sms">("all");
  const [openId, setOpenId] = useState<string>();
  const msgs = db.outbox.filter((m) => kind === "all" || m.channel === kind).slice(0, 80);
  return (
    <>
      <div className="mb-3 flex gap-1">
        {(["all", "email", "sms"] as const).map((k) => (
          <button key={k} onClick={() => setKind(k)} className={cn("rounded-full px-3 py-1 text-xs", kind === k ? "bg-foreground text-background" : "bg-muted text-muted-foreground")}>
            {k === "all" ? "All" : k === "email" ? "Email" : "SMS"}
          </button>
        ))}
        <span className="ml-auto self-center text-xs text-muted-foreground">{db.outbox.length} messages</span>
      </div>
      <div className="grid gap-2">
        {msgs.map((m) => (
          <button key={m.id} onClick={() => setOpenId(openId === m.id ? undefined : m.id)} className="rounded-xl border border-border px-3 py-2 text-left hover:bg-muted/50">
            <div className="flex items-center gap-2">
              {m.channel === "email" ? <Mail className="size-3.5 text-info" /> : <MessageSquare className="size-3.5 text-success" />}
              <span className="truncate text-sm font-medium">{m.subject ?? m.body.slice(0, 60)}</span>
            </div>
            <div className="mt-0.5 truncate text-xs text-muted-foreground">
              To {m.toName} · {m.to} · {dateTime(m.ts)}
            </div>
            {openId === m.id && (
              <div className={cn("mt-2 whitespace-pre-line rounded-lg p-3 text-sm", m.channel === "sms" ? "bg-success-soft" : "bg-muted")}>
                {m.body}
                {m.attachment && <div className="mt-2 text-xs text-muted-foreground">Attached: {m.attachment}</div>}
              </div>
            )}
          </button>
        ))}
      </div>
    </>
  );
}

/** Lets any screen open the panel, e.g. the Outbox link on the one-time code screen. */
export function openDemoPanel() {
  window.dispatchEvent(new Event("fc:open-demo"));
}
