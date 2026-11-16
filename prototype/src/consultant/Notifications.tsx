// C10 Notifications: the consultant's in-app messages, newest first, mark read.

import { useNavigate } from "react-router";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/fc/ui";
import { useDb } from "@/domain/db";
import { actions } from "@/domain/actions";
import { relative } from "@/domain/format";
import { useConsultant, useNow } from "@/lib/fc";
import { usePageTitle } from "@/lib/title";
import { cn } from "@/lib/utils";

export function Notifications() {
  usePageTitle("Notifications");
  const c = useConsultant()!;
  const db = useDb();
  const now = useNow();
  const navigate = useNavigate();
  const items = db.inbox.filter((i) => i.audience.consultantId === c.id).sort((a, b) => b.ts.localeCompare(a.ts));
  const unread = items.filter((i) => !i.read);
  return (
    <div>
      <PageHeader
        title="Notifications"
        description={unread.length ? `${unread.length} unread` : "You're all caught up"}
        actions={
          unread.length > 0 && (
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => actions.markInboxRead(unread.map((i) => i.id))}>
              <CheckCheck className="size-4" /> Mark all as read
            </Button>
          )
        }
      />
      {items.length ? (
        <div className="overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-inset ring-border/60">
          <ul className="divide-y divide-border">
            {items.slice(0, 60).map((i) => (
              <li key={i.id}>
                <button
                  onClick={() => {
                    if (!i.read) actions.markInboxRead([i.id]);
                    if (i.link?.startsWith("/app")) navigate(i.link);
                  }}
                  className={cn("flex w-full items-start gap-3 px-4 py-3.5 text-left transition hover:bg-muted/40", !i.read && "bg-brand-soft/40")}
                >
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", i.read ? "bg-transparent" : "bg-primary")} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm", !i.read && "font-semibold")}>{i.title}</span>
                    {i.body && <span className="mt-0.5 block text-sm text-muted-foreground">{i.body}</span>}
                    <span className="mt-0.5 block text-xs text-muted-foreground">{relative(i.ts, now)}</span>
                  </span>
                  {!i.read && <span className="sr-only">Unread</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <EmptyState icon={<Bell className="size-5" />} title="No notifications yet" description="We'll let you know here when a payment is confirmed, an order is on its way or someone joins your team." />
      )}
    </div>
  );
}
