import { SessionScreen } from "@/components/session-builder";

export default async function SessionPage({ params }: PageProps<"/sessions/[id]">) {
  const { id } = await params;
  return <SessionScreen sessionId={id} />;
}
