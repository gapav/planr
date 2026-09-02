import type { ExerciseMediaKind } from "./types";

export const MAX_EXERCISE_MEDIA_BYTES = 5 * 1024 * 1024;

const exerciseUploadTypes = {
  "video/mp4": { extensions: ["mp4"], extension: "mp4" },
  "image/jpeg": { extensions: ["jpg", "jpeg"], extension: "jpg" },
  "image/png": { extensions: ["png"], extension: "png" },
  "image/webp": { extensions: ["webp"], extension: "webp" },
} as const;

export function validateExerciseMediaUpload(file: Pick<File, "name" | "size" | "type">): { contentType: keyof typeof exerciseUploadTypes; extension: string } {
  const type = file.type as keyof typeof exerciseUploadTypes;
  const config = exerciseUploadTypes[type];
  const extension = file.name.toLowerCase().split(".").at(-1) ?? "";
  if (!config || !(config.extensions as readonly string[]).includes(extension)) {
    throw new Error("Velg en MP4-, JPG-, PNG- eller WebP-fil");
  }
  if (file.size > MAX_EXERCISE_MEDIA_BYTES) {
    throw new Error("Filen må være 5 MB eller mindre");
  }
  return { contentType: type, extension: config.extension };
}

export const MAX_TEAM_LOGO_BYTES = 2 * 1024 * 1024;

const teamLogoUploadTypes = {
  "image/jpeg": { extensions: ["jpg", "jpeg"], extension: "jpg" },
  "image/png": { extensions: ["png"], extension: "png" },
  "image/webp": { extensions: ["webp"], extension: "webp" },
} as const;

// A club logo is only ever an image, and it is served from a public bucket, so
// SVG stays out: it would let an admin upload script into an origin the app
// loads images from.
export function validateTeamLogoUpload(file: Pick<File, "name" | "size" | "type">): { contentType: keyof typeof teamLogoUploadTypes; extension: string } {
  const type = file.type as keyof typeof teamLogoUploadTypes;
  const config = teamLogoUploadTypes[type];
  const extension = file.name.toLowerCase().split(".").at(-1) ?? "";
  if (!config || !(config.extensions as readonly string[]).includes(extension)) {
    throw new Error("Velg en JPG-, PNG- eller WebP-fil");
  }
  if (file.size > MAX_TEAM_LOGO_BYTES) {
    throw new Error("Logoen må være 2 MB eller mindre");
  }
  return { contentType: type, extension: config.extension };
}

export interface ParsedMedia { kind: ExerciseMediaKind; thumbnailUrl: string | null; }
export function parseExerciseMedia(rawUrl: string): ParsedMedia {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") throw new Error("Bruk en sikker HTTPS-lenke");
  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com")) {
    const id = host === "youtu.be" ? url.pathname.split("/").filter(Boolean)[0] : url.searchParams.get("v") ?? url.pathname.split("/").filter(Boolean).at(-1);
    if (!id) throw new Error("YouTube-lenken mangler en video-ID");
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
