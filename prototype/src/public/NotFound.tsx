// Page not found, for the public website.

import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { HeartMark } from "@/components/fc/brand";
import { usePageTitle } from "@/lib/title";

export function NotFound({ home = "/", homeLabel = "Back to home" }: { home?: string; homeLabel?: string }) {
  usePageTitle("Page not found");
  return (
    <div className="flex flex-col items-center px-6 py-24 text-center">
      <HeartMark className="size-16 opacity-80" />
      <h1 className="mt-6 font-display text-3xl font-semibold">We can't find that page</h1>
      <p className="mt-2 max-w-sm text-muted-foreground">The link may be old or mistyped. Everything you need is a tap away.</p>
      <Button nativeButton={false} render={<Link to={home} />} className="mt-6 h-11 rounded-full px-6">
        {homeLabel}
      </Button>
    </div>
  );
}
