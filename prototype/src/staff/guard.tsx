// Page-level permission check: a role without access sees a clear refusal
// that names the roles that can use the page.

import type { ReactNode } from "react";
import { Link } from "react-router";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { canAny, rolesWith, ROLES, type Permission } from "@/domain/permissions";
import { useStaffUser } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";

export function Guard({ perms, children }: { perms: Permission[]; children: ReactNode }) {
  const user = useStaffUser();
  if (canAny(user?.roles, perms)) return <>{children}</>;
  return <NoAccess perms={perms} />;
}

export function NoAccess({ perms }: { perms: Permission[] }) {
  usePageTitle("No access");
  const roles = [...new Set(perms.flatMap((p) => rolesWith(p)))].map((r) => ROLES[r].label);
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-danger-soft text-destructive">
        <Lock className="size-6" />
      </div>
      <h1 className="font-display text-2xl font-semibold">You don't have access to this page</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This page is for {roles.length ? roles.join(", ") : "other roles"}. Ask your administrator if you need it.
      </p>
      <Button className="mt-6" render={<Link to="/staff" />}>
        Back to what's waiting
      </Button>
    </div>
  );
}

export function NotFound() {
  usePageTitle("Page not found");
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <div className="font-display text-6xl font-semibold text-primary">404</div>
      <h1 className="mt-3 font-display text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">The link may be old, or the record was removed.</p>
      <Button className="mt-6" render={<Link to="/staff" />}>
        Back to what's waiting
      </Button>
    </div>
  );
}
