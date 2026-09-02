"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useGrep } from "@/components/app-provider";

export default function NewSessionPage() {
  const { createSession } = useGrep(); const router = useRouter();
  useEffect(() => { void createSession().then((id) => router.replace(`/sessions/${id}`)); }, [createSession, router]);
  return <div className="grid min-h-screen place-items-center"><p className="font-bold text-[var(--ink-soft)]">Klargjør økten …</p></div>;
}
