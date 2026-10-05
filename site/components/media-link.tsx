import { ArrowUpRight, Link2, Play } from "lucide-react";
import { describeMediaLink } from "@/lib/media";

/**
 * A page Grep cannot show — an Instagram reel, a TikTok — offered as what it
 * is: a way out to it. It stands where the player would and is the dialog's one
 * filled control, because for this exercise opening it *is* watching the drill;
 * drawn as a quiet row it read as a footnote and was walked past.
 */
export function MediaLinkCard({ mediaUrl }: { mediaUrl: string }) {
  const link = describeMediaLink(mediaUrl);
  if (!link) return null;
  const Icon = link.video ? Play : Link2;
  return <a href={mediaUrl} target="_blank" rel="noreferrer" className="group flex items-center gap-4 rounded-[20px] bg-[var(--accent-fill)] p-4 text-[var(--on-accent)] shadow-lg transition hover:bg-[var(--accent-fill-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:gap-5 sm:p-6">
    <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[var(--on-accent)]/15 sm:h-16 sm:w-16"><Icon size={24} fill={link.video ? "currentColor" : "none"} aria-hidden /></span>
    <span className="min-w-0 flex-1"><strong className="block text-base font-black tracking-[-.02em] sm:text-lg">{link.video ? "Se videoen" : "Åpne"} på {link.site}</strong><span className="mt-0.5 block truncate text-sm text-[var(--on-accent)]/75">{link.address}</span></span>
    <ArrowUpRight size={22} className="shrink-0 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
  </a>;
}
