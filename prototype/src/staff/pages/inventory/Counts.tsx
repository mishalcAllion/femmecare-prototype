// S23 Stock counts: blind count by scanning, recount over the limit, and approval
// by someone other than the counter. Approved differences post as adjustments.

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { AlertTriangle, Check, CheckCircle2, ClipboardList, EyeOff, ListChecks, Play, ScanBarcode, ShieldAlert, X } from "lucide-react";
import { useDb } from "@/domain/db";
import { actions } from "@/domain/actions";
import { CHANNEL_LABEL, countDifference, productName } from "@/domain/stock";
import { dateTime, lkr, num } from "@/domain/format";
import type { CountLine, StockCount } from "@/domain/types";
import { act, actorName, useCan, useStaffUser } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { Guard, NotFound } from "@/staff/guard";
import { EmptyState, PageHeader, Panel, ProgressBar, ReasonDialog, SimpleTable, Status, StatusBadge } from "@/components/fc/ui";
import { ProductPack } from "@/components/fc/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ChannelBadge } from "./shared";
import { scanCountLine } from "@/domain/ext/inventory";

const STATUS_LABEL: Record<StockCount["status"], string> = {
  counting: "Counting",
  recount: "Recount needed",
  submitted: "Waiting for approval",
  approved: "Approved",
  rejected: "Rejected",
};

export function CountsPage() {
  return (
    <Guard perms={["count.do", "count.approve"]}>
      <CountList />
    </Guard>
  );
}

