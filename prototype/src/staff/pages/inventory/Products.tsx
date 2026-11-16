// S26 Products: catalogue list, product page with prices and history, edit (Admin) and new product.

import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Pencil, Plus, Warehouse } from "lucide-react";
import { useDb } from "@/domain/db";
import { actions } from "@/domain/actions";
import { consultantPrice } from "@/domain/consultants";
import { available, CHANNEL_LABEL, onHand } from "@/domain/stock";
import { stockChannels } from "@/domain/permissions";
import { date, dateTime, lkr, num, round2 } from "@/domain/format";
import type { Channel, Product } from "@/domain/types";
import { act, actorName, useCan, useReviewNotes, useStaffUser } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { Guard, NotFound } from "@/staff/guard";
import { EmptyState, KeyValue, PageHeader, Panel, SimpleTable, Status, StatusBadge } from "@/components/fc/ui";
import { Barcode, NativeSelect } from "@/components/fc/docs";
import { ProductPack } from "@/components/fc/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Field, channelName } from "./shared";
import { generateBarcode, nextProductCode } from "@/domain/ext/inventory";
import { TAX_RATES, UNITS } from "@/domain/lists";

function priceRule(db: ReturnType<typeof useDb>) {
  const { method, rate } = db.settings.pricing;
  return method === "discount" ? `MRP less ${rate}% (MRP × ${(1 - rate / 100).toFixed(2)})` : `MRP ÷ ${(1 + rate / 100).toFixed(2)}`;
}

export function ProductsPage() {
  return (
    <Guard perms={["products.view"]}>
      <ProductList />
    </Guard>
  );
}

