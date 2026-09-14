"use client";

import { useEffect, useState } from "react";
import { fetchMediaInfo, type MediaCredit } from "@/lib/media";

/**
 * Credits the Vimeo account that uploaded the video — a federation's drill film
 * is theirs, and the library shows whose it is next to the player.
 *
 * The name is not stored on the exercise: it belongs to the video rather than to
 * a coach's row, so asking the provider when the video is opened both keeps it
 * current and covers every exercise already in the library without a backfill.
 * Nothing is drawn until an answer arrives, and a provider that will not answer
 * leaves no gap behind.
 */
export function MediaCreditLine({ mediaUrl }: { mediaUrl: string | null }) {
  // The answer is kept next to the link it was fetched for rather than cleared
  // when the link changes, so a modal reused for a second exercise never credits
  // it with the first one's uploader while its own answer is on the way.
  const [resolved, setResolved] = useState<{ mediaUrl: string; credit: MediaCredit | null } | null>(null);

  useEffect(() => {
    if (!mediaUrl) return;
    let active = true;
    void fetchMediaInfo(mediaUrl).then((info) => { if (active) setResolved({ mediaUrl, credit: info.credit }); });
    return () => { active = false; };
  }, [mediaUrl]);

  const credit = resolved?.mediaUrl === mediaUrl ? resolved.credit : null;
  if (!credit) return null;
  const name = credit.url
    ? <a href={credit.url} target="_blank" rel="noreferrer" className="font-bold text-[var(--ink)] underline underline-offset-4">{credit.name}</a>
    : <span className="font-bold text-[var(--ink)]">{credit.name}</span>;
  return <p className="text-xs font-semibold text-[var(--ink-soft)]">Videoen er lastet opp av {name} på Vimeo</p>;
}
