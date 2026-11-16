// S7 New outlet order: enter a paper PO with a live stock check per line, or
// upload several orders in Selyn's order format (CSV).

import { DateInput } from "@/components/fc/date-input";
import { useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { AlertTriangle, CheckCircle2, Download, FileUp, Paperclip, Plus, Trash2, X } from "lucide-react";
import { useDb } from "@/domain/db";
import { actions } from "@/domain/actions";
import { creditWarning, freeForNewOrders, lineValue, outletName, stockCheck } from "@/domain/outlets";
import { productName } from "@/domain/stock";
import { addDays, addressLine, date, dayKey, lkr, num } from "@/domain/format";
import { ordinal } from "@/domain/ext/outlets";
import { act, downloadText, toCsv, useNow } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { Guard } from "../../guard";
import { EmptyState, FilterTabs, PageHeader, Panel, StatusBadge } from "@/components/fc/ui";
import { NativeSelect } from "@/components/fc/docs";
import { ProductPack } from "@/components/fc/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Field } from "./shared";
import { toast } from "sonner";

export function NewOutletOrder() {
  return (
    <Guard perms={["outletOrders.edit"]}>
      <Page />
    </Guard>
  );
}

function Page() {
  const [params, setParams] = useSearchParams();
  const mode = params.get("mode") === "upload" ? "upload" : "enter";
  usePageTitle(mode === "upload" ? "Upload outlet orders" : "New outlet order");
  return (
    <div className="animate-rise space-y-6">
      <PageHeader
        back={{ to: "/staff/outlet-orders", label: "Outlet orders" }}
        title={mode === "upload" ? "Upload outlet orders" : "New outlet order"}
        description={mode === "upload" ? "Import several POs at once from a file in FemmeCare's order format." : "Enter the outlet's paper PO. Stock is checked line by line as you type."}
        actions={
          <FilterTabs
            value={mode}
            onChange={(v) => {
              const next = new URLSearchParams(params);
              if (v === "upload") next.set("mode", "upload");
              else next.delete("mode");
              setParams(next, { replace: true });
            }}
            options={[
              { value: "enter", label: "Enter a PO" },
              { value: "upload", label: "Upload a file" },
            ]}
          />
        }
      />
      {mode === "enter" ? <EnterPo key={params.get("outlet") ?? ""} initialOutlet={params.get("outlet") ?? ""} /> : <UploadOrders />}
    </div>
  );
}

// ---------- enter a paper PO ----------

interface LineDraft {
  key: number;
  productId: string;
  qty: string;
  unitPrice: string; // empty = trade price
  discount: string;
  notes: string;
}

const DELIVERY_METHODS = ["Own vehicle", "Courier", "Customer collects"] as const;
type DeliveryMethod = (typeof DELIVERY_METHODS)[number];

let lineKey = 1;
const newLine = (): LineDraft => ({ key: lineKey++, productId: "", qty: "", unitPrice: "", discount: "", notes: "" });

function EnterPo({ initialOutlet }: { initialOutlet: string }) {
  const db = useDb();
  const now = useNow();
  const navigate = useNavigate();
  const outlets = db.outlets.filter((o) => o.status !== "inactive").sort((a, b) => a.name.localeCompare(b.name));
  const products = db.products.filter((p) => p.status === "active");
  const [outletId, setOutletId] = useState(outlets.some((o) => o.id === initialOutlet) ? initialOutlet : "");
  const outlet = db.outlets.find((o) => o.id === outletId);
  const [po, setPo] = useState("");
  const [poDate, setPoDate] = useState(dayKey(now));
  const [required, setRequired] = useState(dayKey(addDays(now, 7)));
  const [addressId, setAddressId] = useState(outlet?.deliveryAddresses[0]?.id ?? "");
  const [notes, setNotes] = useState("");
  const [method, setMethod] = useState<DeliveryMethod>("Own vehicle");
  const [lines, setLines] = useState<LineDraft[]>([newLine()]);
  const [photo, setPhoto] = useState<string>();
  const [tried, setTried] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const priceOf = (l: LineDraft) => {
    const p = db.products.find((x) => x.id === l.productId);
    return l.unitPrice !== "" ? Number(l.unitPrice) : (p?.tradePrice ?? 0);
  };
  const ready = lines.filter((l) => l.productId && Number(l.qty) > 0);
  const checks = new Map(stockCheck(db, ready.map((l) => ({ productId: l.productId, qty: Math.floor(Number(l.qty)) }))).map((c) => [c.productId, c]));
  const value = ready.reduce((s, l) => s + lineValue({ qty: Math.floor(Number(l.qty)), unitPrice: priceOf(l), discountPct: Number(l.discount) || 0 }), 0);
  const credit = outletId && value > 0 ? creditWarning(db, outletId, value) : undefined;
  const dupPo = outletId && po.trim() ? db.outletOrders.find((o) => o.outletId === outletId && o.poNumber === po.trim() && o.status !== "cancelled") : undefined;
  const supplyNow = [...checks.values()].reduce((s, c) => s + c.supplyNow, 0);
  const short = [...checks.values()].reduce((s, c) => s + c.short, 0);

  const errors: Record<string, string> = {};
  if (!outletId) errors.outlet = "Choose the outlet";
  if (!po.trim()) errors.po = "Enter the PO number printed on the outlet's order";
  else if (dupPo) errors.po = `Already entered as ${dupPo.id}`;
  if (!poDate) errors.poDate = "Enter the PO date";
  if (!required) errors.required = "Enter the date the outlet needs it";
  else if (poDate && required < poDate) errors.required = "Can't be before the PO date";
  if (!ready.length) errors.lines = "Add at least one product with a quantity";
  for (const l of lines) {
    if (l.productId && !(Number(l.qty) > 0)) errors.lines = "Enter a quantity for every product, or remove the line";
    if (Number(l.discount) < 0 || Number(l.discount) > 100) errors.lines = "Discount must be between 0 and 100%";
    if (l.unitPrice !== "" && !(Number(l.unitPrice) > 0)) errors.lines = "Unit price must be more than zero";
  }
  const valid = Object.keys(errors).length === 0;
  const err = (k: string) => (tried ? errors[k] : undefined);

  const setLine = (key: number, patch: Partial<LineDraft>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const onHold = outlet?.status === "on_hold";
  const save = (asDraft: boolean) => {
    setTried(true);
    if (!valid) return;
    const id = act(
      actions.createOutletOrder({
        outletId,
        poNumber: po,
        poDate,
        requiredDate: required,
        deliveryAddressId: addressId,
        notes,
        source: "manual",
        hasPoPhoto: !!photo,
        deliveryMethod: method,
        asDraft,
        lines: ready.map((l) => ({ productId: l.productId, qty: Math.floor(Number(l.qty)), unitPrice: priceOf(l), discountPct: Number(l.discount) || 0, notes: l.notes.trim() || undefined })),
      }),
      (v) =>
        asDraft
          ? `${v} saved as New. Confirm it to check stock and allocate.`
          : onHold
            ? `${v} saved On Hold: ${outlet?.name} is on hold, so nothing is allocated yet`
            : `${v} confirmed: ${num(supplyNow)} allocated${short ? `, ${num(short)} back-ordered` : ""}`,
    );
    if (id) navigate(`/staff/outlet-orders/${id}`);
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <Panel title="Purchase order">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Outlet" error={err("outlet")} className="sm:col-span-2">
                <NativeSelect
                  value={outletId}
                  onChange={(e) => {
                    setOutletId(e.target.value);
                    setAddressId(db.outlets.find((o) => o.id === e.target.value)?.deliveryAddresses[0]?.id ?? "");
                  }}
                >
                  <option value="">Choose an outlet</option>
                  {outlets.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} ({o.id}, {o.city}){o.status === "on_hold" ? " · On Hold" : ""}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              {onHold && (
                <div className="flex gap-2 rounded-xl border border-warning/30 bg-warning-soft p-3 text-xs sm:col-span-2">
                  <AlertTriangle className="size-4 shrink-0 text-warning" />
                  <div>
                    <div className="font-medium text-foreground">{outlet?.name} is on hold</div>
                    <div className="mt-0.5 text-muted-foreground">The order is saved On Hold. No stock is allocated until the hold is released on the order. {outlet?.notes}</div>
                  </div>
                </div>
              )}
              <Field label="PO number" error={err("po") ?? (dupPo ? `Already entered as ${dupPo.id}` : undefined)}>
                <Input value={po} onChange={(e) => setPo(e.target.value)} placeholder="As printed, e.g. CP-4471" aria-invalid={!!dupPo} />
              </Field>
              <Field label="Delivery address" hint={outlet ? `${outlet.deliveryAddresses.find((a) => a.id === addressId)?.address ?? ""}` : undefined}>
                <NativeSelect value={addressId} onChange={(e) => setAddressId(e.target.value)} disabled={!outlet}>
                  {!outlet && <option>Choose the outlet first</option>}
                  {outlet?.deliveryAddresses.map((a) => (
                    <option key={a.id} value={a.id}>
                      {addressLine(a.label, a.city)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="PO date" error={err("poDate")}>
                <DateInput value={poDate} max={dayKey(now)} onChange={(e) => setPoDate(e.target.value)} />
              </Field>
              <Field label="Required by" error={err("required")}>
                <DateInput value={required} onChange={(e) => setRequired(e.target.value)} />
              </Field>
              <Field label="Delivery method">
                <NativeSelect value={method} onChange={(e) => setMethod(e.target.value as DeliveryMethod)}>
                  {DELIVERY_METHODS.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
          </Panel>
        </div>
        <div>
          <Panel title="PO copy">
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setPhoto(f.name);
                e.target.value = "";
              }}
            />
            {photo ? (
              <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-muted/40 px-3 py-2 text-sm">
                <Paperclip className="size-4 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{photo}</span>
                <Button variant="ghost" size="icon-xs" aria-label="Remove attachment" onClick={() => setPhoto(undefined)}>
                  <X />
                </Button>
              </div>
            ) : (
              <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()}>
                <Paperclip className="size-4" /> Attach a photo of the PO
              </Button>
            )}
            <Field label="Notes" className="mt-4">
              <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the stores team should know" />
            </Field>
          </Panel>
        </div>
      </div>
      <Panel
        title="Products"
        description="Unit price starts at the trade price. The stock check shows what can go now and what waits for stock, first in, first out."
        bodyClassName="p-0"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-border/70 bg-muted/50 text-left text-xs text-muted-foreground">
                <th className="min-w-[300px] px-4 py-2.5 font-medium">Product</th>
                <th className="w-24 px-2 py-2.5 font-medium">Quantity</th>
                <th className="w-28 px-2 py-2.5 font-medium">Unit price</th>
                <th className="w-24 px-2 py-2.5 font-medium">Discount %</th>
                <th className="w-32 px-2 py-2.5 text-right font-medium">Value</th>
                <th className="w-60 px-4 py-2.5 font-medium">Stock check</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const p = db.products.find((x) => x.id === l.productId);
                const c = checks.get(l.productId);
                const used = new Set(lines.filter((x) => x.key !== l.key).map((x) => x.productId));
                const qty = Math.floor(Number(l.qty)) || 0;
                return (
                  <tr key={l.key} className="border-b border-border/50 align-top last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {p ? <ProductPack product={p} className="size-8 shrink-0" /> : <div className="size-8 shrink-0 rounded-lg bg-muted" />}
                        <NativeSelect value={l.productId} onChange={(e) => setLine(l.key, { productId: e.target.value, unitPrice: "" })}>
                          <option value="">Choose a product</option>
                          {products.map((x) => (
                            <option key={x.id} value={x.id} disabled={used.has(x.id)}>
                              {x.id} {x.name}
                            </option>
                          ))}
                        </NativeSelect>
                      </div>
                      <Input value={l.notes} onChange={(e) => setLine(l.key, { notes: e.target.value })} placeholder="Line note (optional)" className="mt-2 ml-10 h-8 w-[calc(100%-2.5rem)] text-xs" aria-label="Line note" />
                    </td>
                    <td className="px-2 py-3">
                      <Input type="number" min={1} step={10} value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} className="tabular" aria-label="Quantity" />
                    </td>
                    <td className="px-2 py-3">
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={l.unitPrice !== "" ? l.unitPrice : p ? String(p.tradePrice) : ""}
                        onChange={(e) => setLine(l.key, { unitPrice: e.target.value })}
                        className="tabular"
                        aria-label="Unit price"
                        disabled={!p}
                      />
                      {p && l.unitPrice !== "" && Number(l.unitPrice) !== p.tradePrice && <div className="mt-1 text-[0.7rem] text-muted-foreground">Trade price {lkr(p.tradePrice, { prefix: false })}</div>}
                    </td>
                    <td className="px-2 py-3">
                      <Input type="number" min={0} max={100} step={0.5} value={l.discount} placeholder="0" onChange={(e) => setLine(l.key, { discount: e.target.value })} className="tabular" aria-label="Discount percent" />
                    </td>
                    <td className="px-2 py-3 pt-5 text-right tabular">{p && qty ? lkr(lineValue({ qty, unitPrice: priceOf(l), discountPct: Number(l.discount) || 0 })) : ""}</td>
                    <td className="px-4 py-3">
                      {onHold ? <span className="text-xs text-muted-foreground">Checked when the hold is released</span> : <StockCell productId={l.productId} qty={qty} check={c} />}
                    </td>
                    <td className="py-3 pr-3">
                      <Button variant="ghost" size="icon-sm" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-4 py-3">
          <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, newLine()])} disabled={lines.length >= products.length}>
            <Plus className="size-4" /> Add product
          </Button>
          {err("lines") && <span className="text-xs text-destructive">{err("lines")}</span>}
        </div>
      </Panel>
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Panel title="Summary" className="lg:col-span-2">
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-[1fr_1fr_1fr_1fr_1.7fr]">
            <div>
              <dt className="text-xs text-muted-foreground">Lines</dt>
              <dd className="mt-1 font-display text-lg font-semibold tabular">{ready.length}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Units ordered</dt>
              <dd className="mt-1 font-display text-lg font-semibold tabular">{num(supplyNow + short)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Allocated now</dt>
              <dd className="mt-1 font-display text-lg font-semibold tabular text-success">{onHold ? "0" : num(supplyNow)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Back-ordered</dt>
              <dd className={cn("mt-1 font-display text-lg font-semibold tabular", short > 0 && !onHold && "text-warning")}>{onHold ? "0" : num(short)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Order value</dt>
              <dd className="mt-1 whitespace-nowrap font-display text-lg font-semibold tabular">{lkr(value)}</dd>
            </div>
          </dl>
          {credit && (
            <div className="mt-4 flex gap-2 rounded-xl border border-warning/30 bg-warning-soft p-3 text-xs">
              <AlertTriangle className="size-4 shrink-0 text-warning" />
              <div>
                <div className="font-medium text-foreground">Over the credit limit</div>
                <div className="mt-0.5 text-muted-foreground">{credit} You can still save the order.</div>
              </div>
            </div>
          )}
          {short > 0 && !onHold && <p className="mt-4 text-xs text-muted-foreground">The back-ordered balance is expected in 14 days. You can revise the date on the order and tell the outlet.</p>}
        </Panel>
        <div className="space-y-2">
          <div className="grid gap-2">
            <Button size="lg" className="w-full" onClick={() => save(false)} disabled={tried && !valid}>
              {onHold ? "Save On Hold" : "Save and confirm"}
            </Button>
            <Button variant="outline" className="w-full" onClick={() => save(true)} disabled={tried && !valid}>
              Save as New
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              {onHold ? "Nothing is allocated while the outlet is on hold." : "Save and confirm allocates stock now. Save as New keeps the order unconfirmed, with no stock set aside."}
            </p>
          </div>
          {tried && !valid && <p className="text-center text-xs text-destructive">Fix the fields marked in red.</p>}
        </div>
      </div>
    </div>
  );
}

function StockCell({ productId, qty, check }: { productId: string; qty: number; check?: ReturnType<typeof stockCheck>[number] }) {
  const db = useDb();
  if (!productId) return <span className="text-xs text-muted-foreground">Choose a product</span>;
  const free = freeForNewOrders(db, productId);
  if (!qty || !check)
    return (
      <span className="text-xs text-muted-foreground">
        {num(free)} free for outlets{check === undefined && free === 0 ? ", new orders wait in line" : ""}
      </span>
    );
  if (check.short === 0)
    return (
      <div>
        <StatusBadge tone="success">All {num(qty)} now</StatusBadge>
        <div className="mt-1 text-[0.7rem] text-muted-foreground">{num(free - qty)} left free after this order</div>
      </div>
    );
  return (
    <div>
      <StatusBadge tone="warning">
        {check.supplyNow ? `${num(check.supplyNow)} now, ` : "None now, "}
        {num(check.short)} back-ordered
      </StatusBadge>
      <div className="mt-1 text-[0.7rem] text-muted-foreground">
        {ordinal(check.queueAhead + 1)} in line for {productId}
        {check.queueAhead > 0 && `, ${check.queueAhead} order${check.queueAhead === 1 ? "" : "s"} ahead`}
      </div>
    </div>
  );
}

// ---------- upload in Selyn's order format ----------

const TEMPLATE_HEADER = ["PO number", "Outlet ID", "PO date", "Required date", "Item code", "Quantity"];
const HEADER_KEYS: Record<string, keyof RawRow> = {
  ponumber: "po",
  po: "po",
  outletid: "outletId",
  customerid: "outletId",
  podate: "poDate",
  requireddate: "requiredDate",
  itemcode: "itemCode",
  quantity: "qty",
  qty: "qty",
};

interface RawRow {
  po: string;
  outletId: string;
  poDate: string;
  requiredDate: string;
  itemCode: string;
  qty: string;
}

interface CheckedRow extends RawRow {
  line: number;
  errors: string[];
  poDay?: string;
  reqDay?: string;
  productId?: string;
  quantity?: number;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === "," || ch === ";" || ch === "\t") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

/** Accepts 2027-03-02, 02/03/2027 and 2/3/2027 (day first). */
function parseDay(s: string): string | undefined {
  const t = s.trim();
  let y: number, m: number, d: number;
  let mt = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (mt) [y, m, d] = [Number(mt[1]), Number(mt[2]), Number(mt[3])];
  else {
    mt = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
    if (!mt) return undefined;
    [d, m, y] = [Number(mt[1]), Number(mt[2]), Number(mt[3])];
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return undefined;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

interface ImportResult {
  key: string;
  outlet: string;
  po: string;
  orderId?: string;
  error?: string;
  units: number;
  onHold?: boolean;
}

function UploadOrders() {
  const db = useDb();
  const now = useNow();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>();
  const [fileError, setFileError] = useState<string>();
  const [raw, setRaw] = useState<(RawRow & { line: number })[]>([]);
  const [results, setResults] = useState<ImportResult[]>();

  const downloadTemplate = () => {
    const today = dayKey(now);
    const req = dayKey(addDays(now, 7));
    downloadText(
      "femmecare-outlet-order-upload.csv",
      toCsv([TEMPLATE_HEADER, ["HOF-7012", "CUS-0002", today, req, "FC001", 120], ["HOF-7012", "CUS-0002", today, req, "FC003", 60], ["PO-7013", "CUS-0005", today, req, "FC004", 40]]),
    );
  };

  const read = async (file: File) => {
    setResults(undefined);
    setFileName(file.name);
    setFileError(undefined);
    setRaw([]);
    if (!/\.(csv|txt)$/i.test(file.name)) {
      setFileError("Save the sheet as CSV (File, Save as, CSV) and upload that file.");
      return;
    }
    const table = parseCsv(await file.text());
    if (table.length < 2) {
      setFileError("The file has no order rows under the column headings.");
      return;
    }
    const header = table[0].map((h) => HEADER_KEYS[h.toLowerCase().replace(/[^a-z]/g, "")]);
    const missing = (["po", "outletId", "poDate", "requiredDate", "itemCode", "qty"] as (keyof RawRow)[]).filter((k) => !header.includes(k));
    if (missing.length) {
      const names: Record<keyof RawRow, string> = { po: "PO number", outletId: "Outlet ID", poDate: "PO date", requiredDate: "Required date", itemCode: "Item code", qty: "Quantity" };
      setFileError(`The columns don't match the template. Missing: ${missing.map((m) => names[m]).join(", ")}.`);
      return;
    }
    setRaw(
      table.slice(1).map((cells, i) => {
        const r: RawRow = { po: "", outletId: "", poDate: "", requiredDate: "", itemCode: "", qty: "" };
        header.forEach((k, j) => {
          if (k) r[k] = (cells[j] ?? "").trim();
        });
        return { ...r, line: i + 2 };
      }),
    );
  };

  const checked = useMemo<CheckedRow[]>(() => {
    const seen = new Set<string>();
    return raw.map((r) => {
      const errors: string[] = [];
      const outlet = db.outlets.find((o) => o.id.toLowerCase() === r.outletId.toLowerCase());
      const product = db.products.find((p) => p.id.toLowerCase() === r.itemCode.toLowerCase());
      const poDay = parseDay(r.poDate);
      const reqDay = parseDay(r.requiredDate);
      const quantity = Number(r.qty);
      if (!r.po) errors.push("PO number is missing");
      if (!outlet) errors.push(r.outletId ? `Outlet ID ${r.outletId} is not registered` : "Outlet ID is missing");
      else if (outlet.status !== "active") errors.push(`${outlet.name} is inactive`);
      if (!poDay) errors.push(r.poDate ? `PO date ${r.poDate} is not a date` : "PO date is missing");
      if (!reqDay) errors.push(r.requiredDate ? `Required date ${r.requiredDate} is not a date` : "Required date is missing");
      else if (poDay && reqDay < poDay) errors.push("Required date is before the PO date");
      if (!product) errors.push(r.itemCode ? `Unknown item code ${r.itemCode}` : "Item code is missing");
      else if (product.status !== "active") errors.push(`${product.id} is no longer sold`);
      if (!Number.isInteger(quantity) || quantity <= 0) errors.push(r.qty ? `Quantity ${r.qty} is not a whole number above 0` : "Quantity is missing");
      if (outlet && r.po) {
        const dup = db.outletOrders.find((o) => o.outletId === outlet.id && o.poNumber === r.po && o.status !== "cancelled");
        if (dup) errors.push(`PO ${r.po} is already entered as ${dup.id}`);
      }
      if (outlet && product && r.po) {
        const k = `${outlet.id}|${r.po}|${product.id}`;
        if (seen.has(k)) errors.push(`${product.id} appears twice on PO ${r.po}`);
        seen.add(k);
      }
      return { ...r, errors, poDay, reqDay, productId: product?.id, quantity, outletId: outlet?.id ?? r.outletId };
    });
  }, [raw, db]);

  const good = checked.filter((r) => !r.errors.length);
  const bad = checked.filter((r) => r.errors.length);
  const groups = useMemo(() => {
    const m = new Map<string, CheckedRow[]>();
    for (const r of good) {
      const k = `${r.outletId}|${r.po}`;
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return [...m.entries()];
  }, [good]);

  const importAll = () => {
    const out: ImportResult[] = [];
    for (const [key, rows] of groups) {
      const first = rows[0];
      const outlet = db.outlets.find((o) => o.id === first.outletId)!;
      const r = actions.createOutletOrder({
        outletId: outlet.id,
        poNumber: first.po,
        poDate: first.poDay!,
        requiredDate: rows.reduce((m, x) => (x.reqDay! < m ? x.reqDay! : m), first.reqDay!),
        deliveryAddressId: outlet.deliveryAddresses[0]?.id,
        source: "upload",
        lines: rows.map((x) => ({ productId: x.productId!, qty: x.quantity! })),
      });
      out.push({ key, outlet: outlet.name, po: first.po, orderId: r.ok ? r.value : undefined, error: r.ok ? undefined : r.error, units: rows.reduce((s, x) => s + (x.quantity ?? 0), 0), onHold: outlet.status === "on_hold" });
    }
    setResults(out);
    setRaw([]);
    const made = out.filter((x) => x.orderId).length;
    if (made) toast.success(`${made} order${made === 1 ? "" : "s"} imported`);
    if (out.some((x) => x.error)) toast.error("Some orders could not be imported");
  };

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <div className="space-y-6">
        <Panel title="1. Get the template">
          <p className="text-sm text-muted-foreground">One row per product. Rows with the same outlet ID and PO number become one order.</p>
          <ul className="mt-3 space-y-1.5 text-sm">
            {[
              ["PO number", "As printed on the outlet's PO"],
              ["Outlet ID", "From the outlet register, e.g. CUS-0001"],
              ["PO date", "2027-03-02 or 02/03/2027"],
              ["Required date", "When the outlet needs the goods"],
              ["Item code", "FC001 to FC006"],
              ["Quantity", "Whole packs"],
            ].map(([k, v]) => (
              <li key={k} className="flex gap-2">
                <span className="w-28 shrink-0 font-medium">{k}</span>
                <span className="text-muted-foreground">{v}</span>
              </li>
            ))}
          </ul>
          <Button variant="outline" className="mt-4 w-full" onClick={downloadTemplate}>
            <Download className="size-4" /> Download the template (CSV)
          </Button>
        </Panel>
        <Panel title="2. Upload the file">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,.txt"
            className="hidden"
            data-testid="order-upload"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void read(f);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) void read(f);
            }}
            className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border px-4 py-8 text-center transition hover:border-primary/50 hover:bg-brand-soft/40"
          >
            <FileUp className="size-6 text-primary" />
            <span className="text-sm font-medium">{fileName ?? "Choose a CSV file or drop it here"}</span>
            <span className="text-xs text-muted-foreground">Rows are checked before anything is saved</span>
          </button>
          {fileError && <p className="mt-3 text-sm text-destructive">{fileError}</p>}
        </Panel>
      </div>

      <div className="min-w-0 xl:col-span-2">
        {results ? (
          <Panel title="Import finished" description={`${results.filter((r) => r.orderId).length} of ${results.length} orders saved from ${fileName}`} bodyClassName="p-0">
            <ul className="divide-y divide-border/60">
              {results.map((r) => (
                <li key={r.key} className="flex items-center gap-3 px-5 py-3 text-sm">
                  {r.orderId ? <CheckCircle2 className="size-4 text-success" /> : <AlertTriangle className="size-4 text-destructive" />}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">
                      {r.outlet} · PO {r.po}
                    </div>
                    <div className="text-xs text-muted-foreground">{r.error ?? `${num(r.units)} units${r.onHold ? ", saved On Hold because the outlet is on hold" : ""}`}</div>
                  </div>
                  {r.orderId && (
                    <Button variant="outline" size="sm" nativeButton={false} render={<Link to={`/staff/outlet-orders/${r.orderId}`} />}>
                      Open {r.orderId}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            <div className="border-t border-border/60 px-5 py-3">
              <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
                Upload another file
              </Button>
            </div>
          </Panel>
        ) : checked.length ? (
          <Panel
            title="3. Check and import"
            description={`${checked.length} rows read from ${fileName}`}
            actions={
              <Button onClick={importAll} disabled={!groups.length}>
                Import {groups.length} order{groups.length === 1 ? "" : "s"}
              </Button>
            }
            bodyClassName="p-0"
          >
            <div className="flex flex-wrap gap-2 border-b border-border/60 px-5 py-3">
              <StatusBadge tone="success">
                {good.length} row{good.length === 1 ? "" : "s"} ready, {groups.length} order{groups.length === 1 ? "" : "s"}
              </StatusBadge>
              {bad.length > 0 && (
                <StatusBadge tone="danger">
                  {bad.length} row{bad.length === 1 ? "" : "s"} with errors, not imported
                </StatusBadge>
              )}
            </div>
            <div className="max-h-[560px] overflow-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="sticky top-0 bg-muted/90 backdrop-blur">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Row</th>
                    <th className="px-2 py-2 font-medium">PO</th>
                    <th className="px-2 py-2 font-medium">Outlet</th>
                    <th className="px-2 py-2 font-medium">PO date</th>
                    <th className="px-2 py-2 font-medium">Required</th>
                    <th className="px-2 py-2 font-medium">Item</th>
                    <th className="px-2 py-2 text-right font-medium">Qty</th>
                    <th className="px-4 py-2 font-medium">Check</th>
                  </tr>
                </thead>
                <tbody>
                  {checked.map((r) => (
                    <tr key={r.line} className={cn("border-t border-border/50 align-top", r.errors.length && "bg-danger-soft/40")}>
                      <td className="px-4 py-2 tabular text-muted-foreground">{r.line}</td>
                      <td className="px-2 py-2">{r.po}</td>
                      <td className="px-2 py-2">
                        {r.outletId}
                        {db.outlets.some((o) => o.id === r.outletId) && <span className="block text-xs text-muted-foreground">{outletName(db, r.outletId)}</span>}
                      </td>
                      <td className="px-2 py-2">{r.poDay ? date(r.poDay) : r.poDate}</td>
                      <td className="px-2 py-2">{r.reqDay ? date(r.reqDay) : r.requiredDate}</td>
                      <td className="px-2 py-2">
                        {r.itemCode}
                        {r.productId && <span className="block text-xs text-muted-foreground">{productName(db, r.productId)}</span>}
                      </td>
                      <td className="px-2 py-2 text-right tabular">{r.qty}</td>
                      <td className="px-4 py-2">
                        {r.errors.length ? (
                          <ul className="space-y-0.5 text-xs text-destructive">
                            {r.errors.map((e) => (
                              <li key={e}>{e}</li>
                            ))}
                          </ul>
                        ) : db.outlets.find((o) => o.id === r.outletId)?.status === "on_hold" ? (
                          <StatusBadge tone="warning">Ready, outlet on hold</StatusBadge>
                        ) : (
                          <StatusBadge tone="success">Ready</StatusBadge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        ) : (
          <EmptyState icon={<FileUp className="size-5" />} title="No file uploaded yet" description="Download the template, fill in the outlets' POs, then upload it here. Each row is checked and you see the result before importing." />
        )}
      </div>
    </div>
  );
}