function CountList() {
  usePageTitle("Stock counts");
  const db = useDb();
  const canCount = useCan("count.do");
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const waiting = db.counts.filter((c) => c.status === "submitted").length;
  const start = () => {
    const id = act(actions.startCount(chosen.length ? chosen : undefined), (cid) => `${cid} started`);
    if (id) {
      setOpen(false);
      setChosen([]);
      navigate(`/staff/counts/${id}`);
    }
  };
  return (
    <div className="animate-rise">
      <PageHeader
        title="Stock counts"
        description={`Counts are blind: the counter does not see the system quantity. A line more than ${db.settings.stock.recountLimit} units out is counted again, and someone other than the counter approves the result.`}
        actions={
          canCount && (
            <Button onClick={() => setOpen(true)}>
              <Play className="size-4" /> Start a count
            </Button>
          )
        }
      />
      {waiting > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-sm">
          <AlertTriangle className="size-4 text-warning" /> {waiting} count{waiting > 1 ? "s are" : " is"} waiting for approval.
        </div>
      )}
      <SimpleTable
        rows={db.counts}
        rowKey={(c) => c.id}
        rowHref={(c) => `/staff/counts/${c.id}`}
        onRowClick={(c) => navigate(`/staff/counts/${c.id}`)}
        defaultSort={{ key: "ts", dir: "desc" }}
        exportName="stock-counts"
        columns={[
          { key: "id", header: "Count", cell: (c) => c.id, value: (c) => c.id },
          { key: "ts", header: "Started", cell: (c) => dateTime(c.ts), value: (c) => c.ts },
          { key: "products", header: "Products", cell: (c) => [...new Set(c.lines.map((l) => l.productId))].join(", "), value: (c) => [...new Set(c.lines.map((l) => l.productId))].join(", ") },
          { key: "lines", header: "Shelves", align: "right", cell: (c) => c.lines.length, value: (c) => c.lines.length },
          {
            key: "diff",
            header: "Differences",
            align: "right",
            cell: (c) => (c.status === "counting" || c.status === "recount" ? <span className="text-muted-foreground">Hidden while counting</span> : c.lines.filter((l) => countDifference(l) !== 0).length),
            value: (c) => (c.status === "counting" || c.status === "recount" ? "" : c.lines.filter((l) => countDifference(l) !== 0).length),
          },
          { key: "by", header: "Counted by", cell: (c) => actorName(db, c.countedBy), value: (c) => actorName(db, c.countedBy) },
          { key: "decided", header: "Approved by", cell: (c) => actorName(db, c.decidedBy), value: (c) => actorName(db, c.decidedBy), hideOnMobile: true },
          { key: "status", header: "Status", cell: (c) => <Status>{STATUS_LABEL[c.status]}</Status>, value: (c) => STATUS_LABEL[c.status] },
        ]}
        empty={<EmptyState icon={<ListChecks className="size-5" />} title="No counts yet" description="Start a count to check the shelves against the records." />}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Start a stock count</DialogTitle>
            <DialogDescription>Choose the products to count. Each batch in each channel's allocation becomes one shelf to count. Leave all unticked to count everything.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {db.products
              .filter((p) => p.status === "active")
              .map((p) => {
                const shelves = db.stockLots.filter((l) => l.productId === p.id && l.onHand > 0).length;
                return (
                  <label key={p.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-border/70 px-3 py-2 hover:bg-accent/40">
                    <Checkbox checked={chosen.includes(p.id)} onCheckedChange={(v) => setChosen((c) => (v ? [...c, p.id] : c.filter((x) => x !== p.id)))} />
                    <ProductPack product={p} className="size-8" />
                    <span className="flex-1 text-sm">
                      {p.name}
                      <span className="block text-xs text-muted-foreground">
                        {p.id} · {shelves} shelves
                      </span>
                    </span>
                  </label>
                );
              })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={start}>
              <Play className="size-4" /> {chosen.length ? `Count ${chosen.length} product${chosen.length > 1 ? "s" : ""}` : "Count everything"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function CountPage() {
  return (
    <Guard perms={["count.do", "count.approve"]}>
      <CountView />
    </Guard>
  );
}

function CountView() {
  const { id } = useParams();
  const db = useDb();
  const c = db.counts.find((x) => x.id === id);
  usePageTitle(c ? `Count ${c.id}` : "Stock count");
  if (!c) return <NotFound />;
  return c.status === "counting" || c.status === "recount" ? <CountingScreen count={c} /> : <CountReview count={c} />;
}

function needsRecount(l: CountLine, limit: number) {
  return l.counted !== undefined && Math.abs(l.counted - l.systemQty) > limit;
}

function beep(ok: boolean) {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = ok ? 1250 : 220;
    o.type = ok ? "sine" : "square";
    g.gain.value = 0.05;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + (ok ? 0.07 : 0.3));
    o.onended = () => void ctx.close();
  } catch {
    /* sound is optional */
  }
}

function CountingScreen({ count: c }: { count: StockCount }) {
  const db = useDb();
  const canCount = useCan("count.do");
  const recount = c.status === "recount";
  const limit = db.settings.stock.recountLimit;
  const indices = useMemo(() => c.lines.map((_, i) => i).filter((i) => !recount || needsRecount(c.lines[i], limit)), [c.lines, recount, limit]);
  const [active, setActive] = useState<number>(indices[0] ?? 0);
  const [code, setCode] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string }>();
  const scanRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    scanRef.current?.focus();
  }, [active]);
  useEffect(() => {
    if (indices.length && !indices.includes(active)) setActive(indices[0]);
  }, [indices, active]);
  const valueOf = (l: CountLine) => (recount ? l.recounted : l.counted);
  const done = indices.filter((i) => valueOf(c.lines[i]) !== undefined).length;
  const activeLine = c.lines[active];
  const activeProduct = db.products.find((p) => p.id === activeLine?.productId);

  const scan = () => {
    const v = code.trim();
    if (!v) return;
    const r = scanCountLine(c.id, active, v, recount);
    setFeedback(r.ok ? { ok: true, text: r.value } : { ok: false, text: r.error });
    beep(r.ok);
    setCode("");
  };
  const submit = () => {
    const r = actions.submitCount(c.id);
    if (!r.ok) return act(r);
  };

  if (!canCount)
    return (
      <div className="animate-rise">
        <PageHeader back={{ to: "/staff/counts", label: "Stock counts" }} eyebrow={c.id} title="Count in progress" description={`Started ${dateTime(c.ts)} by ${actorName(db, c.countedBy)}.`} actions={<Status>{STATUS_LABEL[c.status]}</Status>} />
        <EmptyState icon={<ClipboardList className="size-5" />} title={`${done} of ${indices.length} shelves counted so far`} description="The differences show here once Stores submits the count for approval." />
      </div>
    );

  return (
    <div className="animate-rise">
      <PageHeader
        back={{ to: "/staff/counts", label: "Stock counts" }}
        eyebrow={`${c.id} · started ${dateTime(c.ts)} by ${actorName(db, c.countedBy)}`}
        title={recount ? "Count these shelves again" : "Blind count"}
        description={
          recount
            ? `The first count of ${indices.length} ${indices.length > 1 ? "shelves" : "shelf"} was more than ${limit} units away from the records. Count them again from scratch.`
            : "Pick a shelf, then scan each pack on it. The scanner adds one for every barcode; you can also type the number counted."
        }
        actions={<Status>{STATUS_LABEL[c.status]}</Status>}
      />
      <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Panel title="Scanner" description={activeProduct ? `Counting ${activeProduct.name}, batch ${activeLine.batchId}, ${CHANNEL_LABEL[activeLine.channel].toLowerCase()}` : "Choose a shelf"}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                scan();
              }}
              className="flex gap-2"
            >
              <div className="relative flex-1">
                <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input ref={scanRef} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Scan or type a barcode" className="h-11 pl-9 font-mono" aria-label="Barcode" autoComplete="off" />
              </div>
              <Button type="submit" className="h-11">
                Add
              </Button>
            </form>
            {feedback && (
              <div className={cn("mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm", feedback.ok ? "bg-success-soft text-success" : "bg-danger-soft text-destructive")}>
                {feedback.ok ? <Check className="animate-pop size-4" /> : <X className="size-4" />}
                {feedback.text}
              </div>
            )}
            {activeProduct && (
              <div className="mt-4 flex items-center gap-3 rounded-xl bg-muted/40 p-3">
                <ProductPack product={activeProduct} className="size-14" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted-foreground">Counted on this shelf</div>
                  <div className="font-display text-3xl font-semibold tabular">{num(valueOf(activeLine) ?? 0)}</div>
                </div>
                <EyeOff className="size-4 text-muted-foreground" aria-label="System quantity hidden" />
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">Barcode for this product: {activeProduct?.barcode}</p>
          </Panel>
          <Panel title="Progress">
            <div className="mb-2 flex justify-between text-sm">
              <span>
                {done} of {indices.length} shel{indices.length === 1 ? "f" : "ves"} counted
              </span>
              <span className="text-muted-foreground">{Math.round((done / Math.max(1, indices.length)) * 100)}%</span>
            </div>
            <ProgressBar value={done} max={indices.length} />
            <Button className="mt-4 w-full" disabled={done < indices.length} onClick={submit}>
              {recount ? "Submit recount" : "Submit count"}
            </Button>
            {done < indices.length && <p className="mt-2 text-xs text-muted-foreground">Count every shelf before submitting. Enter 0 for an empty shelf.</p>}
          </Panel>
        </div>
        <Panel title="Shelves" description="System quantities stay hidden until the count is submitted" bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-muted/50 text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Product</th>
                  <th className="px-3 py-2.5 font-medium">Batch</th>
                  <th className="px-3 py-2.5 font-medium">Channel</th>
                  {recount && <th className="px-3 py-2.5 text-right font-medium">First count</th>}
                  <th className="px-4 py-2.5 text-right font-medium">{recount ? "Recount" : "Counted"}</th>
                </tr>
              </thead>
              <tbody>
                {indices.map((i) => {
                  const l = c.lines[i];
                  const v = valueOf(l);
                  return (
                    <tr key={i} onClick={() => setActive(i)} className={cn("cursor-pointer border-b border-border/50 last:border-0", i === active ? "bg-brand-soft/60" : "hover:bg-accent/40")}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className={cn("size-2 rounded-full", i === active ? "bg-primary" : v !== undefined ? "bg-success" : "bg-border")} />
                          <span className="font-medium">{productName(db, l.productId)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs">{l.batchId}</td>
                      <td className="px-3 py-2.5">
                        <ChannelBadge channel={l.channel} />
                      </td>
                      {recount && <td className="px-3 py-2.5 text-right tabular text-muted-foreground">{num(l.counted ?? 0)}</td>}
                      <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <Input
                          inputMode="numeric"
                          value={v ?? ""}
                          onFocus={() => setActive(i)}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/\D/g, "");
                            void actions.setCounted(c.id, i, raw === "" ? undefined : Number(raw), recount);
                          }}
                          className="ml-auto h-8 w-24 text-right tabular"
                          aria-label={`Counted for ${productName(db, l.productId)} batch ${l.batchId}`}
                          placeholder="-"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function CountReview({ count: c }: { count: StockCount }) {
  const db = useDb();
  const user = useStaffUser();
  const canApprove = useCan("count.approve");
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [ruleError, setRuleError] = useState<string>();
  const limit = db.settings.stock.recountLimit;
  const lines = c.lines.map((l) => {
    const p = db.products.find((x) => x.id === l.productId);
    const diff = countDifference(l);
    return { ...l, diff, value: diff * (p?.costPrice ?? 0), recountedLine: l.recounted !== undefined };
  });
  const diffs = lines.filter((l) => l.diff !== 0);
  const net = lines.reduce((s, l) => s + l.diff, 0);
  const value = lines.reduce((s, l) => s + l.value, 0);
  const isCounter = user?.id === c.countedBy;
  const adjustments = db.adjustments.filter((a) => a.countId === c.id);
  const decide = (approve: boolean, note: string) => {
    const r = actions.decideCount(c.id, approve, note || undefined);
    if (!r.ok) {
      setRuleError(r.error);
      act(r);
      return;
    }
    act(r, approve ? `${c.id} approved${diffs.length ? `: ${diffs.length} adjustment${diffs.length > 1 ? "s" : ""} posted` : ""}` : `${c.id} rejected`);
  };
  return (
    <div className="animate-rise">
      <PageHeader
        back={{ to: "/staff/counts", label: "Stock counts" }}
        eyebrow={`${c.id} · counted by ${actorName(db, c.countedBy)}, started ${dateTime(c.ts)}`}
        title={c.status === "submitted" ? "Review count differences" : `Count ${STATUS_LABEL[c.status].toLowerCase()}`}
        description={
          c.status === "submitted"
            ? "The counted quantities beside the system quantities. Approving posts each difference to the stock ledger as a count adjustment."
            : `${STATUS_LABEL[c.status]} by ${actorName(db, c.decidedBy)} on ${dateTime(c.decidedAt)}${c.note ? `: "${c.note}"` : ""}`
        }
        actions={
          c.status === "submitted" && canApprove ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setRejecting(true)}>
                <X className="size-4" /> Reject
              </Button>
              <Button onClick={() => setApproving(true)}>
                <Check className="size-4" /> Approve and post
              </Button>
            </div>
          ) : (
            <Status>{STATUS_LABEL[c.status]}</Status>
          )
        }
      />
      {c.status === "submitted" && isCounter && (
        <div className={cn("mb-4 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm", ruleError ? "border-destructive/40 bg-danger-soft" : "border-info/30 bg-info-soft")}>
          <ShieldAlert className={cn("mt-0.5 size-4 shrink-0", ruleError ? "text-destructive" : "text-info")} />
          <div>
            <div className="font-medium">{ruleError ?? "You counted this stock"}</div>
            <div className="text-muted-foreground">{ruleError ? "Ask a colleague in Stores or the Administrator to approve it." : "A count must be approved by someone other than the counter. Ask a colleague in Stores or the Administrator."}</div>
          </div>
        </div>
      )}
      {c.status === "approved" && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-success/30 bg-success-soft px-4 py-3 text-sm">
          <CheckCircle2 className="animate-pop size-5 text-success" />
          {adjustments.length ? (
            <span>
              {adjustments.length} adjustment{adjustments.length > 1 ? "s" : ""} posted ({adjustments.map((a) => a.id).join(", ")}). See them in the{" "}
              <Link to="/staff/stock-ledger?type=Count+difference" className="font-medium text-primary hover:underline">
                stock ledger
              </Link>{" "}
              and the audit log.
            </span>
          ) : (
            <span>The shelves matched the records. Nothing to adjust.</span>
          )}
        </div>
      )}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-soft">
          <div className="text-xs text-muted-foreground">Shelves with a difference</div>
          <div className="mt-1 font-display text-2xl font-semibold tabular">
            {diffs.length} <span className="text-base text-muted-foreground">of {lines.length}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-soft">
          <div className="text-xs text-muted-foreground">Net difference</div>
          <div className={cn("mt-1 font-display text-2xl font-semibold tabular", net < 0 && "text-destructive", net > 0 && "text-success")}>
            {net > 0 ? "+" : ""}
            {num(net)} units
          </div>
        </div>
        <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-soft">
          <div className="text-xs text-muted-foreground">Value at cost</div>
          <div className={cn("mt-1 font-display text-2xl font-semibold tabular", value < 0 && "text-destructive")}>{lkr(value)}</div>
        </div>
      </div>
      <Panel bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border/70 bg-muted/50 text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Product</th>
                <th className="px-3 py-2.5 font-medium">Batch</th>
                <th className="px-3 py-2.5 font-medium">Channel</th>
                <th className="px-3 py-2.5 text-right font-medium">System</th>
                <th className="px-3 py-2.5 text-right font-medium">Counted</th>
                <th className="px-3 py-2.5 text-right font-medium">Recount</th>
                <th className="px-3 py-2.5 text-right font-medium">Difference</th>
                <th className="px-4 py-2.5 text-right font-medium">Value at cost</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className={cn("border-b border-border/50 last:border-0", l.diff !== 0 && "bg-warning-soft/40")}>
                  <td className="px-4 py-2.5 font-medium">{productName(db, l.productId)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">
                    <Link to={`/staff/batches/${l.batchId}`} className="hover:text-primary">
                      {l.batchId}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    <ChannelBadge channel={l.channel} />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular">{num(l.systemQty)}</td>
                  <td className="px-3 py-2.5 text-right tabular">{l.counted === undefined ? "-" : num(l.counted)}</td>
                  <td className="px-3 py-2.5 text-right tabular">{l.recounted === undefined ? "" : num(l.recounted)}</td>
                  <td className="px-3 py-2.5 text-right">
                    {l.diff === 0 ? (
                      <span className="text-muted-foreground">0</span>
                    ) : (
                      <StatusBadge tone={l.diff < 0 ? "danger" : "info"} dot={false}>
                        {l.diff > 0 ? "+" : ""}
                        {num(l.diff)}
                        {Math.abs(l.diff) > limit && !l.recountedLine ? " (over limit)" : ""}
                      </StatusBadge>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular">{l.value ? lkr(l.value) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <ReasonDialog
        open={approving}
        onOpenChange={setApproving}
        title={`Approve ${c.id}`}
        description={diffs.length ? `${diffs.length} difference${diffs.length > 1 ? "s" : ""} (net ${net > 0 ? "+" : ""}${num(net)} units) will post to the stock ledger with this reason.` : "The shelves match the records."}
        confirmLabel="Approve and post"
        requireReason={diffs.length > 0}
        placeholder="e.g. 3 packs found damaged on the bottom shelf"
        onConfirm={(reason) => decide(true, reason)}
      />
      <ReasonDialog
        open={rejecting}
        onOpenChange={setRejecting}
        title={`Reject ${c.id}`}
        description="No stock changes. Start a new count if the shelves need checking again."
        confirmLabel="Reject count"
        destructive
        onConfirm={(reason) => decide(false, reason)}
      />
    </div>
  );
}
