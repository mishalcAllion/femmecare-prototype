// S40 Users and roles: staff list, invite, edit roles, deactivate, and the role matrix
// generated from the permissions the system actually enforces.

import { useState } from "react";
import { Check, Mail, Minus, Pencil, UserPlus } from "lucide-react";
import { useDb } from "@/domain/db";
import { actions } from "@/domain/actions";
import { permissionsOf, ROLES, type Permission } from "@/domain/permissions";
import { dateTime, relative } from "@/domain/format";
import type { RoleId, StaffUser } from "@/domain/types";
import { act, useNow, useStaffUser } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { Guard } from "@/staff/guard";
import { PageHeader, Panel, SimpleTable, Status, StatusBadge } from "@/components/fc/ui";
import { Avatar } from "@/components/fc/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "../inventory/shared";

const ROLE_IDS = Object.keys(ROLES) as RoleId[];

/** Plain-language names for each permission, grouped by area, for the role matrix. */
export const PERMISSION_GROUPS: { area: string; items: [Permission, string][] }[] = [
  { area: "Administration", items: [["users.manage", "Manage users and roles"], ["settings.view", "View settings"], ["settings.edit", "Change settings"], ["audit.view", "View and export the audit log"]] },
  { area: "Products and stock", items: [["products.view", "View products and prices"], ["products.edit", "Add and edit products and prices"], ["labels.print", "Print barcode labels"], ["stock.view.all", "View stock, both channels"], ["stock.view.outlet", "View outlet stock only"], ["stock.view.consultant", "View consultant stock only"], ["grn.view", "View goods received"], ["grn.record", "Record goods received"], ["transfer.request", "Request a stock move"], ["transfer.approve", "Approve a stock move"], ["count.do", "Count stock"], ["count.approve", "Approve a count (not their own)"]] },
  { area: "Retail outlets", items: [["outlets.view", "View outlets"], ["outlets.edit", "Register and edit outlets"], ["outletOrders.view", "View outlet orders"], ["outletOrders.edit", "Enter orders, manage back-orders"], ["invoices.view", "View invoices and delivery notes"], ["invoices.issue", "Issue and email invoices"], ["invoices.cancel", "Cancel an invoice"], ["outletPayments.view", "View outlet payments"], ["outletPayments.record", "Record outlet payments"], ["pod.confirm", "Upload and confirm signed delivery notes"], ["pod.view", "View signed delivery notes"]] },
  { area: "Logistics", items: [["dispatch.view", "View the dispatch board"], ["dispatch.outlet", "Pick, pack and dispatch outlet orders"], ["dispatch.consultant", "Pack and hand consultant orders to the courier"]] },
  { area: "Consultants", items: [["applications.view", "View applications"], ["applications.decide", "Approve or reject applications"], ["consultants.view", "View consultant records"], ["consultants.edit", "Change consultant status"], ["sponsor.change", "Change a sponsor"], ["consultantOrders.view", "View consultant orders"], ["consultantOrders.manage", "Manage consultant orders"], ["payments.verify", "Verify bank transfers"], ["refunds.request", "Request a cancellation or refund"], ["refunds.approve", "Approve a refund"]] },
  { area: "Commission and payouts", items: [["bank.verify", "Verify bank-detail changes"], ["commission.view", "View commission"], ["month.close", "Close the month"], ["payout.view", "View payouts and statements"], ["payout.approve", "Approve payouts, bank file and results"]] },
  { area: "Dashboards and reports", items: [["dashboard.management", "Management dashboard"], ["dashboard.outlet", "Outlet dashboard"], ["reports.outlet", "Outlet reports"], ["reports.stock", "Stock reports"], ["reports.consultant", "Consultant reports"], ["reports.finance", "Finance reports"]] },
];

export function UsersPage() {
  return (
    <Guard perms={["users.manage"]}>
      <Users />
    </Guard>
  );
}

function Users() {
  usePageTitle("Users and roles");
  const db = useDb();
  const now = useNow();
  const me = useStaffUser();
  const [editing, setEditing] = useState<StaffUser | "new">();
  const activeAdmins = db.users.filter((u) => u.status === "active" && u.roles.includes("admin")).length;
  const toggleStatus = (u: StaffUser) => {
    const next: StaffUser = { ...u, roles: [...u.roles], status: u.status === "active" ? "inactive" : "active" };
    act(actions.saveUser(next), `${u.name} ${next.status === "active" ? "reactivated" : "deactivated"}`);
  };
  return (
    <div className="animate-rise">
      <PageHeader
        title="Users and roles"
        description="Staff sign in with their email and a one-time code. A person can hold several roles. Roles are fixed; what each can do is shown under Role matrix."
        actions={
          <Button onClick={() => setEditing("new")}>
            <UserPlus className="size-4" /> Invite a user
          </Button>
        }
      />
      <Tabs defaultValue="users">
        <TabsList className="mb-4">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="matrix">Role matrix</TabsTrigger>
        </TabsList>
        <TabsContent value="users">
          <SimpleTable
            rows={db.users}
            rowKey={(u) => u.id}
            exportName="staff-users"
            columns={[
              {
                key: "name",
                header: "Name",
                cell: (u) => (
                  <span className="flex items-center gap-3">
                    <Avatar name={u.name} hue={u.avatarHue} size="sm" />
                    <span>
                      <span className="block font-medium">
                        {u.name}
                        {u.id === me?.id && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>}
                      </span>
                      <span className="block text-xs text-muted-foreground">{u.title}</span>
                    </span>
                  </span>
                ),
                value: (u) => u.name,
              },
              { key: "email", header: "Email", cell: (u) => u.email, value: (u) => u.email },
              {
                key: "roles",
                header: "Roles",
                cell: (u) => (
                  <span className="flex flex-wrap gap-1">
                    {u.roles.map((r) => (
                      <StatusBadge key={r} tone={r === "admin" ? "brand" : "neutral"} dot={false}>
                        {ROLES[r].label}
                      </StatusBadge>
                    ))}
                  </span>
                ),
                value: (u) => u.roles.map((r) => ROLES[r].label).join(", "),
              },
              { key: "status", header: "Status", cell: (u) => <Status>{u.status === "active" ? "Active" : "Inactive"}</Status>, value: (u) => u.status },
              { key: "last", header: "Last sign-in", cell: (u) => (u.lastSignIn ? <span title={dateTime(u.lastSignIn)}>{relative(u.lastSignIn, now)}</span> : <span className="text-muted-foreground">{u.id === me?.id ? "Signed in now" : "Not yet"}</span>), value: (u) => u.lastSignIn ?? "" },
              {
                key: "actions",
                header: "",
                cell: (u) => {
                  const lastAdmin = u.status === "active" && u.roles.includes("admin") && activeAdmins === 1;
                  return (
                    <span className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(u)}>
                        <Pencil className="size-3.5" /> Roles
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => toggleStatus(u)} title={lastAdmin ? "At least one active Administrator is needed" : undefined}>
                        {u.status === "active" ? "Deactivate" : "Reactivate"}
                      </Button>
                    </span>
                  );
                },
              },
            ]}
          />
          <p className="mt-3 text-xs text-muted-foreground">
            {activeAdmins} active Administrator{activeAdmins > 1 ? "s" : ""}. The last active Administrator cannot be removed or deactivated.
          </p>
        </TabsContent>
        <TabsContent value="matrix">
          <RoleMatrix />
        </TabsContent>
      </Tabs>
      {editing && <UserDialog user={editing === "new" ? undefined : editing} onClose={() => setEditing(undefined)} />}
    </div>
  );
}

