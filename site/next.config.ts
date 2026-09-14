import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * TEMPORARY — the public introduction is off the air until the branding and
   * the copyright/attribution work behind it are settled. Everything under
   * `app/velkommen/` is untouched and still builds; only the door is shut.
   *
   * `permanent: false` is load-bearing: a 308 would be cached by browsers and
   * by link scrapers, and we would be fighting it to put the page back.
   *
   * To restore the introduction, delete this `redirects()` block and send the
   * signed-out front door back to `/velkommen` in `components/app-shell.tsx` —
   * those two are the whole switch.
   */
  async redirects() {
    return [{ source: "/velkommen", destination: "/sign-in", permanent: false }];
  },
};

export default nextConfig;
