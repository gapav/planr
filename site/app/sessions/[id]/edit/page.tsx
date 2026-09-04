import { SessionScreen } from "@/components/session-builder";

export default async function EditSessionPage({ params }: PageProps<"/sessions/[id]/edit">) {
  const { id } = await params;
  return <SessionScreen sessionId={id} />;
}
