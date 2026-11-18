import type { ExerciseAgeGroup } from "@/lib/types";
import { STEPS as UTGRUPPERT_STEPS } from "./utgruppert-forsvar";

/**
 * Håndballskolen's lessons (decision 10). A lesson is code: its data and rules
 * in `lib/lessons/<slug>.ts`, its screen in `components/lessons/<slug>.tsx`,
 * its route under `app/handballskolen/<slug>/`, and an entry here so the index
 * page lists it.
 */
export type LessonSummary = {
  slug: string;
  title: string;
  /** The age band it is written for, as shown on the card. */
  age: string;
  /** The library's band it falls in, which picks the tag's colour. */
  ageGroup: ExerciseAgeGroup;
  summary: string;
  steps: number;
};

export const LESSONS: readonly LessonSummary[] = [
  {
    slug: "utgruppert-forsvar",
    title: "Utgruppert forsvar",
    age: "11 år",
    ageGroup: "10-12",
    summary: "Fra fire til fem i forsvar: 3:2 og 2:2:1, forflytning med ball og overganger.",
    steps: UTGRUPPERT_STEPS.length,
  },
];

export function lessonHref(slug: string) {
  return `/handballskolen/${slug}`;
}
