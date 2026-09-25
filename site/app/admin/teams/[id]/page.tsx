import { Suspense } from "react";
import { AdminTeamScreen } from "@/components/admin-team";

export default async function AdminTeamPage({ params }: PageProps<"/admin/teams/[id]">) {
  const { id } = await params;
  // `useSearchParams` picks the view, and it has to sit under a Suspense boundary.
  return <Suspense><AdminTeamScreen teamId={id} /></Suspense>;
}
