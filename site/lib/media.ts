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

/**
 * Who uploaded the video, as the hosting provider reports it. Only Vimeo is
 * asked today: its oEmbed payload names the account behind the video, which is
 * how a federation film lands in the library with the federation credited.
 * YouTube reports its channel the same way, but nothing fetches it yet.
 */
export interface MediaCredit { name: string; url: string | null; }
/** Everything only the provider can tell us about a link — what `/api/media/thumbnail` answers. */
export interface MediaInfo { thumbnailUrl: string | null; credit: MediaCredit | null; }

const emptyMediaInfo: MediaInfo = { thumbnailUrl: null, credit: null };
/** Long enough for "Norges Håndballforbund", short enough that a credit line stays a line. */
const MAX_MEDIA_CREDIT_NAME = 80;

/**
 * The credit half of a Vimeo oEmbed payload. `author_url` is kept only when it
 * points back at Vimeo, so a rewritten payload cannot turn a credit into a link
 * somewhere else; the name survives on its own, because a credit without a link
 * still credits. Shared with the proxy route, which is where the payload lands.
 */
export function readMediaCredit(payload: unknown): MediaCredit | null {
  const { author_name: name, author_url: url } = (payload ?? {}) as { author_name?: unknown; author_url?: unknown };
  if (typeof name !== "string" || name.trim() === "") return null;
  return { name: name.trim().slice(0, MAX_MEDIA_CREDIT_NAME), url: vimeoProfileUrl(url) };
}

function vimeoProfileUrl(rawUrl: unknown): string | null {
  if (typeof rawUrl !== "string") return null;
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, "");
    return url.protocol === "https:" && (host === "vimeo.com" || host.endsWith(".vimeo.com")) ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * One trip to the oEmbed proxy per media link, shared by the thumbnail resolver
 * and the credit line and remembered for as long as the tab lives — opening the
 * same exercise twice should not ask Vimeo twice. An empty answer is not
 * remembered, so a request that failed is retried the next time it is needed.
 */
const mediaInfoRequests = new Map<string, Promise<MediaInfo>>();

export function fetchMediaInfo(rawUrl: string): Promise<MediaInfo> {
  let kind: ExerciseMediaKind;
  try { kind = parseExerciseMedia(rawUrl).kind; } catch { return Promise.resolve(emptyMediaInfo); }
  if (kind !== "vimeo") return Promise.resolve(emptyMediaInfo);

  const pending = mediaInfoRequests.get(rawUrl);
  if (pending) return pending;

  const request = requestMediaInfo(rawUrl).then((info) => {
    if (!info.thumbnailUrl && !info.credit) mediaInfoRequests.delete(rawUrl);
    return info;
  });
  mediaInfoRequests.set(rawUrl, request);
  return request;
}

async function requestMediaInfo(rawUrl: string): Promise<MediaInfo> {
  try {
    const response = await fetch(`/api/media/thumbnail?url=${encodeURIComponent(rawUrl)}`);
    if (!response.ok) return emptyMediaInfo;
    const data = await response.json() as { thumbnailUrl?: unknown; credit?: unknown };
    const credit = (data.credit ?? null) as { name?: unknown; url?: unknown } | null;
    return {
      thumbnailUrl: typeof data.thumbnailUrl === "string" ? data.thumbnailUrl : null,
      credit: credit && typeof credit.name === "string" && credit.name !== ""
        ? { name: credit.name, url: typeof credit.url === "string" ? credit.url : null }
        : null,
    };
  } catch {
    return emptyMediaInfo;
  }
}

export async function resolveExerciseMedia(rawUrl: string): Promise<ParsedMedia> {
  const media = parseExerciseMedia(rawUrl);
  if (media.kind !== "vimeo") return media;
  const { thumbnailUrl } = await fetchMediaInfo(rawUrl);
  return { ...media, thumbnailUrl };
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
