import { SessionViewScreen } from "@/components/session-view";

export default async function SessionPage({ params }: PageProps<"/sessions/[id]">) {
  const { id } = await params;
  return <SessionViewScreen sessionId={id} />;
}
