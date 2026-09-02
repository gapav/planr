import { LiveSession } from "@/components/live-session";

export default async function LiveSessionPage({ params }: PageProps<"/sessions/[id]/live">) {
  const { id } = await params;
  return <LiveSession sessionId={id} />;
}
