// Building blocks used across the staff console, the consultant app and the public site.

import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, FileSpreadsheet, Inbox, Printer, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { downloadExcel, downloadText, toCsv } from "@/lib/fc";
import type { TimelineEvent } from "@/domain/types";
import { dateTime } from "@/domain/format";

// ---------- status chips ----------

export type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info" | "plum";

const TONES: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground ring-border",
  brand: "bg-brand-soft text-primary ring-primary/20",
  success: "bg-success-soft text-success ring-success/20",
  warning: "bg-warning-soft text-warning ring-warning/25",
  danger: "bg-danger-soft text-destructive ring-destructive/20",
  info: "bg-info-soft text-info ring-info/20",
  plum: "bg-[oklch(0.95_0.03_330)] text-plum ring-plum/20 dark:bg-[oklch(0.3_0.05_330)]",
};

export function StatusBadge({ tone = "neutral", children, dot = true, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", TONES[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current opacity-80" />}
      {children}
    </span>
  );
}

/** Tone for common status words, so the same status always looks the same. */
export function toneFor(status: string): Tone {
  const s = status.toLowerCase();
  if (/(paid|delivered|active|approved|verified|recorded|done|closed and paid|in stock|success|qualified|locked|completed)/.test(s)) return "success";
  if (/(overdue|failed|rejected|terminated|cancel|declined|out of stock|wrong|refunded|lost)/.test(s)) return "danger";
  if (/(pending|awaiting|waiting|part|back-order|backorder|uploaded|held|suspended|requested|recount|draft|low|expir|on hold)/.test(s)) return "warning";
  if (/(dispatched|packed|packing|ready|open|issued|submitted|counting|to pick|expected|processing|placed|confirmed|picking|prepared)/.test(s)) return "info";
  return "neutral";
}

export function Status({ children }: { children: string }) {
  return <StatusBadge tone={toneFor(children)}>{children}</StatusBadge>;
}

// ---------- layout ----------

export function PageHeader({
  title,
  description,
  actions,
  back,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { to: string; label: string };
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 pt-2 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {back && (
          <Link to={back.to} className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="size-4" />
            {back.label}
          </Link>
        )}
        {eyebrow && <div className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary">{eyebrow}</div>}
        <h1 className="font-display text-2xl font-semibold leading-tight md:text-[1.75rem]">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, description, actions, children, className, bodyClassName }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <Card className={cn("gap-0 overflow-hidden rounded-2xl border-border/70 py-0 shadow-soft", className)}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="text-[0.95rem] font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </Card>
  );
}