function RoleMatrix() {
  const matrix = Object.fromEntries(ROLE_IDS.map((r) => [r, new Set(permissionsOf(r))])) as Record<RoleId, Set<Permission>>;
  return (
    <Panel title="Role matrix" description="What each role can do. This table is read from the same rules the system uses to show menus and allow actions." bodyClassName="p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-border/70 bg-muted/50 text-xs text-muted-foreground">
              <th className="px-4 py-2.5 text-left font-medium">Permission</th>
              {ROLE_IDS.map((r) => (
                <th key={r} className="px-2 py-2.5 text-center font-medium" title={ROLES[r].description}>
                  {ROLES[r].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_GROUPS.map((g) => (
              <MatrixGroup key={g.area} group={g} matrix={matrix} />
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function MatrixGroup({ group, matrix }: { group: (typeof PERMISSION_GROUPS)[number]; matrix: Record<RoleId, Set<Permission>> }) {
  return (
    <>
      <tr className="bg-brand-soft/40">
        <td colSpan={ROLE_IDS.length + 1} className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-primary">
          {group.area}
        </td>
      </tr>
      {group.items.map(([p, label]) => (
        <tr key={p} className="border-b border-border/40">
          <td className="px-4 py-2">{label}</td>
          {ROLE_IDS.map((r) => (
            <td key={r} className="px-2 py-2 text-center">
              {matrix[r].has(p) ? <Check className="mx-auto size-4 text-success" aria-label="Yes" /> : <Minus className="mx-auto size-3.5 text-muted-foreground/40" aria-label="No" />}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function UserDialog({ user, onClose }: { user?: StaffUser; onClose: () => void }) {
  const db = useDb();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [title, setTitle] = useState(user?.title ?? "");
  const [roles, setRoles] = useState<RoleId[]>(user?.roles ?? []);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const valid = name.trim() && emailOk && roles.length > 0;
  const save = () => {
    const nextId = `USR-${String(db.users.reduce((m, u) => Math.max(m, Number(u.id.replace(/\D/g, "")) || 0), 0) + 1).padStart(2, "0")}`;
    const u: StaffUser = user
      ? { ...user, name: name.trim(), title: title.trim(), roles: [...roles] }
      : { id: nextId, name: name.trim(), email: email.trim().toLowerCase(), title: title.trim(), roles: [...roles], status: "active", avatarHue: (db.users.length * 47) % 360 };
    const r = act(actions.saveUser(u), user ? `${u.name}'s roles saved` : `Invitation sent to ${u.email}`);
    if (r !== undefined) onClose();
  };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{user ? `Roles for ${user.name}` : "Invite a user"}</DialogTitle>
          <DialogDescription>{user ? "Tick every role this person holds. Changes apply the next time they open a page." : "They get an email with a link to the staff console and sign in with a one-time code."}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name" htmlFor="u-name">
              <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Job title" htmlFor="u-title">
              <Input id="u-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Stores assistant" />
            </Field>
            <Field label="Work email" htmlFor="u-email" className="sm:col-span-2" error={email && !emailOk ? "Enter a valid email address" : undefined}>
              <Input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!!user} placeholder="name@femmecare.lk" />
            </Field>
          </div>
          <div className="grid gap-2">
            <div className="text-xs font-medium">Roles</div>
            {ROLE_IDS.map((r) => (
              <label key={r} className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/70 px-3 py-2 hover:bg-accent/40">
                <Checkbox className="mt-0.5" checked={roles.includes(r)} onCheckedChange={(v) => setRoles((cur) => (v ? [...cur, r] : cur.filter((x) => x !== r)))} />
                <span className="text-sm">
                  <span className="font-medium">{ROLES[r].label}</span>
                  <span className="block text-xs text-muted-foreground">{ROLES[r].description}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!valid} onClick={save}>
            {user ? "Save roles" : (
              <>
                <Mail className="size-4" /> Send invitation
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
