// S17 Signed delivery notes: deliveries waiting for the outlet's signed note,
// and the upload, reading and confirmation of one note.

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Camera, CheckCircle2, ClipboardCheck, FileImage, Loader2, ScanText, Sparkles, Upload } from "lucide-react";
import { useDb } from "@/domain/db";
import { actions } from "@/domain/actions";
import { orderStatusLabel } from "@/domain/lists";
import { productName, productOf } from "@/domain/stock";
import { addDays, date, dateTime, num, relative, plural } from "@/domain/format";
import { actorName, useCan, useNow } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { Guard, NotFound } from "../../guard";
import { EmptyState, PageHeader, Panel, SimpleTable, Status, StatusBadge } from "@/components/fc/ui";
import { SignedNoteImage } from "@/components/fc/docs";
import { ProductPack } from "@/components/fc/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Dispatch } from "@/domain/types";
import { partyOf, units } from "./shared";

// ---------- list ----------

export function SignedNotes() {
  return (
    <Guard perms={["pod.confirm", "pod.view"]}>
      <List />
    </Guard>
  );
}

function List() {
  usePageTitle("Signed delivery notes");
  const db = useDb();
  const now = useNow();
  const navigate = useNavigate();
  const canConfirm = useCan("pod.confirm");
  const waiting = useMemo(() => db.dispatches.filter((x) => x.channel === "outlet" && x.status === "dispatched").sort((a, b) => (a.dispatchedAt ?? "").localeCompare(b.dispatchedAt ?? "")), [db]);
  const since = addDays(now, -14);
  const done = useMemo(() => db.dispatches.filter((x) => x.channel === "outlet" && x.status === "delivered" && (x.pod?.confirmedAt ?? x.deliveredAt ?? "") >= since), [db, since]);

  return (
    <div className="animate-rise space-y-6">
      <PageHeader title="Signed delivery notes" description="When the driver brings back the outlet's signed delivery note, upload a photo of it. The quantities are read from the note for you to check and confirm." />

      <Panel title="Waiting for the signed note" description={waiting.length ? `${waiting.length} deliver${waiting.length === 1 ? "y" : "ies"} out with drivers or back without a confirmed note` : undefined} bodyClassName="p-0">
        {waiting.length ? (
          <ul className="divide-y divide-border/60">
            {waiting.map((x) => {
              const p = partyOf(db, x);
              return (
                <li key={x.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
                  <div className={cn("flex size-10 items-center justify-center rounded-xl", x.pod ? "bg-warning-soft text-warning" : "bg-info-soft text-info")}>
                    {x.pod ? <FileImage className="size-5" /> : <ClipboardCheck className="size-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">
                      {p.name} <span className="font-normal text-muted-foreground">· {p.sub}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {x.deliveryNoteId} · {plural(units(x), "unit")} · {x.vehicle}, {x.driver} · left {relative(x.dispatchedAt ?? x.createdAt, now)}
                    </div>
                  </div>
                  {x.pod ? <StatusBadge tone="warning">Note received, check it</StatusBadge> : <StatusBadge tone="info">With the driver</StatusBadge>}
                  <Button size="sm" variant={x.pod ? "default" : "outline"} nativeButton={false} render={<Link to={`/staff/pod/${x.id}`} />}>
                    {canConfirm ? (x.pod ? "Check and confirm" : "Upload the note") : "Open"}
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="p-5">
            <EmptyState icon={<CheckCircle2 className="size-5" />} title="Every delivery is confirmed" description="Deliveries appear here once they leave the warehouse." />
          </div>
        )}
      </Panel>

      <div>
        <h2 className="mb-3 text-[0.95rem] font-semibold">Confirmed in the last 14 days</h2>
        <SimpleTable<Dispatch>
          rows={done}
          rowKey={(x) => x.id}
          rowHref={(x) => `/staff/delivery-notes/${x.deliveryNoteId}`}
          onRowClick={(x) => navigate(`/staff/delivery-notes/${x.deliveryNoteId}`)}
          defaultSort={{ key: "when", dir: "desc" }}
          pageSize={10}
          columns={[
            { key: "dn", className: "whitespace-nowrap", header: "Delivery note", value: (x) => x.deliveryNoteId, cell: (x) => x.deliveryNoteId },
            { key: "outlet", header: "Outlet", value: (x) => partyOf(db, x).name, cell: (x) => partyOf(db, x).name },
            { key: "when", className: "whitespace-nowrap", header: "Confirmed", value: (x) => x.pod?.confirmedAt ?? x.deliveredAt ?? "", cell: (x) => dateTime(x.pod?.confirmedAt ?? x.deliveredAt) },
            { key: "recv", header: "Received by", value: (x) => x.receivedBy ?? "", cell: (x) => x.receivedBy ?? <span className="text-muted-foreground">Not recorded</span> },
            { key: "by", header: "Confirmed by", value: (x) => actorName(db, x.pod?.confirmedBy), cell: (x) => actorName(db, x.pod?.confirmedBy), hideOnMobile: true },
            {
              key: "qty", className: "whitespace-nowrap",
              header: "Received",
              align: "right",
              value: (x) => Object.values(x.pod?.confirmedQty ?? {}).reduce((s, n) => s + n, 0),
              cell: (x) => `${num(Object.values(x.pod?.confirmedQty ?? {}).reduce((s, n) => s + n, 0))} of ${num(units(x))}`,
            },
            { key: "diff", header: "Difference", value: (x) => x.pod?.differenceNote ?? "", cell: (x) => (x.pod?.differenceNote ? <span className="text-destructive">{x.pod.differenceNote}</span> : <span className="text-muted-foreground">None</span>) },
          ]}
          empty={<EmptyState title="Nothing confirmed recently" description="Confirmed deliveries from the last two weeks show here." />}
        />
      </div>
    </div>
  );
}

// ---------- one note ----------

export function SignedNoteConfirm() {
  return (
    <Guard perms={["pod.confirm", "pod.view"]}>
      <Confirm />
    </Guard>
  );
}

type Phase = "choose" | "reading" | "review" | "done";

function Confirm() {
  const { id } = useParams();
  const db = useDb();
  const canConfirm = useCan("pod.confirm");
  const x = db.dispatches.find((d) => d.id === id && d.channel === "outlet");
  usePageTitle(x ? `Signed note ${x.deliveryNoteId}` : "Signed delivery note");
  const [phase, setPhase] = useState<Phase>(() => (x?.status === "delivered" ? "done" : x?.pod ? "review" : "choose"));
  const [fileName, setFileName] = useState<string>();
  const [qty, setQty] = useState<Record<string, string>>({});
  const [note, setNote] = useState<string | undefined>(undefined);
  const [receivedBy, setReceivedBy] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (!x) return <NotFound />;
  const party = partyOf(db, x);
  const order = db.outletOrders.find((o) => o.id === x.orderId);
  const sent = new Map<string, number>();
  for (const l of x.lines) sent.set(l.productId, (sent.get(l.productId) ?? 0) + l.qty);

  const read = (doc: string, name?: string) => {
    setFileName(name);
    setPhase("reading");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const r = actions.readSignedNote(x.id, doc);
      if (!r.ok) {
        toast.error(r.error);
        setPhase("choose");
        return;
      }
      // read the fresh reading from the store on the next render
      setPhase("review");
      setQty({});
      setNote(undefined);
    }, 1600);
  };

  const reading = x.pod?.readQty ?? {};
  const value = (pid: string) => qty[pid] ?? String(reading[pid] ?? sent.get(pid) ?? 0);
  const noteValue = note ?? x.pod?.differenceNote ?? "";
  const shortfall = [...sent.entries()].some(([pid, q]) => Number(value(pid)) < q);
  const invalid = [...sent.entries()].find(([pid, q]) => {
    const v = Number(value(pid));
    return !Number.isInteger(v) || v < 0 || v > q;
  });

  const confirm = () => {
    const confirmed = Object.fromEntries([...sent.keys()].map((pid) => [pid, Number(value(pid))]));
    const r = actions.confirmDelivery(x.id, confirmed, noteValue.trim() || undefined, receivedBy.trim());
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    const total = Object.values(confirmed).reduce((s, n) => s + n, 0);
    toast.success(`Delivery confirmed: ${num(total)} received`);
    setPhase("done");
  };

  return (
    <div className="animate-rise space-y-6">
      <style>{`@keyframes fc-scanline { 0% { top: 0%; } 100% { top: 100%; } }`}</style>
      <PageHeader
        back={{ to: "/staff/pod", label: "Signed delivery notes" }}
        eyebrow={`${x.deliveryNoteId} · ${x.id}`}
        title={party.name}
        description={
          <>
            {party.sub} · {plural(units(x), "unit")} left {dateTime(x.dispatchedAt)} in {x.vehicle} with {x.driver} · order{" "}
            <Link to={party.orderHref} className="font-medium text-foreground hover:text-primary">
              {x.orderId}
            </Link>
          </>
        }
      />

      {phase === "choose" && (
        <Panel title="Upload the signed delivery note" description="A clear photo of the whole note, with the outlet's signature and any handwritten notes.">
          {canConfirm ? (
            <div className="grid gap-4 md:grid-cols-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) read("pod-clean", f.name);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) read("pod-clean", f.name);
                }}
                className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border px-6 py-10 text-center transition hover:border-primary/50 hover:bg-brand-soft/40"
              >
                <Upload className="size-7 text-primary" />
                <span className="font-medium">Upload a photo</span>
                <span className="text-xs text-muted-foreground">Choose an image or drop it here. On a phone this opens the camera.</span>
              </button>
              <button
                onClick={() => read("pod-clean", `${x.deliveryNoteId}-${(x.driver ?? "driver").split(" ")[0].toLowerCase()}.jpg`)}
                className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-muted/40 px-6 py-10 text-center transition hover:-translate-y-0.5 hover:shadow-soft"
              >
                <Camera className="size-7 text-plum" />
                <span className="font-medium">Use the photo from the driver</span>
                <span className="text-xs text-muted-foreground">{x.driver} took a photo of the signed note at the outlet</span>
              </button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Outlet sales uploads and confirms the signed note.</p>
          )}
        </Panel>
      )}

      {phase === "reading" && (
        <Panel>
          <div className="grid items-center gap-6 md:grid-cols-[minmax(0,420px)_1fr]">
            <div className="relative overflow-hidden rounded-xl">
              <div className="opacity-60 blur-[1.5px]">
                <SignedNoteImage noteNo={x.deliveryNoteId ?? ""} outlet={party.name} lines={[...sent.entries()].map(([pid, q]) => ({ name: productName(db, pid), qty: q, received: q }))} />
              </div>
              <div className="absolute inset-x-0 h-12 bg-gradient-to-b from-transparent via-primary/35 to-transparent" style={{ animation: "fc-scanline 1.1s ease-in-out infinite alternate" }} />
            </div>
            <div className="flex flex-col items-start gap-2">
              <Loader2 className="size-6 animate-spin text-primary" />
              <div className="font-display text-xl font-semibold">Reading the delivery note</div>
              <p className="text-sm text-muted-foreground">Finding the quantities, the signature and any notes the outlet wrote{fileName ? ` in ${fileName}` : ""}.</p>
            </div>
          </div>
        </Panel>
      )}

      {phase === "review" && x.pod && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Panel title="Photo of the signed note" description={fileName ?? (x.pod.docImage === "pod-difference" ? "Received from the driver, with a note from the outlet" : "Received from the driver")}>
            <SignedNoteImage
              noteNo={x.deliveryNoteId ?? ""}
              outlet={party.name}
              lines={[...sent.entries()].map(([pid, q]) => ({ name: productName(db, pid), qty: q, received: reading[pid] ?? q }))}
              difference={x.pod.docImage === "pod-difference"}
            />
            {canConfirm && (
              <Button variant="link" size="sm" className="mt-2 px-0" onClick={() => setPhase("choose")}>
                Upload a different photo
              </Button>
            )}
          </Panel>
          <Panel
            title={
              <span className="inline-flex items-center gap-2">
                <ScanText className="size-4 text-primary" /> Check what was read
              </span>
            }
            description="Highlighted figures were read from the note. Correct any the reading got wrong, then confirm."
          >
            <div className="space-y-3">
              {[...sent.entries()].map(([pid, q]) => {
                const p = productOf(db, pid);
                const v = Number(value(pid));
                const wasRead = reading[pid] !== undefined && qty[pid] === undefined;
                return (
                  <div key={pid} className="flex items-center gap-3 rounded-xl border border-border/70 p-3">
                    {p && <ProductPack product={p} className="size-9 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{p?.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {num(q)} sent{v < q ? <span className="text-destructive"> · {num(q - v)} short</span> : null}
                      </div>
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-[0.7rem] text-muted-foreground">Received</Label>
                      <Input
                        type="number"
                        min={0}
                        max={q}
                        value={value(pid)}
                        disabled={!canConfirm}
                        onChange={(e) => setQty((s) => ({ ...s, [pid]: e.target.value }))}
                        className={cn("h-10 w-24 text-right text-base font-semibold tabular", wasRead && "bg-yellow-100/70 ring-2 ring-yellow-400/60 dark:bg-yellow-500/15")}
                        aria-label={`Received ${p?.name}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            {invalid && <p className="mt-2 text-xs text-destructive">Received can't be more than was sent ({num(invalid[1])} of {productName(db, invalid[0])}).</p>}
            <div className="mt-4 grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Difference noted by the outlet {shortfall ? "" : "(only if something was short or damaged)"}</Label>
              <Textarea
                rows={2}
                value={noteValue}
                onChange={(e) => setNote(e.target.value)}
                disabled={!canConfirm}
                placeholder="For example: 2 packs damaged in transit"
                className={cn(x.pod.differenceNote && note === undefined && "bg-yellow-100/70 ring-2 ring-yellow-400/60 dark:bg-yellow-500/15")}
              />
              {x.pod.differenceNote && (
                <span className="inline-flex items-center gap-1 text-[0.7rem] text-muted-foreground">
                  <Sparkles className="size-3" /> Read from the outlet's handwriting
                </span>
              )}
            </div>
            <div className="mt-4 grid gap-1.5">
              <Label htmlFor="received-by" className="text-xs text-muted-foreground">
                Received by
              </Label>
              <Input
                id="received-by"
                value={receivedBy}
                onChange={(e) => setReceivedBy(e.target.value)}
                disabled={!canConfirm}
                placeholder={`Name beside the signature, e.g. ${db.outlets.find((o) => o.id === order?.outletId)?.contactPerson ?? "the store manager"}`}
              />
            </div>
            {canConfirm ? (
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button size="lg" onClick={confirm} disabled={!!invalid || (shortfall && !noteValue.trim()) || !receivedBy.trim()}>
                  <ClipboardCheck className="size-4" /> Confirm delivery
                </Button>
                {!receivedBy.trim() ? (
                  <span className="text-xs text-muted-foreground">Enter who signed for the goods.</span>
                ) : (
                  shortfall && !noteValue.trim() && <span className="text-xs text-muted-foreground">Add the outlet's note about the difference.</span>
                )}
              </div>
            ) : (
              <p className="mt-5 text-sm text-muted-foreground">Outlet sales confirms the delivery.</p>
            )}
          </Panel>
        </div>
      )}

      {phase === "done" && (
        <Panel>
          <div className="flex flex-col items-center py-6 text-center">
            <div className="animate-pop flex size-14 items-center justify-center rounded-full bg-success-soft text-success">
              <CheckCircle2 className="size-7" />
            </div>
            <div className="mt-3 font-display text-xl font-semibold">Delivery confirmed</div>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              {num(Object.values(x.pod?.confirmedQty ?? {}).reduce((s, n) => s + n, 0))} of {num(units(x))} units received
              {x.pod?.differenceNote ? `. Difference recorded: ${x.pod.differenceNote}` : ""}.
              {order && (
                <>
                  {" "}
                  Order {order.id} is now <Status>{orderStatusLabel(db, order)}</Status>
                </>
              )}
            </p>
            {x.pod?.confirmedBy && (
              <p className="mt-1 text-xs text-muted-foreground">
                {x.receivedBy ? `Received by ${x.receivedBy}. ` : ""}Confirmed by {actorName(db, x.pod.confirmedBy)} on {date(x.pod.confirmedAt)}
              </p>
            )}
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button nativeButton={false} render={<Link to={party.orderHref} />}>Open the order</Button>
              <Button variant="outline" nativeButton={false} render={<Link to={`/staff/delivery-notes/${x.deliveryNoteId}`} />}>
                Delivery note
              </Button>
              <Button variant="outline" nativeButton={false} render={<Link to="/staff/pod" />}>
                Back to the list
              </Button>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}
