import { parseExerciseMedia } from "@/lib/media";

interface VimeoOEmbedResponse {
  thumbnail_url?: unknown;
}

export async function GET(request: Request) {
  const mediaUrl = new URL(request.url).searchParams.get("url");
  if (!mediaUrl) return Response.json({ error: "A media URL is required" }, { status: 400 });

  try {
    if (parseExerciseMedia(mediaUrl).kind !== "vimeo") {
      return Response.json({ error: "Only Vimeo thumbnails are resolved here" }, { status: 400 });
    }

    const oEmbedUrl = new URL("https://vimeo.com/api/oembed.json");
    oEmbedUrl.searchParams.set("url", mediaUrl);
    oEmbedUrl.searchParams.set("width", "1280");
    const response = await fetch(oEmbedUrl, {
      headers: { Referer: new URL(request.url).origin },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return Response.json({ thumbnailUrl: null });

    const data = await response.json() as VimeoOEmbedResponse;
    if (typeof data.thumbnail_url !== "string") return Response.json({ thumbnailUrl: null });
    const thumbnailUrl = new URL(data.thumbnail_url);
    if (thumbnailUrl.protocol !== "https:" || (thumbnailUrl.hostname !== "vimeocdn.com" && !thumbnailUrl.hostname.endsWith(".vimeocdn.com"))) {
      return Response.json({ thumbnailUrl: null });
    }
    return Response.json({ thumbnailUrl: thumbnailUrl.toString() });
  } catch {
    return Response.json({ thumbnailUrl: null });
  }
}
