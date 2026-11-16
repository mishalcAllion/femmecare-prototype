// Public website shell: header with the main links, footer with company details,
// scroll handling for page changes and in-page anchors.

import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { Mail, MapPin, Menu, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Logo } from "@/components/fc/brand";
import { cn } from "@/lib/utils";
import { useDb } from "@/domain/db";
import { useConsultant, useNow } from "@/lib/fc";
import { labels } from "@/domain/ext/consultant-app";

function useScrollHandling() {
  const loc = useLocation();
  useEffect(() => {
    if (loc.hash) {
      const id = loc.hash.slice(1);
      const t = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
      return () => window.clearTimeout(t);
    }
    window.scrollTo({ top: 0 });
  }, [loc.pathname, loc.hash]);
}

export function PublicLayout() {
  useScrollHandling();
  return (
    <div className="flex min-h-svh flex-col overflow-x-clip bg-background">
      <PublicHeader />
      <main className="flex-1">
        <Outlet />
      </main>
      <PublicFooter />
    </div>
  );
}

function PublicHeader() {
  const db = useDb();
  const me = useConsultant();
  const L = labels(db);
  const [open, setOpen] = useState(false);
  const links = [
    { to: "/products", label: "Products" },
    { to: "/#become", label: `Become ${L.a}` },
    { to: "/#where", label: "Where to buy" },
  ];
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link to="/" aria-label="FemmeCare home" className="shrink-0">
          <Logo />
        </Link>
        <nav className="ml-6 hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                cn("rounded-full px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground", isActive && !l.to.includes("#") && "text-foreground")
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {me ? (
            <Button nativeButton={false} render={<Link to="/app" />} className="h-9 rounded-full px-4">
              My account
            </Button>
          ) : (
            <>
              <Button variant="ghost" nativeButton={false} render={<Link to="/signin" />} className="h-9 rounded-full px-3">
                Sign in
              </Button>
              <Button nativeButton={false} render={<Link to="/join" />} className="hidden h-9 rounded-full px-4 sm:inline-flex">
                Join now
              </Button>
            </>
          )}
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu" onClick={() => setOpen(true)}>
            <Menu className="size-5" />
          </Button>
        </div>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[84%] max-w-xs gap-0 p-0">
          <SheetHeader className="border-b border-border px-5 py-4">
            <SheetTitle>
              <Logo />
            </SheetTitle>
          </SheetHeader>
          <nav className="grid gap-1 p-3">
            {[{ to: "/", label: "Home" }, ...links].map((l) => (
              <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 text-base font-medium hover:bg-muted">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto grid gap-2 border-t border-border p-4">
            {me ? (
              <Button nativeButton={false} render={<Link to="/app" onClick={() => setOpen(false)} />} className="h-11 rounded-full">
                My account
              </Button>
            ) : (
              <>
                <Button nativeButton={false} render={<Link to="/join" onClick={() => setOpen(false)} />} className="h-11 rounded-full">
                  Apply to join
                </Button>
                <Button variant="outline" nativeButton={false} render={<Link to="/signin" onClick={() => setOpen(false)} />} className="h-11 rounded-full">
                  {L.one} sign-in
                </Button>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}

function PublicFooter() {
  const db = useDb();
  const now = useNow();
  const L = labels(db);
  const co = db.settings.company;
  const year = now.slice(0, 4);
  return (
    <footer className="bg-[oklch(0.24_0.045_355)] text-white/80">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1.3fr]">
        <div>
          <Logo light tagline />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/65">
            Everyday feminine hygiene made with care, sold by a growing network of women across Sri Lanka.
          </p>
        </div>
        <FooterCol title="Products">
          {db.products
            .filter((p) => p.status === "active")
            .slice(0, 6)
            .map((p) => (
              <Link key={p.id} to={`/products/${p.id}`} className="hover:text-white">
                {p.name}
              </Link>
            ))}
        </FooterCol>
        <FooterCol title={L.many}>
          <Link to="/#become" className="hover:text-white">
            How earning works
          </Link>
          <Link to="/join" className="hover:text-white">
            Apply to join
          </Link>
          <Link to="/signin" className="hover:text-white">
            {L.one} sign-in
          </Link>
          <Link to="/#where" className="hover:text-white">
            Where to buy
          </Link>
        </FooterCol>
        <FooterCol title="Contact us">
          <span className="flex gap-2">
            <MapPin className="mt-0.5 size-4 shrink-0 text-white/50" />
            {co.address}
          </span>
          <a href={`tel:${co.phone.replace(/\s/g, "")}`} className="flex gap-2 hover:text-white">
            <Phone className="mt-0.5 size-4 shrink-0 text-white/50" />
            {co.phone}
          </a>
          <a href={`mailto:${co.email}`} className="flex gap-2 hover:text-white">
            <Mail className="mt-0.5 size-4 shrink-0 text-white/50" />
            {co.email}
          </a>
        </FooterCol>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs text-white/50 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>
            © {year} {co.name}. Company reg. {co.regNo}.
          </span>
          <Link to="/staff/login" className="hover:text-white">
            Staff sign-in
          </Link>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-white">{title}</div>
      <div className="grid gap-2 text-sm">{children}</div>
    </div>
  );
}

/** Section wrapper with consistent width and spacing. */
export function Section({ id, className, children }: { id?: string; className?: string; children: ReactNode }) {
  return (
    <section id={id} className={cn("scroll-mt-20 px-4 py-16 sm:px-6 md:py-20", className)}>
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary", className)}>{children}</div>;
}
