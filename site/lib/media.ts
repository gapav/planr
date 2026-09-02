import type { ExerciseMediaKind } from "./types";
export interface ParsedMedia { kind: ExerciseMediaKind; thumbnailUrl: string | null; }
export function parseExerciseMedia(rawUrl: string): ParsedMedia {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") throw new Error("Use a secure HTTPS URL");
  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be" || host.endsWith("youtube.com")) {
    const id = host === "youtu.be" ? url.pathname.split("/").filter(Boolean)[0] : url.searchParams.get("v") ?? url.pathname.split("/").filter(Boolean).at(-1);
    if (!id) throw new Error("That YouTube URL is missing a video ID");
    return { kind: "youtube", thumbnailUrl: `https://img.youtube.com/vi/${id}/hqdefault.jpg` };
  }
  if (host.endsWith("vimeo.com")) return { kind: "vimeo", thumbnailUrl: null };
  if (/\.(mp4|webm|mov)$/.test(url.pathname.toLowerCase())) return { kind: "video", thumbnailUrl: null };
  return { kind: "image", thumbnailUrl: rawUrl };
}
