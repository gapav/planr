import type { Metadata } from "next";
import { GrepIntroduction } from "./introduction";

export const metadata: Metadata = {
  title: "Mer tid til laget",
  description: "Planlegg hjemme. Vær til stede på trening. Bli kjent med Grep, fra øvelsesbanken og øktplanen til mobilen på banen.",
  robots: { index: false, follow: false },
};

export default function WelcomePage() {
  return <GrepIntroduction />;
}
