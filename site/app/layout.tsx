import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { AppProvider } from "@/components/app-provider";
import { ThemeAttribute } from "@/components/theme-switch";
import { themeScript } from "@/lib/theme";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://grep.team";
const dmSans = localFont({ src: "../public/fonts/dm-sans-latin-variable.ttf", variable: "--font-grep", display: "swap", weight: "100 1000" });

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
  },
  twitter: {
    card: "summary_large_image",
    title: "Grep — Håndballøkter, planlagt sammen",
    description:
      "En felles øvelsesbank og samarbeidsbasert øktplanlegger for håndballtrenere.",
  },
};

export const viewport: Viewport = {
  // The OS bar follows the device. A coach who overrides the device in Grep
  // gets the bar of the device's scheme, which is ink-dark in both.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#2e1b3d" },
    { media: "(prefers-color-scheme: dark)", color: "#16111b" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // `data-theme` is written by the script below before the first paint, so
    // the server's <html> never matches the browser's — hence the suppression.
    <html lang="nb" className={dmSans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeAttribute />
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
