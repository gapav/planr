import type { MetadataRoute } from "next";

// Coaches run this from a phone in the hall, so it installs to the home screen.
// Android reads every field here; iOS only honours name, display and the icons,
// and needs the separate app/apple-icon.png for its home-screen tile.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Grep — Håndballøkter, planlagt sammen",
    short_name: "Grep",
    description: "Planlegg håndballøkter med en felles øvelsesbank og direkte samarbeid i trenerteamet.",
    start_url: "/sessions",
    scope: "/",
    display: "standalone",
    background_color: "#f5f2e9",
    theme_color: "#10201d",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
