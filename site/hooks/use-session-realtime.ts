"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { demoProfiles } from "@/lib/demo-data";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Collaborator, Profile } from "@/lib/types";

export function useSessionRealtime(sessionId: string, user: Profile | null, activeBlockId: string | null, onRefresh: () => Promise<void>, demoMode: boolean) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>(demoMode ? [
    { ...demoProfiles[1], activeBlockId: "block-main" },
    { ...demoProfiles[2], activeBlockId: "block-game" },
  ] : []);
  const [connected, setConnected] = useState(demoMode);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const refreshRef = useRef(onRefresh);
  const activeBlockRef = useRef(activeBlockId);
  useEffect(() => { refreshRef.current = onRefresh; }, [onRefresh]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !user || demoMode) return;
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled || !data.session) return;
      void supabase.realtime.setAuth(data.session.access_token);
      const channel = supabase.channel(`session:${sessionId}`, { config: { private: true, presence: { key: user.id } } });
      channelRef.current = channel;
      channel.on("broadcast", { event: "*" }, () => void refreshRef.current());
      channel.on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<Collaborator>();
        setCollaborators(Object.values(state).flat().filter((entry) => entry.id !== user.id));
      });
      channel.subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") void channel.track({ ...user, activeBlockId: activeBlockRef.current });
      });
    });
    return () => { cancelled = true; if (channelRef.current) void supabase.removeChannel(channelRef.current); channelRef.current = null; };
  }, [demoMode, sessionId, user]);

  useEffect(() => { activeBlockRef.current = activeBlockId; if (channelRef.current && user) void channelRef.current.track({ ...user, activeBlockId }); }, [activeBlockId, user]);
  return { collaborators, connected };
}
