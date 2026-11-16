// S39 Report centre and report pages: filters, on-screen table with a totals row,
// Excel and CSV export, PDF through print, and a check that the totals reconcile.

import { DateInput } from "@/components/fc/date-input";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { ArrowRight, BarChart3, CheckCircle2, Download, FileSpreadsheet, Printer, SlidersHorizontal, XCircle } from "lucide-react";
import { useDb } from "@/domain/db";
import { CHANNEL_LABEL } from "@/domain/stock";
import { stockChannels } from "@/domain/permissions";
import { fullName } from "@/domain/consultants";
import { consultantCode, date, dateTime, dayKey, monthKey, monthLabel, num, prevMonthKey } from "@/domain/format";
import type { Db } from "@/domain/types";
import { actorName, downloadExcel, downloadText, toCsv, useNow, useStaffUser } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { Guard, NotFound } from "@/staff/guard";
import { EmptyState, PageHeader, Panel, StatusBadge } from "@/components/fc/ui";
import { NativeSelect } from "@/components/fc/docs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { defaultFilters, GROUPS, reportsFor, reportTitle, REPORTS, type ReportColumn, type ReportDef, type ReportFilters, type Row } from "@/domain/ext/reports";
import { Field, LaterTag, PrintFrame } from "../inventory/shared";

const REPORT_PERMS = ["reports.outlet", "reports.stock", "reports.consultant", "reports.finance"] as const;

export function ReportCentrePage() {
  return (
    <Guard perms={[...REPORT_PERMS]}>
      <ReportCentre />
    </Guard>
  );
}

function formats(r: ReportDef) {
  return r.pdf ? ["Excel", "CSV", "PDF"] : ["Excel", "CSV"];
}

