// S28 Consultants list: status tabs, search, team size, this month's sales and joining date.

import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { ShoppingBag, UserCheck, UserPlus, Users } from "lucide-react";
import { EmptyState, FilterTabs, Kpi, PageHeader, SimpleTable, Status, StatusBadge, type Column } from "@/components/fc/ui";
import { useDb } from "@/domain/db";
import { consultantById, fullName, STATUS_LABEL } from "@/domain/consultants";
import { salesByConsultant } from "@/domain/commission";
import { consultantCode, date, lkr, monthKey, monthLabel } from "@/domain/format";
import type { Consultant } from "@/domain/types";
import { useNow } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { Guard } from "../../guard";
import { ConsultantCell, useLabel } from "./shared";

type Tab = "all" | "active" | "suspended" | "terminated";

export function ConsultantsListPage() {
  return (
    <Guard perms={["consultants.view"]}>
      <ConsultantsList />
    </Guard>
  );
}

function ConsultantsList() {
  const L = useLabel();
  usePageTitle(L.many);
  const db = useDb();
  const now = useNow();
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>("active");
  const month = monthKey(now);
  const sales = useMemo(() => salesByConsultant(db, month, db.settings.commission), [db, month]);
  const teamSize = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of db.consultants) if (c.sponsorId && c.number !== undefined) m.set(c.sponsorId, (m.get(c.sponsorId) ?? 0) + 1);
    return m;
  }, [db]);
  const all = useMemo(() => db.consultants.filter((c) => c.number !== undefined), [db]);
  const rows = tab === "all" ? all : all.filter((c) => c.status === tab);
  const count = (s: Consultant["status"]) => all.filter((c) => c.status === s).length;
  const joinedThisMonth = all.filter((c) => c.joinedAt && monthKey(c.joinedAt) === month).length;
  const ordered = [...sales.keys()].length;
  const base = db.settings.commission.base === "mrp" ? "MRP value" : "net sales";
  const cols: Column<Consultant>[] = [
    { key: "name", header: L.one, cell: (c) => <ConsultantCell c={c} link={false} />, value: (c) => `${fullName(c)} ${consultantCode(c.number)}` },
    {
      key: "sponsor",
      header: "Sponsor",
      cell: (c) => {
        const s = consultantById(db, c.sponsorId);
        return s ? <span className="text-sm">{fullName(s)}</span> : <span className="text-muted-foreground">None</span>;
      },
      value: (c) => fullName(consultantById(db, c.sponsorId) ?? { givenName: "", surname: "" }),
      hideOnMobile: true,
    },
    { key: "team", header: "Team", align: "right", className: "whitespace-nowrap", cell: (c) => teamSize.get(c.id) ?? 0, value: (c) => teamSize.get(c.id) ?? 0 },
    { key: "sales", header: `Sales, ${monthLabel(month, false)}`, align: "right", className: "whitespace-nowrap", cell: (c) => (sales.get(c.id) ? lkr(sales.get(c.id)!) : <span className="text-muted-foreground">None</span>), value: (c) => sales.get(c.id) ?? 0 },
    { key: "city", header: "City", cell: (c) => c.city, value: (c) => c.city, hideOnMobile: true },
    { key: "joined", header: "Joined", cell: (c) => date(c.joinedAt), value: (c) => c.joinedAt ?? "" },
    {
      key: "bank",
      header: "Bank",
      cell: (c) =>
        c.pendingBank ? <StatusBadge tone="warning">Change waiting</StatusBadge> : c.bankVerified ? <StatusBadge tone="success">Verified</StatusBadge> : <StatusBadge tone="warning">Not verified</StatusBadge>,
      value: (c) => (c.pendingBank ? "Change waiting" : c.bankVerified ? "Verified" : "Not verified"),
      hideOnMobile: true,
    },
    { key: "status", header: "Status", cell: (c) => <Status>{STATUS_LABEL[c.status]}</Status>, value: (c) => STATUS_LABEL[c.status] },
  ];
  return (
    <div className="animate-rise">
      <PageHeader title={L.many} description={`Everyone who sells FemmeCare, their sponsor and team, and their sales this month (${base}).`} />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label={`Active ${L.lowerMany}`} value={count("active")} icon={<Users className="size-5" />} />
        <Kpi label={`Joined in ${monthLabel(month, false)}`} value={joinedThisMonth} icon={<UserPlus className="size-5" />} tone="plum" />
        <Kpi label={`Ordered in ${monthLabel(month, false)}`} value={ordered} sub={`of ${count("active")} active`} icon={<ShoppingBag className="size-5" />} tone="info" />
        <Kpi label="Suspended" value={count("suspended")} sub={`${count("terminated")} terminated`} icon={<UserCheck className="size-5" />} tone="warning" />
      </div>
      <SimpleTable
        rows={rows}
        columns={cols}
        rowKey={(c) => c.id}
        rowHref={(c) => `/staff/consultants/${c.id}`}
        onRowClick={(c) => nav(`/staff/consultants/${c.id}`)}
        exportName={`${L.lowerMany}-${tab}`}
        defaultSort={{ key: "name", dir: "asc" }}
        searchText={(c) => `${fullName(c)} ${consultantCode(c.number)} ${c.number} ${c.mobile} ${c.email} ${c.city}`}
        toolbar={
          <FilterTabs
            value={tab}
            onChange={setTab}
            options={[
              { value: "active", label: "Active", count: count("active") },
              { value: "suspended", label: "Suspended", count: count("suspended") },
              { value: "terminated", label: "Terminated", count: count("terminated") },
              { value: "all", label: "All", count: all.length },
            ]}
          />
        }
        empty={<EmptyState icon={<Users className="size-5" />} title={`No ${L.lowerMany} here`} description="Try another tab or clear the search." />}
      />
    </div>
  );
}
