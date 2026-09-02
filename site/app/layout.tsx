import type { Metadata, Viewport } from "next";
import { AppProvider } from "@/components/app-provider";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://grep.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Grep — Håndballøkter, planlagt sammen",
    template: "%s · Grep",
  },
  description:
    "Planlegg bedre håndballøkter med en felles øvelsesbank og direkte samarbeid i trenerteamet.",
  applicationName: "Grep",
  appleWebApp: { capable: true, title: "Grep", statusBarStyle: "default" },
  openGraph: {
    title: "Grep — Håndballøkter, planlagt sammen",
    description:
      "En felles øvelsesbank og samarbeidsbasert øktplanlegger for håndballtrenere.",
    type: "website",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Grep — Håndballøkter, planlagt sammen",
    description:
      "En felles øvelsesbank og samarbeidsbasert øktplanlegger for håndballtrenere.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#10201d",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="nb">
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
