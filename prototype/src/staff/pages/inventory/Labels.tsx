// S25 Barcode labels: choose products and quantities, preview an A4 sheet or a label roll, print.

import { useMemo, useState } from "react";
import { Minus, Plus, Printer, Tags } from "lucide-react";
import { useDb } from "@/domain/db";
import { lkr, num } from "@/domain/format";
import { usePageTitle } from "@/lib/title";
import { Guard } from "@/staff/guard";
import { EmptyState, FilterTabs, PageHeader, Panel } from "@/components/fc/ui";
import { Barcode } from "@/components/fc/docs";
import { ProductPack } from "@/components/fc/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Product } from "@/domain/types";
import { PrintFrame } from "./shared";

const PER_SHEET = 24; // 3 × 8 labels, 70 × 37 mm

export function LabelsPage() {
  return (
    <Guard perms={["labels.print"]}>
      <Labels />
    </Guard>
  );
}

function Labels() {
  usePageTitle("Barcode labels");
  const db = useDb();
  const products = db.products.filter((p) => p.status === "active");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [layout, setLayout] = useState<"sheet" | "roll">("sheet");
  const labels = useMemo(() => products.flatMap((p) => Array.from({ length: qty[p.id] ?? 0 }, () => p)), [products, qty]);
  const sheets: Product[][] = [];
  if (layout === "sheet") for (let i = 0; i < labels.length; i += PER_SHEET) sheets.push(labels.slice(i, i + PER_SHEET));
  const set = (id: string, n: number) => setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(480, n)) }));
  return (
    <div className="animate-rise">
      <PrintFrame />
      <style>{`@media print { .label-sheet { break-after: page; } .label-sheet:last-child { break-after: auto; } }`}</style>
      <div className="no-print">
        <PageHeader
          title="Barcode labels"
          description="Print labels for packs that arrive without a printed barcode, or for shelves and cartons. Each label carries the EAN-13 barcode, item code, name and MRP."
          actions={
            <Button disabled={!labels.length} onClick={() => window.print()}>
              <Printer className="size-4" /> Print {labels.length ? `${num(labels.length)} label${labels.length > 1 ? "s" : ""}` : "labels"}
            </Button>
          }
        />
        <Panel
          title="What to print"
          description={layout === "sheet" ? `A4 sheets of ${PER_SHEET} labels (3 across, 8 down)` : "Continuous roll, one 50 × 30 mm label after another"}
          actions={
            <FilterTabs<"sheet" | "roll">
              value={layout}
              onChange={setLayout}
              options={[
                { value: "sheet", label: "A4 sheet" },
                { value: "roll", label: "Label roll" },
              ]}
            />
          }
          className="mb-6"
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {products.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl border border-border/70 p-3">
                <ProductPack product={p} className="size-11 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.id} · {p.barcode}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon-sm" onClick={() => set(p.id, (qty[p.id] ?? 0) - 1)} aria-label={`Fewer ${p.name} labels`}>
                    <Minus className="size-3.5" />
                  </Button>
                  <Input
                    value={qty[p.id] ?? 0}
                    inputMode="numeric"
                    onChange={(e) => set(p.id, Number(e.target.value.replace(/\D/g, "")) || 0)}
                    className="h-8 w-14 text-center tabular"
                    aria-label={`${p.name} labels`}
                  />
                  <Button variant="outline" size="icon-sm" onClick={() => set(p.id, (qty[p.id] ?? 0) + 1)} aria-label={`More ${p.name} labels`}>
                    <Plus className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setQty(Object.fromEntries(products.map((p) => [p.id, 4])))}>
              4 of each
            </Button>
            <Button variant="outline" size="sm" onClick={() => setQty(Object.fromEntries(products.map((p) => [p.id, PER_SHEET])))}>
              A full sheet of each
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setQty({})} disabled={!labels.length}>
              Clear
            </Button>
          </div>
        </Panel>
        <div className="mb-3 text-sm text-muted-foreground">
          Preview{labels.length ? `: ${num(labels.length)} label${labels.length > 1 ? "s" : ""}${layout === "sheet" ? ` on ${sheets.length} sheet${sheets.length > 1 ? "s" : ""}` : ""}` : ""}
        </div>
      </div>
      {!labels.length ? (
        <div className="no-print">
          <EmptyState icon={<Tags className="size-5" />} title="Choose how many labels you need" description="Set a quantity for one or more products to see the sheet." />
        </div>
      ) : layout === "sheet" ? (
        <div className="print-wide space-y-6 overflow-x-auto pb-2">
          {sheets.map((sheet, si) => (
            <div key={si} className="label-sheet print-page mx-auto grid w-[210mm] grid-cols-3 content-start gap-x-[2.5mm] gap-y-0 rounded-sm bg-white px-[6mm] py-[10mm] text-black shadow-soft" style={{ minHeight: "297mm" }}>
              {sheet.map((p, i) => (
                <Label key={i} p={p} />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="print-wide overflow-x-auto pb-2">
          <div className="print-page mx-auto flex w-[54mm] flex-col gap-[2mm] rounded-sm bg-white p-[2mm] text-black shadow-soft">
            {labels.map((p, i) => (
              <Label key={i} p={p} roll />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Label({ p, roll }: { p: Product; roll?: boolean }) {
  return (
    <div className={roll ? "flex h-[30mm] w-[50mm] flex-col justify-between border border-dashed border-neutral-300 px-[2.5mm] py-[1.5mm]" : "flex h-[37mm] flex-col justify-between border border-dashed border-neutral-200 px-[3mm] py-[2mm]"}>
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <div className="truncate text-[9pt] font-semibold leading-tight">{p.name}</div>
          <div className="text-[7pt] text-neutral-600">
            {p.id} · {p.packSize}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[6pt] uppercase text-neutral-500">MRP</div>
          <div className="text-[8.5pt] font-bold leading-none">{lkr(p.mrp)}</div>
        </div>
      </div>
      <div className="flex justify-center">
        <Barcode value={p.barcode} height={roll ? 28 : 34} className="h-auto max-w-full text-black" />
      </div>
    </div>
  );
}
