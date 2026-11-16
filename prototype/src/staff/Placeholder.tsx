// Temporary page used until the real screen is built.
import { PageHeader, EmptyState } from "@/components/fc/ui";
import { usePageTitle } from "@/lib/title";

export function Placeholder({ title, description }: { title: string; description?: string }) {
  usePageTitle(title);
  return (
    <div>
      <PageHeader title={title} description={description} />
      <EmptyState title="Being set up" description="This page is on its way." />
    </div>
  );
}
