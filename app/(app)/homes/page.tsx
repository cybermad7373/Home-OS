import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { HomeCards } from "@/components/homes/home-cards";
import { listHomes } from "@/lib/data/homes";
import { requireSession } from "@/lib/data/house";
import { readSelectedHouseId } from "@/lib/infra/supabase/selected-house";

export const metadata: Metadata = { title: "My homes" };

/**
 * My Homes — a person belongs to several, and one of them is selected.
 *
 * A Requested card carries a name, a shape and the fact that they are waiting.
 * It carries no counts and no members, because RLS returns that person zero
 * rows from every table in that Home (HM-07).
 */
export default async function HomesPage() {
  const session = await requireSession();
  const selected = await readSelectedHouseId();
  const view = await listHomes(session, selected);

  return (
    <>
      <PageHeader
        title="My homes"
        subtitle={
          view.homes.length === 1
            ? "One home. Open an invite link to join another."
            : `${view.homes.length} homes`
        }
      />
      <HomeCards homes={view.homes} selectedId={view.selectedHouseId} />
    </>
  );
}
