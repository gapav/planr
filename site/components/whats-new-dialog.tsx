"use client";

import { Sparkles } from "lucide-react";
import type { Release } from "@/lib/changelog";
import { formatReleaseDate } from "@/lib/release-notes";
import { Button, Modal } from "./ui";

/**
 * «Velkommen tilbake!» — what has changed since this browser last looked
 * (decision 7). One list per release, newest first. The shell decides when it
 * opens and stores the version however it is closed.
 */
export function WhatsNewDialog({ open, releases, onClose }: { open: boolean; releases: readonly Release[]; onClose(): void }) {
  return <Modal open={open} onClose={onClose} size="sm" title="Velkommen tilbake!" description="Her er hva som er nytt siden sist.">
    <div className="grid gap-6">
      {releases.map((release) => <section key={release.version} aria-labelledby={`release-${release.version}`} className="grid gap-3">
        <h3 id={`release-${release.version}`} className="flex flex-wrap items-baseline gap-x-2 text-sm font-black">
          <Sparkles size={15} className="self-center text-[var(--accent)]" aria-hidden="true" />
          <span>Versjon {release.version}</span>
          <span className="font-semibold text-[var(--ink-soft)]">{formatReleaseDate(release.date)}</span>
        </h3>
        <ul className="grid list-disc gap-2 pl-5 text-sm leading-6 marker:text-[var(--accent)]">
          {release.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}
        </ul>
      </section>)}
      <div className="flex justify-end"><Button type="button" onClick={onClose} autoFocus>Skjønner</Button></div>
    </div>
  </Modal>;
}
