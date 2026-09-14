import type { Metadata } from "next";
import { GrepIntroduction } from "./introduction";

// No `openGraph` key here on purpose: a child segment replaces the parent's whole
// openGraph object, which would drop the card image that app/opengraph-image.png
// contributes to the root segment. Share copy is the root layout's.
export const metadata: Metadata = {
  title: "Mer tid til laget",
  description: "Planlegg hjemme. Vær til stede på trening. Bli kjent med Grep, fra øvelsesbanken og øktplanen til mobilen på banen.",
  robots: { index: false, follow: false },
};

export default function WelcomePage() {
  return <GrepIntroduction />;
}
