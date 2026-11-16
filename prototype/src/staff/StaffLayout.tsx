// Staff console frame: grouped sidebar (filtered by role), top bar with search,
// notifications, light/dark switch and the signed-in user's menu.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router";
import { Bell, Check, LogOut, Moon, Search, Sun, UserRound } from "lucide-react";
import { useTheme } from "@/lib/theme";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Logo, Avatar } from "@/components/fc/brand";
import { useDb } from "@/domain/db";
import { actions } from "@/domain/actions";
import { canAny } from "@/domain/permissions";
import { ROLES } from "@/domain/permissions";
import { NAV } from "./nav";
import { badgeCounts } from "@/domain/workqueue";
import { useNow, useStaffUser } from "@/lib/fc";
import { relative, consultantCode } from "@/domain/format";
import { fullName } from "@/domain/consultants";
import { cn } from "@/lib/utils";

export function RequireStaff({ children }: { children: ReactNode }) {
  const db = useDb();
  const loc = useLocation();
  if (db.meta.session.kind !== "staff") return <Navigate to={`/staff/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return <>{children}</>;
}

export function StaffLayout() {
  return (
    <RequireStaff>
      <SidebarProvider>
        <StaffSidebar />
        <SidebarInset className="min-w-0 bg-background">
          <TopBar />
          <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 pb-16 md:px-8">
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </RequireStaff>
  );
}

function StaffSidebar() {
  const db = useDb();
  const user = useStaffUser();
  const now = useNow();
  const loc = useLocation();
  const { setOpenMobile, isMobile } = useSidebar();
  const counts = useMemo(() => (user ? badgeCounts(db, now, user.roles) : {}), [db, now, user]);
  const showLater = db.meta.phaseLens === "everything";
  const label = db.settings.labels.consultant;
  return (
    <Sidebar collapsible="icon" variant="sidebar" className="border-r border-sidebar-border">
      <SidebarHeader className="px-3 pb-1 pt-4">
        <Link to="/staff" className="flex items-center gap-2 px-1 group-data-[collapsible=icon]:justify-center">
          <span className="group-data-[collapsible=icon]:hidden">
            <Logo />
          </span>
        </Link>
        <div className="mt-1 px-1 text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground group-data-[collapsible=icon]:hidden">Sales system</div>
      </SidebarHeader>
      <SidebarContent className="no-scrollbar">
        {NAV.map((g) => {
          const items = g.items.filter((i) => (i.perms.length === 0 || canAny(user?.roles, i.perms)) && (!i.later || showLater));
          if (!items.length) return null;
          return (
            <SidebarGroup key={g.label} className="py-1">
              <SidebarGroupLabel>{g.label === "Consultants" ? `${label}s` : g.label}</SidebarGroupLabel>
              <SidebarMenu>
                {items.map((i) => {
                  const active = i.to === "/staff" ? loc.pathname === "/staff" || loc.pathname === "/staff/" : loc.pathname.startsWith(i.to);
                  const n = i.badge ? counts[i.badge] : 0;
                  const text = i.label.replace("Consultant", label).replace("Consultants", `${label}s`);
                  return (
                    <SidebarMenuItem key={i.to}>
                      <SidebarMenuButton
                        isActive={active}
                        tooltip={text}
                        render={<NavLink to={i.to} end={i.to === "/staff"} onClick={() => isMobile && setOpenMobile(false)} />}
                      >
                        <i.icon />
                        <span>{text}</span>
                        {i.later && <span className="ml-auto rounded bg-muted px-1 text-[0.6rem] uppercase text-muted-foreground">Later</span>}
                      </SidebarMenuButton>
                      {!!n && <SidebarMenuBadge className="rounded-full bg-primary/12 text-primary">{n}</SidebarMenuBadge>}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
      <SidebarFooter className="px-3 pb-3 text-[0.7rem] text-muted-foreground group-data-[collapsible=icon]:hidden">
        {db.settings.company.name}
      </SidebarFooter>
    </Sidebar>
  );
}

function TopBar() {
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border/60 bg-background/85 px-3 backdrop-blur md:px-6">
      <SidebarTrigger />
      <button
        onClick={() => setSearchOpen(true)}
        className="ml-1 flex h-9 w-full max-w-md items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 text-sm text-muted-foreground hover:bg-muted"
      >
        <Search className="size-4" />
        <span className="truncate">Search orders, outlets, people, invoices</span>
        <kbd className="ml-auto hidden rounded border border-border bg-background px-1.5 text-[0.65rem] sm:inline">Ctrl K</kbd>
      </button>
      <div className="ml-auto flex items-center gap-1">
        <ThemeButton />
        <Bell_ />
        <UserMenu />
      </div>
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  );
}

function ThemeButton() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button variant="ghost" size="icon" aria-label="Switch light or dark" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
      {resolvedTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}

function Bell_() {
  const db = useDb();
  const user = useStaffUser();
  const now = useNow();
  const navigate = useNavigate();
  const items = db.inbox
    .filter((i) => (i.audience.role && user?.roles.includes(i.audience.role)) || i.audience.userId === user?.id)
    .slice(0, 30);
  const unread = items.filter((i) => !i.read);
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="ghost" size="icon" aria-label={`Notifications, ${unread.length} unread`} className="relative" />}>
        <Bell className="size-4" />
        {unread.length > 0 && (
          <span className="absolute right-1.5 top-1.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.6rem] font-semibold text-primary-foreground">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-semibold">Notifications</span>
          {unread.length > 0 && (
            <button className="text-xs text-primary hover:underline" onClick={() => actions.markInboxRead(unread.map((i) => i.id))}>
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {!items.length && <div className="p-6 text-center text-sm text-muted-foreground">You're all caught up</div>}
          {items.map((i) => (
            <button
              key={i.id}
              onClick={() => {
                actions.markInboxRead([i.id]);
                if (i.link) navigate(i.link);
              }}
              className={cn("flex w-full gap-3 border-b border-border/60 px-4 py-3 text-left last:border-0 hover:bg-muted/50", !i.read && "bg-brand-soft/40")}
            >
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", i.read ? "bg-transparent" : "bg-primary")} />
              <span className="min-w-0">
                <span className="block text-sm">{i.title}</span>
                <span className="text-xs text-muted-foreground">{relative(i.ts, now)}</span>
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function UserMenu() {
  const user = useStaffUser();
  const navigate = useNavigate();
  if (!user) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<button className="ml-1 rounded-full outline-none ring-ring/40 focus-visible:ring-3" aria-label="Account menu" />}>
        <Avatar name={user.name} hue={user.avatarHue} size="sm" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <div className="text-sm font-medium">{user.name}</div>
            <div className="text-xs text-muted-foreground">{user.email}</div>
            <div className="mt-1 text-xs text-muted-foreground">{user.roles.map((r) => ROLES[r].label).join(", ")}</div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("/staff/profile")}>
          <UserRound className="size-4" /> My profile
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            actions.signOut();
            navigate("/staff/login");
          }}
        >
          <LogOut className="size-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function GlobalSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const db = useDb();
  const navigate = useNavigate();
  const go = (to: string) => {
    onOpenChange(false);
    navigate(to);
  };
  const label = db.settings.labels.consultant;
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search" description="Search the sales system">
      <CommandInput placeholder="Order number, outlet, name, invoice, item code..." />
      <CommandList>
        <CommandEmpty>Nothing found.</CommandEmpty>
        <CommandGroup heading="Outlets">
          {db.outlets.map((o) => (
            <CommandItem key={o.id} value={`${o.name} ${o.id} ${o.city}`} onSelect={() => go(`/staff/outlets/${o.id}`)}>
              {o.name} <span className="ml-auto text-xs text-muted-foreground">{o.id}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading={`${label}s`}>
          {db.consultants.slice(0, 200).map((c) => (
            <CommandItem key={c.id} value={`${fullName(c)} ${consultantCode(c.number)} ${c.appRef} ${c.mobile}`} onSelect={() => go(c.status === "pending" ? `/staff/applications/${c.id}` : `/staff/consultants/${c.id}`)}>
              {fullName(c)} <span className="ml-auto text-xs text-muted-foreground">{c.number ? consultantCode(c.number) : c.appRef}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Orders">
          {db.outletOrders.slice(0, 120).map((o) => (
            <CommandItem key={o.id} value={`${o.id} ${o.poNumber}`} onSelect={() => go(`/staff/outlet-orders/${o.id}`)}>
              {o.id} <span className="ml-2 text-xs text-muted-foreground">PO {o.poNumber}</span>
            </CommandItem>
          ))}
          {db.consultantOrders.slice(0, 200).map((o) => (
            <CommandItem key={o.id} value={o.id} onSelect={() => go(`/staff/consultant-orders/${o.id}`)}>
              {o.id}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Invoices">
          {db.invoices.slice(0, 120).map((i) => (
            <CommandItem key={i.id} value={`${i.id} ${i.deliveryNoteId}`} onSelect={() => go(`/staff/invoices/${i.id}`)}>
              {i.id} <span className="ml-2 text-xs text-muted-foreground">{i.deliveryNoteId}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Products">
          {db.products.map((p) => (
            <CommandItem key={p.id} value={`${p.id} ${p.name} ${p.barcode}`} onSelect={() => go(`/staff/products/${p.id}`)}>
              {p.name} <span className="ml-auto text-xs text-muted-foreground">{p.id}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

export { Check };
