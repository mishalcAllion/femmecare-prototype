// S42 Audit log: who did what and when, with before and after values. Read-only.

import { DateInput } from "@/components/fc/date-input";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { ArrowRight, ScrollText } from "lucide-react";
import { useDb } from "@/domain/db";
import { dateTime, dayKey } from "@/domain/format";
import type { AuditEntry } from "@/domain/types";
import { actorName } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { Guard } from "@/staff/guard";
import { EmptyState, KeyValue, PageHeader, SimpleTable, StatusBadge } from "@/components/fc/ui";
import { NativeSelect } from "@/components/fc/docs";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Field } from "../inventory/shared";

export function AuditPage() {
  return (
    <Guard perms={["audit.view"]}>
      <Audit />
    </Guard>
  );
}

function Audit() {
  usePageTitle("Audit log");
  const db = useDb();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState<AuditEntry>();
  const area = params.get("area") ?? "";
  const person = params.get("by") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  const areas = useMemo(() => [...new Set(db.audit.map((a) => a.area))].sort(), [db.audit]);
  const people = useMemo(() => {
    const ids = [...new Set(db.audit.map((a) => a.by))];
    const staff = ids.filter((id) => db.users.some((u) => u.id === id));
    const others = ids.filter((id) => !staff.includes(id));
    return [
      ...staff.map((id) => ({ id, name: actorName(db, id) })).sort((a, b) => a.name.localeCompare(b.name)),
      ...(others.some((id) => db.consultants.some((c) => c.id === id)) ? [{ id: "__consultants", name: `Any ${db.settings.labels.consultant.toLowerCase()}` }] : []),
      ...others.filter((id) => !db.consultants.some((c) => c.id === id)).map((id) => ({ id, name: actorName(db, id) })),
    ];
  }, [db]);
  const rows = useMemo(
    () =>
      db.audit.filter(
        (a) =>
          (!area || a.area === area) &&
          (!person || (person === "__consultants" ? db.consultants.some((c) => c.id === a.by) : a.by === person)) &&
          (!from || dayKey(a.ts) >= from) &&
          (!to || dayKey(a.ts) <= to),
      ),
    [db, area, person, from, to],
  );
  return (
    <div className="animate-rise">
      <PageHeader title="Audit log" description="Every change made in the system: who, when, what, the old and new value and the reason. Entries cannot be edited or deleted." />
      <div className="mb-4 grid gap-3 rounded-2xl border border-border/70 bg-card p-4 shadow-soft sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Area" htmlFor="au-area">
          <NativeSelect id="au-area" value={area} onChange={(e) => set("area", e.target.value)}>
            <option value="">All areas</option>
            {areas.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Person" htmlFor="au-by">
          <NativeSelect id="au-by" value={person} onChange={(e) => set("by", e.target.value)}>
            <option value="">Everyone</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="From" htmlFor="au-from">
          <DateInput id="au-from" value={from} onChange={(e) => set("from", e.target.value)} />
        </Field>
        <Field label="To" htmlFor="au-to">
          <DateInput id="au-to" value={to} onChange={(e) => set("to", e.target.value)} />
        </Field>
      </div>
      <SimpleTable
        rows={rows}
        rowKey={(a) => a.id}
        onRowClick={setOpen}
        exportName="audit-log"
        pageSize={25}
        dense
        searchText={(a) => `${a.action} ${a.area} ${actorName(db, a.by)} ${a.entityId ?? ""} ${a.before ?? ""} ${a.after ?? ""} ${a.reason ?? ""}`}
        columns={[
          { key: "ts", header: "When", cell: (a) => <span className="whitespace-nowrap">{dateTime(a.ts)}</span>, value: (a) => a.ts },
          { key: "by", header: "Who", cell: (a) => actorName(db, a.by), value: (a) => actorName(db, a.by) },
          { key: "area", header: "Area", cell: (a) => <StatusBadge dot={false}>{a.area}</StatusBadge>, value: (a) => a.area },
          { key: "action", header: "What", cell: (a) => <span className="font-medium">{a.action}</span>, value: (a) => a.action },
          {
            key: "change",
            header: "Before → after",
            cell: (a) =>
              a.before || a.after ? (
                <span className="flex max-w-[360px] items-center gap-1.5 text-xs">
                  {a.before && <span className="truncate text-muted-foreground line-through decoration-muted-foreground/40">{a.before}</span>}
                  {a.before && a.after && <ArrowRight className="size-3 shrink-0 text-muted-foreground" />}
                  {a.after && <span className="truncate">{a.after}</span>}
                </span>
              ) : (
                ""
              ),
            value: (a) => [a.before, a.after].filter(Boolean).join(" -> "),
          },
          { key: "reason", header: "Reason", cell: (a) => <span className="line-clamp-1 max-w-[220px] text-xs text-muted-foreground">{a.reason}</span>, value: (a) => a.reason ?? "", hideOnMobile: true },
        ]}
        defaultSort={{ key: "ts", dir: "desc" }}
        empty={<EmptyState icon={<ScrollText className="size-5" />} title="No entries match" description="Change the filters to see more of the log." />}
      />
      <Sheet open={!!open} onOpenChange={(v) => !v && setOpen(undefined)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {open && (
            <>
              <SheetHeader>
                <SheetTitle>{open.action}</SheetTitle>
                <SheetDescription>
                  {dateTime(open.ts)} · {actorName(db, open.by)}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-6">
                <KeyValue
                  cols={1}
                  items={[
                    ["Area", open.area],
                    ["Record", open.entityId],
                    ["Who", actorName(db, open.by)],
                    ["When", dateTime(open.ts)],
                    ["Reason", open.reason],
                  ]}
                />
                {(open.before || open.after) && (
                  <div className="grid gap-3">
                    <div className="rounded-xl bg-danger-soft/50 p-3">
                      <div className="mb-1 text-xs font-medium text-muted-foreground">Before</div>
                      <div className="whitespace-pre-wrap break-words text-sm">{open.before || "Nothing"}</div>
                    </div>
                    <div className="rounded-xl bg-success-soft/60 p-3">
                      <div className="mb-1 text-xs font-medium text-muted-foreground">After</div>
                      <div className="whitespace-pre-wrap break-words text-sm">{open.after || "Nothing"}</div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