export function Kpi({
  label,
  value,
  sub,
  icon,
  tone = "brand",
  to,
  trend,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  to?: string;
  trend?: { value: number; label?: string };
}) {
  const body = (
    <Card className={cn("group relative gap-0 overflow-hidden rounded-2xl border-border/70 p-4 shadow-soft transition", to && "hover:-translate-y-0.5 hover:shadow-lift")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground">{label}</div>
          <div className="mt-1.5 font-display text-2xl font-semibold tabular leading-none">{value}</div>
          {sub && <div className="mt-1.5 text-xs text-muted-foreground">{sub}</div>}
          {trend && (
            <div className={cn("mt-1.5 inline-flex items-center gap-0.5 text-xs font-medium", trend.value >= 0 ? "text-success" : "text-destructive")}>
              {trend.value >= 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
              {Math.abs(trend.value).toFixed(0)}% {trend.label ?? "vs last month"}
            </div>
          )}
        </div>
        {icon && <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset", TONES[tone])}>{icon}</div>}
      </div>
    </Card>
  );
  return to ? (
    <Link to={to} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-12 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-primary">{icon ?? <Inbox className="size-5" />}</div>
      <div className="font-medium">{title}</div>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function KeyValue({ items, cols = 2 }: { items: [ReactNode, ReactNode][]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-3 text-sm", cols === 2 && "sm:grid-cols-2", cols === 3 && "sm:grid-cols-3")}>
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{k}</dt>
          <dd className="mt-0.5 break-words font-medium">{v || <span className="text-muted-foreground">Not given</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Timeline({ events, nameOf }: { events: TimelineEvent[]; nameOf: (id?: string) => string }) {
  const list = [...events].reverse();
  return (
    <ol className="relative space-y-4 border-l border-border pl-5">
      {list.map((e, i) => (
        <li key={i} className="relative">
          <span className={cn("absolute -left-[1.6rem] top-1 size-2.5 rounded-full ring-4 ring-card", i === 0 ? "bg-primary" : "bg-muted-foreground/40")} />
          <div className="text-sm">{e.text}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {dateTime(e.ts)}
            {e.by && ` · ${nameOf(e.by)}`}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Stepper for two-track order status. */
export function Steps({ steps, current, failed }: { steps: string[]; current: number; failed?: boolean }) {
  return (
    <div className="flex items-center gap-1">
      {steps.map((s, i) => (
        <div key={s} className="flex flex-1 flex-col items-center gap-1.5">
          <div className="flex w-full items-center">
            <div className={cn("h-1 flex-1 rounded-full", i === 0 ? "bg-transparent" : i <= current ? "bg-primary" : "bg-border")} />
            <div
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-semibold",
                failed && i === current ? "bg-destructive text-white" : i <= current ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground ring-1 ring-border",
              )}
            >
              {i + 1}
            </div>
            <div className={cn("h-1 flex-1 rounded-full", i === steps.length - 1 ? "bg-transparent" : i < current ? "bg-primary" : "bg-border")} />
          </div>
          <div className={cn("text-center text-[0.68rem] leading-tight", i <= current ? "font-medium text-foreground" : "text-muted-foreground")}>{s}</div>
        </div>
      ))}
    </div>
  );
}

export function ProgressBar({ value, max, tone = "brand", className }: { value: number; max: number; tone?: Tone; className?: string }) {
  const pct = Math.max(0, Math.min(100, max ? (value / max) * 100 : 0));
  const color = tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : tone === "danger" ? "bg-destructive" : "bg-primary";
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div className={cn("h-full rounded-full transition-all duration-700", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ---------- reason dialog ----------

export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  destructive,
  onConfirm,
  placeholder = "Reason",
  children,
  requireReason = true,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: (reason: string) => boolean | void;
  placeholder?: string;
  children?: ReactNode;
  requireReason?: boolean;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        <div className="grid gap-2">
          <Label htmlFor="reason">Reason{requireReason ? "" : " (optional)"}</Label>
          <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={placeholder} rows={3} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={requireReason && !reason.trim()}
            onClick={() => {
              const res = onConfirm(reason.trim());
              if (res !== false) {
                setReason("");
                onOpenChange(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- simple table with search, sort, paging and export ----------

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Plain value for sorting and export. */
  value?: (row: T) => string | number | undefined;
  align?: "left" | "right" | "center";
  className?: string;
  hideOnMobile?: boolean;
}

export function SimpleTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  rowHref,
  searchable = true,
  searchText,
  pageSize = 15,
  exportName,
  empty,
  toolbar,
  defaultSort,
  dense,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  rowHref?: (row: T) => string;
  searchable?: boolean;
  searchText?: (row: T) => string;
  pageSize?: number;
  exportName?: string;
  empty?: ReactNode;
  toolbar?: ReactNode;
  defaultSort?: { key: string; dir: "asc" | "desc" };
  dense?: boolean;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState(defaultSort);
  const [page, setPage] = useState(0);
  const filtered = useMemo(() => {
    let r = rows;
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      r = r.filter((row) =>
        (searchText ? searchText(row) : columns.map((c) => String(c.value?.(row) ?? "")).join(" ")).toLowerCase().includes(needle),
      );
    }
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col?.value) {
        r = [...r].sort((a, b) => {
          const va = col.value!(a);
          const vb = col.value!(b);
          const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va ?? "").localeCompare(String(vb ?? ""));
          return sort.dir === "asc" ? cmp : -cmp;
        });
      }
    }
    return r;
  }, [rows, q, sort, columns, searchText]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const p = Math.min(page, pages - 1);
  const shown = filtered.slice(p * pageSize, p * pageSize + pageSize);
  const exportable = columns.filter((c) => c.value);
  const exportRows = () => filtered.map((r) => exportable.map((c) => c.value!(r)));
  return (
    <div className="space-y-3">
      {(searchable || exportName || toolbar) && (
        <div className="flex flex-wrap items-center gap-2">
          {searchable && (
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(0);
                }}
                placeholder="Search"
                className="h-9 pl-9"
              />
            </div>
          )}
          {toolbar}
          {exportName && (
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" onClick={() => void downloadExcel(`${exportName}.xlsx`, exportable.map((c) => c.header), exportRows())}>
                <FileSpreadsheet className="size-4" /> Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => downloadText(`${exportName}.csv`, toCsv([exportable.map((c) => c.header), ...exportRows()]))}>
                <Download className="size-4" /> CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => window.print()} className="hidden sm:inline-flex">
                <Printer className="size-4" /> PDF
              </Button>
            </div>
          )}
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-border/70 bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/70 bg-muted/50 text-left text-xs text-muted-foreground">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    "whitespace-nowrap px-3 py-2.5 font-medium",
                    c.align === "right" && "text-right",
                    c.align === "center" && "text-center",
                    c.hideOnMobile && "hidden md:table-cell",
                    c.value && "cursor-pointer select-none hover:text-foreground",
                  )}
                  onClick={() => c.value && setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === "asc" ? "desc" : "asc" } : { key: c.key, dir: "asc" }))}
                >
                  {c.header}
                  {sort?.key === c.key && (sort.dir === "asc" ? " ↑" : " ↓")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const href = rowHref?.(r);
              return (
                <tr
                  key={rowKey(r)}
                  className={cn("border-b border-border/50 last:border-0", (onRowClick || href) && "cursor-pointer hover:bg-accent/50")}
                  onClick={() => (onRowClick ? onRowClick(r) : undefined)}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        dense ? "px-3 py-2" : "px-3 py-3",
                        "align-middle",
                        c.align === "right" && "text-right tabular",
                        c.align === "center" && "text-center",
                        c.hideOnMobile && "hidden md:table-cell",
                        c.className,
                      )}
                    >
                      {href && c === columns[0] ? (
                        <Link to={href} className="font-medium text-foreground hover:text-primary" onClick={(e) => e.stopPropagation()}>
                          {c.cell(r)}
                        </Link>
                      ) : (
                        c.cell(r)
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!shown.length && <div className="p-6">{empty ?? <EmptyState title="Nothing to show" description={q ? "No records match your search." : undefined} />}</div>}
      </div>
      {filtered.length > pageSize && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {p * pageSize + 1}–{Math.min(filtered.length, (p + 1) * pageSize)} of {filtered.length}
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="icon-sm" disabled={p === 0} onClick={() => setPage(p - 1)} aria-label="Previous page">
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="outline" size="icon-sm" disabled={p >= pages - 1} onClick={() => setPage(p + 1)} aria-label="Next page">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Tab strip that drives a filter. */
export function FilterTabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition",
            value === o.value ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
          {o.count !== undefined && <span className={cn("rounded-full px-1.5 text-[0.7rem] tabular", value === o.value ? "bg-background/20" : "bg-background")}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