function ProductList() {
  usePageTitle("Products");
  const db = useDb();
  const navigate = useNavigate();
  const user = useStaffUser();
  const canEdit = useCan("products.edit");
  const channels = stockChannels(user?.roles ?? []);
  const label = db.settings.labels.consultant;
  return (
    <div className="animate-rise">
      <PageHeader
        title="Products"
        description={`The catalogue with MRP, trade price for outlets and the ${label.toLowerCase()} price, worked out from the pricing setting: ${priceRule(db)}.`}
        actions={
          canEdit && (
            <Button nativeButton={false} render={<Link to="/staff/products/new" />}>
              <Plus className="size-4" /> New product
            </Button>
          )
        }
      />
      <SimpleTable
        rows={db.products}
        rowKey={(p) => p.id}
        rowHref={(p) => `/staff/products/${p.id}`}
        onRowClick={(p) => navigate(`/staff/products/${p.id}`)}
        exportName="products"
        columns={[
          {
            key: "name",
            header: "Product",
            cell: (p) => (
              <span className="flex items-center gap-3">
                <ProductPack product={p} className="size-10 shrink-0" />
                <span>
                  <span className="block font-medium">{p.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {p.id} · {p.packSize}
                  </span>
                </span>
              </span>
            ),
            value: (p) => `${p.id} ${p.name}`,
          },
          { key: "category", header: "Category", cell: (p) => p.category, value: (p) => p.category, hideOnMobile: true },
          { key: "mrp", header: "MRP", align: "right", cell: (p) => lkr(p.mrp), value: (p) => p.mrp },
          { key: "cp", header: `${label} price`, align: "right", cell: (p) => lkr(consultantPrice(db, p.mrp)), value: (p) => consultantPrice(db, p.mrp) },
          { key: "trade", header: "Trade price", align: "right", cell: (p) => lkr(p.tradePrice), value: (p) => p.tradePrice, hideOnMobile: true },
          ...channels.map((ch: Channel) => ({
            key: `stock-${ch}`,
            header: `Available, ${ch === "outlet" ? "outlets" : `${label.toLowerCase()}s`}`,
            align: "right" as const,
            cell: (p: Product) => num(available(db, p.id, ch)),
            value: (p: Product) => available(db, p.id, ch),
            hideOnMobile: true,
          })),
          { key: "uom", header: "Unit", cell: (p) => p.uom, value: (p) => p.uom, hideOnMobile: true },
          { key: "status", header: "Active?", cell: (p) => <Status>{p.status === "active" ? "Active" : "Inactive"}</Status>, value: (p) => (p.status === "active" ? "Yes" : "No") },
        ]}
        empty={<EmptyState title="No products yet" description="Add the first product to start recording stock." />}
      />
    </div>
  );
}

export function ProductPage() {
  return (
    <Guard perms={["products.view"]}>
      <ProductView />
    </Guard>
  );
}

function ProductView() {
  const { id } = useParams();
  const db = useDb();
  const user = useStaffUser();
  const canEdit = useCan("products.edit");
  const [editing, setEditing] = useState(false);
  const p = db.products.find((x) => x.id === id);
  usePageTitle(p?.name ?? "Product");
  const history = useMemo(() => db.audit.filter((a) => a.area === "Products" && a.entityId === id), [db.audit, id]);
  if (!p) return <NotFound />;
  const cp = consultantPrice(db, p.mrp);
  const margin = round2(p.mrp - cp);
  const channels = stockChannels(user?.roles ?? []);
  const label = db.settings.labels.consultant;
  const tradeMargin = round2(p.tradePrice - p.costPrice);
  const notes = useReviewNotes();
  return (
    <div className="animate-rise">
      <PageHeader
        back={{ to: "/staff/products", label: "Products" }}
        eyebrow={`${p.id} · ${p.category}`}
        title={p.name}
        description={p.description}
        actions={
          <>
            <Status>{p.status === "active" ? "Active" : "Inactive"}</Status>
            {canEdit && (
              <Button onClick={() => setEditing(true)}>
                <Pencil className="size-4" /> Edit product
              </Button>
            )}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-soft">
            <ProductPack product={p} className="mx-auto w-48" />
            <div className="mt-4 flex justify-center rounded-xl bg-white p-3 text-black">
              <Barcode value={p.barcode} height={46} className="text-black" />
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">Printed barcode on the pack</p>
          </div>
          {channels.length > 0 && (
            <Panel title="Stock" actions={<Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/staff/stock" />}><Warehouse className="size-4" /> Stock</Button>}>
              <div className="space-y-3 text-sm">
                {channels.map((ch) => (
                  <div key={ch} className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">{channelName(db, ch)}</span>
                    <span className="tabular">
                      <span className="font-semibold">{num(available(db, p.id, ch))}</span> available
                      <span className="text-muted-foreground"> of {num(onHand(db, p.id, ch))}</span>
                    </span>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>
        <div className="space-y-6">
          <Panel title="Prices" description={`${label} price follows the pricing setting: ${priceRule(db)}`}>
            <div className="grid gap-3 sm:grid-cols-3">
              <PriceTile label="MRP" value={lkr(p.mrp)} sub="Printed on the pack; what visitors see" />
              <PriceTile label={`${label} price`} value={lkr(cp)} sub={`${label} margin ${lkr(margin)} per pack`} highlight />
              <PriceTile label="Trade price (outlets)" value={lkr(p.tradePrice)} sub={`${Math.round((1 - p.tradePrice / p.mrp) * 100)}% below MRP`} />
            </div>
            <div className="mt-5">
              <KeyValue
                cols={3}
                items={[
                  ["Cost price", lkr(p.costPrice)],
                  ["Gross margin on trade price", `${lkr(tradeMargin)} per pack`],
                  [notes ? "Tax rate (B1)" : "Tax rate", `${p.taxRate}%`],
                  [`Reorder level, ${CHANNEL_LABEL.outlet.toLowerCase()}`, num(p.reorder.outlet)],
                  [`Reorder level, ${label.toLowerCase()}s`, num(p.reorder.consultant)],
                  ["Unit and pack", `${p.uom}, ${p.packSize}`],
                  ["Barcode", p.barcode],
                  ["Added", date(p.createdAt)],
                  ["Active?", p.status === "active" ? "Yes" : "No"],
                  ["Notes", p.notes],
                ]}
              />
            </div>
          </Panel>
          <Panel title="MRP history" description="A new price applies to orders placed from the date it is saved. Orders already placed keep the price they were placed at.">
            {p.priceHistory.length ? (
              <ol className="space-y-3">
                {[...p.priceHistory].reverse().map((h, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      {i === 0 && <StatusBadge tone="success">Current</StatusBadge>}
                      <span className="font-semibold tabular">{lkr(h.mrp)}</span>
                      <span className="text-muted-foreground">
                        {label.toLowerCase()} price {lkr(consultantPrice(db, h.mrp))}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      from {date(h.from)} · {actorName(db, h.by) || "Opening price"}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">No price changes yet.</p>
            )}
          </Panel>
          <Panel title="Changes">
            {history.length ? (
              <ul className="space-y-3 text-sm">
                {history.map((h) => (
                  <li key={h.id}>
                    <div>{h.action}</div>
                    {h.before && (
                      <div className="text-xs text-muted-foreground">
                        {h.before} → {h.after}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {dateTime(h.ts)} · {actorName(db, h.by)}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No changes since the product was added.</p>
            )}
          </Panel>
        </div>
      </div>
      {canEdit && <EditSheet product={p} open={editing} onOpenChange={setEditing} />}
    </div>
  );
}

function PriceTile({ label, value, sub, highlight }: { label: string; value: string; sub: string; highlight?: boolean }) {
  return (
    <div className={highlight ? "rounded-xl bg-brand-soft p-4 ring-1 ring-primary/20" : "rounded-xl bg-muted/40 p-4"}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-2xl font-semibold tabular ${highlight ? "text-primary" : ""}`}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

type FormState = {
  name: string;
  category: string;
  description: string;
  packSize: string;
  uom: string;
  mrp: string;
  tradePrice: string;
  costPrice: string;
  taxRate: string;
  reorderOutlet: string;
  reorderConsultant: string;
  status: Product["status"];
  notes: string;
};

function toForm(p: Product): FormState {
  return {
    name: p.name,
    category: p.category,
    description: p.description,
    packSize: p.packSize,
    uom: p.uom,
    mrp: String(p.mrp),
    tradePrice: String(p.tradePrice),
    costPrice: String(p.costPrice),
    taxRate: String(p.taxRate),
    reorderOutlet: String(p.reorder.outlet),
    reorderConsultant: String(p.reorder.consultant),
    status: p.status,
    notes: p.notes ?? "",
  };
}

function formErrors(f: FormState) {
  const e: Partial<Record<keyof FormState, string>> = {};
  if (!f.name.trim()) e.name = "Enter the product name";
  if (!(Number(f.mrp) > 0)) e.mrp = "Enter the MRP";
  if (!(Number(f.tradePrice) > 0)) e.tradePrice = "Enter the trade price";
  else if (Number(f.tradePrice) > Number(f.mrp)) e.tradePrice = "Trade price is above the MRP";
  if (f.costPrice === "" || Number(f.costPrice) < 0) e.costPrice = "Enter the cost price";
  if (!(TAX_RATES as readonly number[]).includes(Number(f.taxRate))) e.taxRate = "Choose a tax rate";
  return e;
}

function ProductFields({ f, set, errors, codeField }: { f: FormState; set: (k: keyof FormState, v: string) => void; errors: Partial<Record<keyof FormState, string>>; codeField?: ReactNode }) {
  const db = useDb();
  const label = db.settings.labels.consultant;
  const mrp = Number(f.mrp) || 0;
  const cp = consultantPrice(db, mrp);
  const num2 = (v: string) => v.replace(/[^\d.]/g, "");
  const notes = useReviewNotes();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {codeField}
      <Field label="Name" htmlFor="pf-name" error={errors.name} className="sm:col-span-2">
        <Input id="pf-name" value={f.name} onChange={(e) => set("name", e.target.value)} />
      </Field>
      <Field label="Category" htmlFor="pf-cat">
        <Input id="pf-cat" value={f.category} onChange={(e) => set("category", e.target.value)} placeholder="e.g. Sanitary pads" />
      </Field>
      <Field label="Pack size" htmlFor="pf-pack">
        <Input id="pf-pack" value={f.packSize} onChange={(e) => set("packSize", e.target.value)} placeholder="e.g. 8 pads" />
      </Field>
      <Field label="Unit of measure" htmlFor="pf-uom">
        <NativeSelect id="pf-uom" value={f.uom} onChange={(e) => set("uom", e.target.value)}>
          {UNITS.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Active?" htmlFor="pf-status" hint={f.status === "inactive" ? "Hidden from ordering and the public site" : undefined}>
        <NativeSelect id="pf-status" value={f.status} onChange={(e) => set("status", e.target.value)}>
          <option value="active">Yes</option>
          <option value="inactive">No</option>
        </NativeSelect>
      </Field>
      <Field label="Description" htmlFor="pf-desc" className="sm:col-span-2">
        <Textarea id="pf-desc" rows={2} value={f.description} onChange={(e) => set("description", e.target.value)} />
      </Field>
      <Field label="MRP (LKR)" htmlFor="pf-mrp" error={errors.mrp} hint={mrp ? `${label} price ${lkr(cp)}, margin ${lkr(mrp - cp)}` : undefined}>
        <Input id="pf-mrp" inputMode="decimal" value={f.mrp} onChange={(e) => set("mrp", num2(e.target.value))} />
      </Field>
      <Field label="Trade price for outlets (LKR)" htmlFor="pf-trade" error={errors.tradePrice} hint={notes ? "One price for every outlet (Q1)" : "One price for every outlet"}>
        <Input id="pf-trade" inputMode="decimal" value={f.tradePrice} onChange={(e) => set("tradePrice", num2(e.target.value))} />
      </Field>
      <Field label="Cost price (LKR)" htmlFor="pf-cost" error={errors.costPrice} hint="Used for stock value">
        <Input id="pf-cost" inputMode="decimal" value={f.costPrice} onChange={(e) => set("costPrice", num2(e.target.value))} />
      </Field>
      <Field label="Tax rate" htmlFor="pf-tax" error={errors.taxRate} hint={notes ? "0% until the invoice tax treatment is confirmed (B1)" : "Printed on each invoice line"}>
        <NativeSelect id="pf-tax" value={f.taxRate} onChange={(e) => set("taxRate", e.target.value)}>
          {TAX_RATES.map((t) => (
            <option key={t} value={String(t)}>
              {t}%
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Reorder level, retail outlets" htmlFor="pf-ro" hint="Low-stock alert at or below this">
        <Input id="pf-ro" inputMode="numeric" value={f.reorderOutlet} onChange={(e) => set("reorderOutlet", e.target.value.replace(/\D/g, ""))} />
      </Field>
      <Field label={`Reorder level, ${label.toLowerCase()}s`} htmlFor="pf-rc">
        <Input id="pf-rc" inputMode="numeric" value={f.reorderConsultant} onChange={(e) => set("reorderConsultant", e.target.value.replace(/\D/g, ""))} />
      </Field>
      <Field label="Notes" htmlFor="pf-notes" className="sm:col-span-2">
        <Textarea id="pf-notes" rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="e.g. Shelf B3; carton of 48" />
      </Field>
    </div>
  );
}

function EditSheet({ product: p, open, onOpenChange }: { product: Product; open: boolean; onOpenChange: (v: boolean) => void }) {
  const db = useDb();
  const label = db.settings.labels.consultant;
  const [f, setF] = useState<FormState>(() => toForm(p));
  const errors = formErrors(f);
  const set = (k: keyof FormState, v: string) => setF((s) => ({ ...s, [k]: v }));
  const mrpChanged = Number(f.mrp) !== p.mrp;
  const save = () => {
    const ok = act(
      actions.updateProduct(p.id, {
        name: f.name.trim(),
        category: f.category.trim(),
        description: f.description.trim(),
        packSize: f.packSize.trim(),
        uom: f.uom,
        mrp: round2(Number(f.mrp)),
        tradePrice: round2(Number(f.tradePrice)),
        costPrice: round2(Number(f.costPrice)),
        taxRate: Number(f.taxRate) || 0,
        reorder: { outlet: Number(f.reorderOutlet) || 0, consultant: Number(f.reorderConsultant) || 0 },
        status: f.status,
        notes: f.notes.trim(),
      }),
      mrpChanged ? `New MRP ${lkr(Number(f.mrp))} applies to orders from today` : "Product saved",
    );
    if (ok !== undefined) onOpenChange(false);
  };
  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (v) setF(toForm(p));
        onOpenChange(v);
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Edit {p.name}</SheetTitle>
          <SheetDescription>Price changes apply to new orders from today. Orders already placed keep their price.</SheetDescription>
        </SheetHeader>
        <div className="px-4">
          <ProductFields f={f} set={set} errors={errors} />
          {mrpChanged && Number(f.mrp) > 0 && (
            <div className="mt-4 rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm">
              MRP changes from {lkr(p.mrp)} to {lkr(Number(f.mrp))}. The new price shows on the public site and in the {label.toLowerCase()} shop for orders from today, and is kept in the price history.
            </div>
          )}
        </div>
        <SheetFooter className="flex-row justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={Object.keys(errors).length > 0} onClick={save}>
            Save changes
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function ProductNewPage() {
  return (
    <Guard perms={["products.edit"]}>
      <ProductNew />
    </Guard>
  );
}

const COLOURS = ["#e8475a", "#7b3fa0", "#3a8fd6", "#2fae8f", "#f39c4a", "#d4609c", "#5b6ad0", "#c2873a"];

function ProductNew() {
  usePageTitle("New product");
  const db = useDb();
  const navigate = useNavigate();
  const [code, setCode] = useState(() => nextProductCode(db));
  const [barcode, setBarcode] = useState("");
  const [color, setColor] = useState(COLOURS[db.products.length % COLOURS.length]);
  const [f, setF] = useState<FormState>({
    name: "",
    category: "",
    description: "",
    packSize: "",
    uom: "Pack",
    mrp: "",
    tradePrice: "",
    costPrice: "",
    taxRate: "0",
    reorderOutlet: "200",
    reorderConsultant: "100",
    status: "active",
    notes: "",
  });
  // Errors show for a field once it has been changed, and for every field after a save attempt.
  const [touched, setTouched] = useState<Partial<Record<keyof FormState, boolean>>>({});
  const [tried, setTried] = useState(false);
  const set = (k: keyof FormState, v: string) => {
    setF((s) => ({ ...s, [k]: v }));
    setTouched((t) => ({ ...t, [k]: true }));
  };
  const errors = formErrors(f);
  const shownErrors = tried ? errors : (Object.fromEntries(Object.entries(errors).filter(([k]) => touched[k as keyof FormState])) as typeof errors);
  const codeTaken = db.products.some((p) => p.id.toLowerCase() === code.trim().toLowerCase());
  const badBarcode = barcode !== "" && !/^\d{13}$/.test(barcode);
  const valid = Object.keys(errors).length === 0 && code.trim() && !codeTaken && !badBarcode;
  const save = () => {
    const finalBarcode = barcode || generateBarcode(db);
    const ok = act(
      actions.createProduct({
        id: code.trim().toUpperCase(),
        name: f.name.trim(),
        category: f.category.trim() || "Other",
        description: f.description.trim(),
        packSize: f.packSize.trim(),
        uom: f.uom,
        barcode: finalBarcode,
        mrp: round2(Number(f.mrp)),
        tradePrice: round2(Number(f.tradePrice)),
        costPrice: round2(Number(f.costPrice)),
        taxRate: Number(f.taxRate) || 0,
        reorder: { outlet: Number(f.reorderOutlet) || 0, consultant: Number(f.reorderConsultant) || 0 },
        status: f.status,
        notes: f.notes.trim(),
        color,
      }),
      `${f.name.trim()} added${barcode ? "" : ` with barcode ${finalBarcode}`}`,
    );
    if (ok !== undefined) navigate(`/staff/products/${code.trim().toUpperCase()}`);
  };
  return (
    <div className="animate-rise">
      <PageHeader back={{ to: "/staff/products", label: "Products" }} title="New product" description="Opening stock is recorded afterwards as goods received." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Panel>
          <ProductFields
            f={f}
            set={set}
            errors={shownErrors}
            codeField={
              <>
                <Field label="Item code" htmlFor="pf-code" error={codeTaken ? "This item code is already used" : tried && !code.trim() ? "Enter the item code" : undefined}>
                  <Input id="pf-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="font-mono" />
                </Field>
                <Field label="Barcode (EAN-13)" htmlFor="pf-bar" error={badBarcode ? "A barcode has 13 digits" : undefined} hint="Leave blank to generate one if the pack has none printed">
                  <Input id="pf-bar" inputMode="numeric" value={barcode} onChange={(e) => setBarcode(e.target.value.replace(/\D/g, "").slice(0, 13))} className="font-mono" />
                </Field>
              </>
            }
          />
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" nativeButton={false} render={<Link to="/staff/products" />}>
              Cancel
            </Button>
            <Button onClick={() => (valid ? save() : setTried(true))}>
              Add product
            </Button>
          </div>
        </Panel>
        <Panel title="Pack colour">
          <ProductPack product={{ id: code, name: f.name || "New product", color, packSize: f.packSize || "Pack", category: f.category }} className="mx-auto w-40" />
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {COLOURS.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)} className={`size-7 rounded-full ring-offset-2 ring-offset-card transition ${color === c ? "ring-2 ring-foreground" : ""}`} style={{ background: c }} aria-label={`Colour ${c}`} />
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
