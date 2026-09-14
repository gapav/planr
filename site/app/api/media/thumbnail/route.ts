import { parseExerciseMedia, readMediaCredit, type MediaInfo } from "@/lib/media";

/** Nothing usable came back. A missing thumbnail or credit is never an error — the card and the credit line both do without. */
const emptyMediaInfo: MediaInfo = { thumbnailUrl: null, credit: null };

export async function GET(request: Request) {
  const mediaUrl = new URL(request.url).searchParams.get("url");
  if (!mediaUrl) return Response.json({ error: "En medielenke er påkrevd" }, { status: 400 });

  try {
    if (parseExerciseMedia(mediaUrl).kind !== "vimeo") {
      return Response.json({ error: "Her kan bare medier fra Vimeo slås opp" }, { status: 400 });
    }

    const oEmbedUrl = new URL("https://vimeo.com/api/oembed.json");
    oEmbedUrl.searchParams.set("url", mediaUrl);
    oEmbedUrl.searchParams.set("width", "1280");
    const response = await fetch(oEmbedUrl, {
      headers: { Referer: new URL(request.url).origin },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return Response.json(emptyMediaInfo);

    const data = await response.json() as unknown;
    return Response.json({ thumbnailUrl: vimeoThumbnailUrl(data), credit: readMediaCredit(data) } satisfies MediaInfo);
  } catch {
    return Response.json(emptyMediaInfo);
  }
}

/** Only Vimeo's own CDN may become an `<img src>`: the payload decides the host otherwise. */
function vimeoThumbnailUrl(payload: unknown): string | null {
  const { thumbnail_url: raw } = (payload ?? {}) as { thumbnail_url?: unknown };
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || (url.hostname !== "vimeocdn.com" && !url.hostname.endsWith(".vimeocdn.com"))) return null;
    return url.toString();
  } catch {
    return null;
  }
}
