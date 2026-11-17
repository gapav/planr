"use client";

import { ArrowUpRight, GraduationCap } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { bandTone } from "@/components/exercise-age-group-filter";
import { PageHeading } from "@/components/page-heading";
import { Tag } from "@/components/ui";
import { LESSONS, lessonHref } from "@/lib/lessons";

/** Håndballskolen (decision 10): one card per lesson in `lib/lessons`. */
export default function HandballskolenPage() {
  return <AppShell>
    <div className="grep-page">
      <PageHeading eyebrow="Lær det bort. Vis det på tavla." title="Håndballskolen" description="Leksjoner du kan gå gjennom med laget, på en skjerm i hallen eller i garderoben." />
      <ul className="lesson-index" aria-label="Leksjoner">
        {LESSONS.map((lesson) => <li key={lesson.slug}>
          <Link href={lessonHref(lesson.slug)} className="lesson-index-card">
            <span className="lesson-index-icon" aria-hidden="true"><GraduationCap size={22} strokeWidth={1.8} /></span>
            <span className="lesson-index-copy">
              <span className="flex flex-wrap items-center gap-2"><Tag tone={bandTone[lesson.ageGroup]}>{lesson.age}</Tag><span className="lesson-index-steps">{lesson.steps} steg</span></span>
              <strong>{lesson.title}</strong>
              <span className="lesson-index-summary">{lesson.summary}</span>
            </span>
            <ArrowUpRight size={18} className="lesson-index-arrow" aria-hidden="true" />
          </Link>
        </li>)}
      </ul>
    </div>
  </AppShell>;
}