function ReportCentre() {
  usePageTitle("Reports");
  const db = useDb();
  const user = useStaffUser();
  const mine = reportsFor(db, user?.roles ?? []);
  const label = db.settings.labels.consultant;
  return (
    <div className="animate-rise">
      <PageHeader title="Reports" description="Each report opens on screen with filters and a totals row, and exports to Excel or CSV. Outlet, stock and finance reports also print to PDF." />
      <div className="grid gap-6 xl:grid-cols-2">
        {GROUPS.map((g) => {
          const list = mine.filter((r) => r.group === g.id);
          if (!list.length) return null;
          return (
            <Panel key={g.id} title={g.title(label)} description={g.description} bodyClassName="p-2">
              <ul>
                {list.map((r) => (
                  <li key={r.id}>
                    <Link to={`/staff/reports/${r.id}`} className="group flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-accent/50">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-primary">
                        <BarChart3 className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{reportTitle(db, r)}</div>
                        <div className="truncate text-xs text-muted-foreground">{r.description}</div>
                      </div>
                      <div className="hidden shrink-0 gap-1 sm:flex">
                        {formats(r).map((f) => (
                          <span key={f} className="rounded-md bg-muted px-1.5 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
                            {f}
                          </span>
                        ))}
                      </div>
                      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          );
        })}
        {db.meta.phaseLens === "everything" && (
          <Panel
            title={
              <>
                Custom reports
                <LaterTag />
              </>
            }
            description="Build your own report from chosen columns and filters"
          >
            <p className="text-sm text-muted-foreground">Pick a record type (orders, stock movements, {label.toLowerCase()}s), choose columns and filters, and save the report for your team. Until then, every standard report exports to Excel for further analysis.</p>
          </Panel>
        )}
      </div>
    </div>
  );
}

export function ReportPage() {
  const { id } = useParams();
  const def = REPORTS.find((r) => r.id === id);
  if (!def) return <NotFound />;
  return (
    <Guard perms={[def.perm]}>
      <ReportView def={def} />
    </Guard>
  );
}

function display(db: Db, col: ReportColumn, v: string | number | undefined): string {
  if (v === undefined || v === "") return "";
  switch (col.kind) {
    case "money":
      return Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case "qty":
      return num(Number(v));
    case "date":
      return date(String(v));
    case "datetime":
      return dateTime(String(v));
    case "pct":
      return `${Number(v).toFixed(2)}%`;
    case "actor":
      return actorName(db, String(v));
    default:
      return String(v);
  }
}

function exportValue(db: Db, col: ReportColumn, v: string | number | undefined): string | number {
  if (v === undefined) return "";
  if (col.kind === "money" || col.kind === "qty" || col.kind === "pct") return Number(v);
  return display(db, col, v);
}

function useMonths(db: Db, now: string) {
  return useMemo(() => {
    const first = [...db.consultantOrders.map((o) => o.createdAt), ...db.invoices.map((i) => i.date)].sort()[0] ?? now;
    const out: string[] = [];
    let m = monthKey(now);
    const stop = monthKey(first);
    while (m >= stop && out.length < 24) {
      out.push(m);
      m = prevMonthKey(m);
    }
    return out;
  }, [db.consultantOrders, db.invoices, now]);
}

function ReportView({ def }: { def: ReportDef }) {
  const db = useDb();
  const now = useNow();
  const user = useStaffUser();
  const navigate = useNavigate();
  const title = reportTitle(db, def);
  usePageTitle(title);
  const [params, setParams] = useSearchParams();
  const base = defaultFilters(now);
  const f: ReportFilters = {
    from: params.get("from") ?? base.from,
    to: params.get("to") ?? base.to,
    month: params.get("month") ?? (def.id === "payouts" ? "" : base.month),
    outletId: params.get("outlet") ?? "",
    productId: params.get("product") ?? "",
    channel: (params.get("channel") ?? "") as ReportFilters["channel"],
    consultantId: params.get("consultant") ?? "",
    status: params.get("status") ?? "",
    area: params.get("area") ?? "",
  };
  const paramKey: Record<keyof ReportFilters, string> = { from: "from", to: "to", month: "month", outletId: "outlet", productId: "product", channel: "channel", consultantId: "consultant", status: "status", area: "area" };
  const set = (k: keyof ReportFilters, v: string) => {
    const next = new URLSearchParams(params);
    next.set(paramKey[k], v);
    setParams(next, { replace: true });
  };
  const setPeriod = (from: string, to: string) => {
    const next = new URLSearchParams(params);
    next.set("from", from);
    next.set("to", to);
    setParams(next, { replace: true });
  };
  const roles = user?.roles ?? [];
  const res = useMemo(() => def.run(db, f, { now, roles }), [def, db, now, roles, f.from, f.to, f.month, f.outletId, f.productId, f.channel, f.consultantId, f.status, f.area]); // eslint-disable-line react-hooks/exhaustive-deps
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>();
  const [showAll, setShowAll] = useState(false);
  const order = useMemo(() => {
    const idx = res.rows.map((_, i) => i);
    if (!sort) return idx;
    return idx.sort((a, b) => {
      const va = res.rows[a][sort.key];
      const vb = res.rows[b][sort.key];
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va ?? "").localeCompare(String(vb ?? ""));
      return cmp * sort.dir;
    });
  }, [res.rows, sort]);
  const LIMIT = 300;
  const shown = showAll ? order : order.slice(0, LIMIT);
  const months = useMonths(db, now);
  const channels = stockChannels(roles);
  const areas = useMemo(() => [...new Set(db.audit.map((a) => a.area))].sort(), [db.audit]);
  const hasTotals = Object.keys(res.totals).length > 0;
  const allOk = res.checks.every((c) => c.ok);
  const fileBase = `${def.id}-${def.filters.includes("month") ? f.month : `${f.from}_to_${f.to}`}`;

  const exportRows = () => {
    const rows = order.map((i) => res.columns.map((c) => exportValue(db, c, res.rows[i][c.key])));
    if (hasTotals) rows.push(res.columns.map((c, i) => (i === 0 ? "Total" : c.total ? Number(res.totals[c.key]) : "")));
    return rows;
  };
  const printNow = () => {
    setShowAll(true);
    window.setTimeout(() => window.print(), 50);
  };
  const filterText = [
    def.filters.includes("period") && `${date(f.from)} to ${date(f.to)}`,
    def.filters.includes("month") && (f.month ? monthLabel(f.month) : "All months"),
    f.outletId && db.outlets.find((o) => o.id === f.outletId)?.name,
    f.productId && f.productId,
    f.channel && CHANNEL_LABEL[f.channel],
    f.consultantId && db.consultants.find((c) => c.id === f.consultantId) && fullName(db.consultants.find((c) => c.id === f.consultantId)!),
    f.status,
    f.area,
  ]
    .filter(Boolean)
    .join(" · ");

  const presets = (() => {
    const m = monthKey(now);
    const today = dayKey(now);
    const lastDay = (k: string) => {
      const [y, mm] = k.split("-").map(Number);
      return `${k}-${String(new Date(Date.UTC(y, mm, 0)).getUTCDate()).padStart(2, "0")}`;
    };
    return [
      { label: "This month", from: `${m}-01`, to: today },
      { label: "Last month", from: `${prevMonthKey(m)}-01`, to: lastDay(prevMonthKey(m)) },
      { label: "Last 3 months", from: `${prevMonthKey(prevMonthKey(m))}-01`, to: today },
      { label: "This year", from: `${m.slice(0, 4)}-01-01`, to: today },
    ];
  })();

  return (
    <div className="animate-rise">
      <PrintFrame />
      <div className="mb-4 hidden print:block">
        <div className="flex items-end justify-between border-b border-neutral-300 pb-2">
          <div>
            <div className="text-xs text-neutral-500">{db.settings.company.name}</div>
            <div className="text-lg font-semibold">{title}</div>
            <div className="text-xs text-neutral-600">{filterText}</div>
          </div>
          <div className="text-right text-xs text-neutral-500">
            Printed {dateTime(now)}
            <br />
            by {user?.name}
          </div>
        </div>
      </div>
      <div className="no-print">
        <PageHeader
          back={{ to: "/staff/reports", label: "Reports" }}
          title={title}
          description={def.description}
          actions={
            <>
              <Button variant="outline" size="sm" onClick={() => void downloadExcel(`${fileBase}.xlsx`, res.columns.map((c) => c.header), exportRows(), title.slice(0, 30))}>
                <FileSpreadsheet className="size-4" /> Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => downloadText(`${fileBase}.csv`, toCsv([res.columns.map((c) => c.header), ...exportRows()]))}>
                <Download className="size-4" /> CSV
              </Button>
              {def.pdf && (
                <Button variant="outline" size="sm" onClick={printNow}>
                  <Printer className="size-4" /> PDF
                </Button>
              )}
            </>
          }
        />
        {def.filters.length > 0 && (
          <div className="mb-4 rounded-2xl border border-border/70 bg-card p-4 shadow-soft">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <SlidersHorizontal className="size-3.5" /> Filters
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {def.filters.includes("period") && (
                <>
                  <Field label="From" htmlFor="rf-from">
                    <DateInput id="rf-from" value={f.from} onChange={(e) => set("from", e.target.value)} />
                  </Field>
                  <Field label="To" htmlFor="rf-to">
                    <DateInput id="rf-to" value={f.to} onChange={(e) => set("to", e.target.value)} />
                  </Field>
                </>
              )}
              {def.filters.includes("month") && (
                <Field label="Month" htmlFor="rf-month">
                  <NativeSelect id="rf-month" value={f.month} onChange={(e) => set("month", e.target.value)}>
                    {def.id === "payouts" && <option value="">All months</option>}
                    {months.map((m) => (
                      <option key={m} value={m}>
                        {monthLabel(m)}
                        {db.commissionMonths.some((c) => c.id === m) ? " (closed)" : ""}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              )}
              {def.filters.includes("outlet") && (
                <Field label="Outlet" htmlFor="rf-outlet">
                  <NativeSelect id="rf-outlet" value={f.outletId} onChange={(e) => set("outletId", e.target.value)}>
                    <option value="">All outlets</option>
                    {db.outlets.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              )}
              {def.filters.includes("product") && (
                <Field label="Product" htmlFor="rf-product">
                  <NativeSelect id="rf-product" value={f.productId} onChange={(e) => set("productId", e.target.value)}>
                    <option value="">All products</option>
                    {db.products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.id} · {p.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              )}
              {def.filters.includes("channel") && channels.length > 1 && (
                <Field label="Channel" htmlFor="rf-channel">
                  <NativeSelect id="rf-channel" value={f.channel} onChange={(e) => set("channel", e.target.value)}>
                    <option value="">Both channels</option>
                    {channels.map((c) => (
                      <option key={c} value={c}>
                        {c === "outlet" ? CHANNEL_LABEL.outlet : `${db.settings.labels.consultant}s`}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              )}
              {def.filters.includes("consultant") && (
                <Field label={db.settings.labels.consultant} htmlFor="rf-cons">
                  <NativeSelect id="rf-cons" value={f.consultantId} onChange={(e) => set("consultantId", e.target.value)}>
                    <option value="">Everyone</option>
                    {db.consultants
                      .filter((c) => c.number !== undefined)
                      .sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {consultantCode(c.number)} · {fullName(c)}
                        </option>
                      ))}
                  </NativeSelect>
                </Field>
              )}
              {def.filters.includes("status") && def.statusOptions && (
                <Field label={def.statusLabel ?? "Status"} htmlFor="rf-status">
                  <NativeSelect id="rf-status" value={f.status} onChange={(e) => set("status", e.target.value)}>
                    <option value="">All</option>
                    {def.statusOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              )}
              {def.filters.includes("area") && (
                <Field label="Area" htmlFor="rf-area">
                  <NativeSelect id="rf-area" value={f.area} onChange={(e) => set("area", e.target.value)}>
                    <option value="">All areas</option>
                    {areas.map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </NativeSelect>
                </Field>
              )}
            </div>
            {def.filters.includes("period") && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {presets.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => setPeriod(p.from, p.to)}
                    className={cn("rounded-full px-3 py-1 text-xs transition", f.from === p.from && f.to === p.to ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground")}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className={cn("mb-4 flex flex-wrap items-start gap-x-6 gap-y-2 rounded-xl border px-4 py-3 text-sm", allOk ? "border-success/30 bg-success-soft/60" : "border-destructive/30 bg-danger-soft")}>
          {res.checks.map((c) => (
            <div key={c.label} className="flex items-start gap-2">
              {c.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />}
              <div>
                <div className="font-medium">{c.label}</div>
                <div className="text-xs text-muted-foreground">{c.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      {res.rows.length ? (
        <>
          <div className="print-wide max-h-[640px] overflow-auto rounded-xl border border-border/70 bg-card shadow-soft print:border-0 print:shadow-none">
            <table className="w-full text-sm print:text-[8pt]">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border/70 bg-muted text-left text-xs text-muted-foreground">
                  {res.columns.map((c) => {
                    const right = c.kind === "money" || c.kind === "qty" || c.kind === "pct";
                    return (
                      <th
                        key={c.key}
                        onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 1 ? -1 : 1 } : { key: c.key, dir: right ? -1 : 1 }))}
                        className={cn("cursor-pointer select-none whitespace-nowrap px-3 py-2.5 font-medium hover:text-foreground", right && "text-right")}
                      >
                        {c.header}
                        {sort?.key === c.key && (sort.dir === 1 ? " ↑" : " ↓")}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {shown.map((i) => {
                  const r: Row = res.rows[i];
                  const href = res.hrefs?.[i];
                  return (
                    <tr key={i} onClick={href ? () => navigate(href) : undefined} className={cn("border-b border-border/50", href && "cursor-pointer hover:bg-accent/40")}>
                      {res.columns.map((c) => {
                        const right = c.kind === "money" || c.kind === "qty" || c.kind === "pct";
                        return (
                          <td key={c.key} className={cn("px-3 py-2 align-top", right && "whitespace-nowrap text-right tabular", (c.kind === "date" || c.kind === "datetime" || String(r[c.key] ?? "").length < 34) && "whitespace-nowrap", String(r[c.key] ?? "").length >= 34 && "min-w-[240px]")}>
                            {display(db, c, r[c.key])}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
              {hasTotals && (
                <tfoot className="sticky bottom-0">
                  <tr className="border-t-2 border-border bg-muted font-semibold">
                    {res.columns.map((c, idx) => {
                      const right = c.kind === "money" || c.kind === "qty" || c.kind === "pct";
                      return (
                        <td key={c.key} className={cn("px-3 py-2.5", right && "whitespace-nowrap text-right tabular")}>
                          {idx === 0 ? `Total (${num(res.rows.length)} rows)` : c.total ? display(db, c, res.totals[c.key]) : ""}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {!showAll && order.length > LIMIT && (
            <div className="no-print mt-3 flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Showing the first {num(LIMIT)} of {num(order.length)} rows. Totals and exports include every row.
              </span>
              <Button variant="outline" size="sm" onClick={() => setShowAll(true)}>
                Show all rows
              </Button>
            </div>
          )}
        </>
      ) : (
        <EmptyState title="Nothing in this report for these filters" description="Widen the date range or clear a filter." />
      )}
      <div className="no-print mt-3 flex justify-end">
        <StatusBadge tone="neutral" dot={false}>
          Generated {dateTime(now)} from live records
        </StatusBadge>
      </div>
    </div>
  );
}
