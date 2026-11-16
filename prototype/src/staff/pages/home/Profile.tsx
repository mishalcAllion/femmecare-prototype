// My profile: the signed-in staff member's details and roles (read-only).

import { Link } from "react-router";
import { ShieldCheck } from "lucide-react";
import { useDb } from "@/domain/db";
import { ROLES } from "@/domain/permissions";
import { dateTime, relative } from "@/domain/format";
import { useNow, useStaffUser } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { KeyValue, PageHeader, Panel, Status, StatusBadge } from "@/components/fc/ui";
import { Avatar } from "@/components/fc/brand";

export function ProfilePage() {
  usePageTitle("My profile");
  const db = useDb();
  const now = useNow();
  const user = useStaffUser();
  if (!user) return null;
  const recent = db.audit.filter((a) => a.by === user.id && a.area !== "Sign-in").slice(0, 8);
  const signIns = db.audit.filter((a) => a.by === user.id && a.area === "Sign-in");
  const previous = signIns[1]?.ts;
  return (
    <div className="animate-rise">
      <PageHeader title="My profile" description="Your details and what your roles let you do. Ask an Administrator to change your name or roles." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel>
          <div className="mb-5 flex items-center gap-4">
            <Avatar name={user.name} hue={user.avatarHue} size="xl" />
            <div>
              <div className="font-display text-xl font-semibold">{user.name}</div>
              <div className="text-sm text-muted-foreground">{user.title}</div>
              <div className="mt-1">
                <Status>{user.status === "active" ? "Active" : "Inactive"}</Status>
              </div>
            </div>
          </div>
          <KeyValue
            items={[
              ["Email", user.email],
              ["Sign-in", "Email and a one-time code"],
              ["Signed in", user.lastSignIn ? `${dateTime(user.lastSignIn)} (${relative(user.lastSignIn, now)})` : "This session"],
              ["Previous sign-in", previous ? dateTime(previous) : "None recorded"],
            ]}
          />
        </Panel>
        <Panel title="Roles">
          <div className="space-y-3">
            {user.roles.map((r) => (
              <div key={r} className="flex items-start gap-3 rounded-xl bg-muted/40 p-3">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                <div>
                  <div className="text-sm font-medium">{ROLES[r].label}</div>
                  <div className="text-xs text-muted-foreground">{ROLES[r].description}</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <Panel title="Your recent changes" className="mt-6" actions={user.roles.some((r) => r === "admin" || r === "finance" || r === "management") ? <Link to={`/staff/audit?by=${user.id}`} className="text-xs font-medium text-primary hover:underline">Audit log</Link> : undefined}>
        {recent.length ? (
          <ul className="space-y-2.5 text-sm">
            {recent.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3">
                <span>
                  {a.action}
                  <StatusBadge dot={false} className="ml-2">
                    {a.area}
                  </StatusBadge>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground" title={dateTime(a.ts)}>
                  {relative(a.ts, now)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing yet. Changes you make are listed here.</p>
        )}
      </Panel>
    </div>
  );
}
