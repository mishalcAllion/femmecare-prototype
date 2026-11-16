// Consultant app shell: phone first with a header (logo, bell), a bottom tab bar
// and a floating cart button; on a laptop a centred column with a side menu.

import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { Bell, House, LogOut, Package, ShoppingBag, ShoppingCart, UserPlus, UserRound, Users, Wallet } from "lucide-react";
import { Avatar, Logo } from "@/components/fc/brand";
import { cn } from "@/lib/utils";
import { useDb } from "@/domain/db";
import { actions } from "@/domain/actions";
import { fullName } from "@/domain/consultants";
import { consultantCode } from "@/domain/format";
import { labels } from "@/domain/ext/consultant-app";
import { useConsultant } from "@/lib/fc";
import { useCart } from "./cart";

const TABS = [
  { to: "/app", label: "Home", icon: House, end: true },
  { to: "/app/shop", label: "Shop", icon: ShoppingBag },
  { to: "/app/orders", label: "Orders", icon: Package },
  { to: "/app/team", label: "Team", icon: Users },
  { to: "/app/earnings", label: "Earnings", icon: Wallet },
];

const MORE = [
  { to: "/app/invite", label: "Invite", icon: UserPlus },
  { to: "/app/notifications", label: "Notifications", icon: Bell },
  { to: "/app/profile", label: "Profile", icon: UserRound },
];

export function useUnread() {
  const db = useDb();
  const c = useConsultant();
  return db.inbox.filter((i) => i.audience.consultantId === c?.id && !i.read).length;
}

export function signOut(navigate: (to: string) => void) {
  actions.signOut();
  navigate("/signin");
}

export function AppShell() {
  const c = useConsultant()!;
  const db = useDb();
  const L = labels(db);
  const cart = useCart();
  const unread = useUnread();
  const loc = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [loc.pathname]);
  const focus = /\/(cart|pay|receipt|statement)/.test(loc.pathname) || /\/earnings\/\d{4}-\d{2}/.test(loc.pathname);
  const showFab = cart.count > 0 && !focus;

  return (
    <div className="min-h-svh bg-[oklch(0.985_0.006_20)]">
      <div className="mx-auto flex max-w-6xl">
        {/* side menu, laptop */}
        <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col border-r border-border/60 bg-card/70 px-4 py-6 backdrop-blur md:flex">
          <Link to="/app" className="px-2">
            <Logo tagline />
          </Link>
          <nav className="mt-8 grid gap-1">
            {[...TABS, ...MORE].map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.to === "/app"}
                className={({ isActive }) =>
                  cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition", isActive ? "bg-brand-soft text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")
                }
              >
                <t.icon className="size-[1.1rem]" />
                {t.label}
                {t.to === "/app/notifications" && unread > 0 && <span className="ml-auto rounded-full bg-primary px-1.5 text-[0.7rem] font-semibold text-primary-foreground tabular">{unread}</span>}
              </NavLink>
            ))}
            <NavLink
              to="/app/cart"
              className={({ isActive }) => cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition", isActive ? "bg-brand-soft text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
            >
              <ShoppingCart className="size-[1.1rem]" /> Cart
              {cart.count > 0 && <span className="ml-auto rounded-full bg-foreground px-1.5 text-[0.7rem] font-semibold text-background tabular">{cart.count}</span>}
            </NavLink>
          </nav>
          <div className="mt-auto rounded-2xl bg-muted/60 p-3">
            <div className="flex items-center gap-3">
              <Avatar name={fullName(c)} hue={c.avatarHue} />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{fullName(c)}</div>
                <div className="text-xs text-muted-foreground">
                  {L.one} {consultantCode(c.number)}
                </div>
              </div>
            </div>
            <button onClick={() => signOut(navigate)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg py-2 text-sm text-muted-foreground transition hover:bg-background hover:text-foreground">
              <LogOut className="size-4" /> Sign out
            </button>
          </div>
        </aside>

        {/* app column */}
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-border/50 bg-background/85 backdrop-blur-md">
            <div className="mx-auto flex h-14 max-w-xl items-center gap-2 px-4 md:max-w-2xl md:px-8">
              <Link to="/app" className="md:hidden" aria-label="Home">
                <Logo className="[&_svg]:size-7 [&>span>span:first-child]:text-[1.15rem]" />
              </Link>
              <div className="ml-auto flex items-center gap-1">
                <Link to="/app/cart" className="relative hidden size-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground md:flex" aria-label={`Cart, ${cart.count} items`}>
                  <ShoppingCart className="size-5" />
                  {cart.count > 0 && <Badge>{cart.count}</Badge>}
                </Link>
                <Link to="/app/notifications" className="relative flex size-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Notifications, ${unread} unread`}>
                  <Bell className="size-5" />
                  {unread > 0 && <Badge>{unread > 9 ? "9+" : unread}</Badge>}
                </Link>
                <Link to="/app/profile" className="ml-1 rounded-full" aria-label="My profile">
                  <Avatar name={fullName(c)} hue={c.avatarHue} size="sm" />
                </Link>
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-xl px-4 pb-32 pt-4 md:max-w-2xl md:px-8 md:pb-16 md:pt-6">
            <div key={loc.pathname} className="animate-rise">
              <Outlet />
            </div>
          </main>
        </div>
      </div>

      {/* floating cart, phone */}
      {showFab && (
        <Link
          to="/app/cart"
          className="animate-pop fixed bottom-[5.25rem] right-4 z-50 flex h-14 items-center gap-2 rounded-full bg-primary pl-4 pr-5 text-primary-foreground shadow-lift transition hover:brightness-105 md:hidden"
          aria-label={`Cart, ${cart.count} items`}
        >
          <ShoppingCart className="size-5" />
          <span className="text-sm font-semibold tabular">{cart.count}</span>
        </Link>
      )}

      {/* tab bar, phone */}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border/70 bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden" aria-label="Main">
        <div className="mx-auto grid max-w-xl grid-cols-5">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) => cn("flex h-16 flex-col items-center justify-center gap-1 text-[0.7rem] font-medium transition", isActive ? "text-primary" : "text-muted-foreground")}
            >
              {({ isActive }) => (
                <>
                  <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition", isActive && "bg-brand-soft")}>
                    <t.icon className="size-5" />
                  </span>
                  {t.label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.62rem] font-semibold leading-none text-primary-foreground tabular ring-2 ring-background">{children}</span>;
}
