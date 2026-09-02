import type { Metadata, Viewport } from "next";
import { AppProvider } from "@/components/app-provider";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://plannr.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Plannr — Handball sessions, built together",
    template: "%s · Plannr",
  },
  description:
    "Plan better handball sessions with a shared exercise library and live team collaboration.",
  applicationName: "Plannr",
  openGraph: {
    title: "Plannr — Handball sessions, built together",
    description:
      "A shared exercise library and collaborative session planner for handball coaches.",
    type: "website",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Plannr — Handball sessions, built together",
    description:
      "A shared exercise library and collaborative session planner for handball coaches.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#10201d",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
