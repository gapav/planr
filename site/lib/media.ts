import type { ExerciseMediaKind } from "./types";
export interface ParsedMedia { kind: ExerciseMediaKind; thumbnailUrl: string | null; }
export function parseExerciseMedia(rawUrl: string): ParsedMedia {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") throw new Error("Use a secure HTTPS URL");
  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com")) {
    const id = host === "youtu.be" ? url.pathname.split("/").filter(Boolean)[0] : url.searchParams.get("v") ?? url.pathname.split("/").filter(Boolean).at(-1);
    if (!id) throw new Error("That YouTube URL is missing a video ID");
    return { kind: "youtube", thumbnailUrl: `https://img.youtube.com/vi/${id}/hqdefault.jpg` };
  }
  if (host === "vimeo.com" || host.endsWith(".vimeo.com")) return { kind: "vimeo", thumbnailUrl: null };
  if (/\.(mp4|webm|mov)$/.test(url.pathname.toLowerCase())) return { kind: "video", thumbnailUrl: null };
  return { kind: "image", thumbnailUrl: rawUrl };
}

export async function resolveExerciseMedia(rawUrl: string): Promise<ParsedMedia> {
  const media = parseExerciseMedia(rawUrl);
  if (media.kind !== "vimeo") return media;

  try {
    const response = await fetch(`/api/media/thumbnail?url=${encodeURIComponent(rawUrl)}`);
    if (!response.ok) return media;
    const data = await response.json() as { thumbnailUrl?: unknown };
    return { ...media, thumbnailUrl: typeof data.thumbnailUrl === "string" ? data.thumbnailUrl : null };
  } catch {
    return media;
  }
}

export function getExerciseEmbedUrl(rawUrl: string): string | null {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") return null;
  const host = url.hostname.replace(/^www\./, "");

  if (host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com")) {
    const id = host === "youtu.be" ? url.pathname.split("/").filter(Boolean)[0] : url.searchParams.get("v") ?? url.pathname.split("/").filter(Boolean).at(-1);
    return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : null;
  }

  if (host === "vimeo.com" || host.endsWith(".vimeo.com")) {
    const id = url.pathname.split("/").filter(Boolean).findLast((part) => /^\d+$/.test(part));
    return id ? `https://player.vimeo.com/video/${id}` : null;
  }

  return null;
}
