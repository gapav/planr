import { afterEach, describe, expect, it, vi } from "vitest";
import { describeMediaLink, fetchMediaInfo, getExerciseEmbedUrl, MAX_EXERCISE_MEDIA_BYTES, MAX_TEAM_LOGO_BYTES, mediaKindLabel, mediaKindOf, parseExerciseMedia, readMediaCredit, resolveExerciseMedia, validateExerciseMediaUpload, validateTeamLogoUpload } from "./media";

describe("exercise media", () => {
  it("extracts YouTube thumbnails", () => {
    expect(parseExerciseMedia("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({ kind: "youtube", thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg" });
  });
  it("recognizes Vimeo and direct video links", () => {
    expect(parseExerciseMedia("https://vimeo.com/123456?share=copy")).toEqual({ kind: "vimeo", thumbnailUrl: null });
    expect(parseExerciseMedia("https://cdn.example.com/drill.webm").kind).toBe("video");
  });
  it("does not treat lookalike domains as video providers", () => {
    expect(parseExerciseMedia("https://notvimeo.com/123456").kind).toBe("link");
    expect(parseExerciseMedia("https://notyoutube.com/watch?v=123456").kind).toBe("link");
  });
  it("takes a page it cannot show for a link, not a picture", () => {
    expect(parseExerciseMedia("https://www.instagram.com/reel/DaxOEfeMBIP/?stkn=cDgwMmZ5c3duN3g4")).toEqual({ kind: "link", thumbnailUrl: null });
  });
  it("uses a secure image URL directly as its thumbnail", () => {
    const url = "https://example.com/exercise.jpg";
    expect(parseExerciseMedia(url)).toEqual({ kind: "image", thumbnailUrl: url });
  });
  it("rejects non-HTTPS media", () => {
    expect(() => parseExerciseMedia("http://example.com/image.jpg")).toThrow("HTTPS");
  });
  it("builds privacy-friendly player URLs for supported video providers", () => {
    expect(getExerciseEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(getExerciseEmbedUrl("https://vimeo.com/123456?share=copy")).toBe("https://player.vimeo.com/video/123456");
    expect(getExerciseEmbedUrl("https://example.com/exercise.jpg")).toBeNull();
  });
  it("accepts supported video and image uploads up to and including 5 MB", () => {
    expect(validateExerciseMediaUpload({ name: "shooting-drill.mp4", size: MAX_EXERCISE_MEDIA_BYTES, type: "video/mp4" })).toEqual({ contentType: "video/mp4", extension: "mp4" });
    expect(validateExerciseMediaUpload({ name: "diagram.jpeg", size: 1024, type: "image/jpeg" })).toEqual({ contentType: "image/jpeg", extension: "jpg" });
    expect(validateExerciseMediaUpload({ name: "diagram.png", size: 1024, type: "image/png" })).toEqual({ contentType: "image/png", extension: "png" });
    expect(validateExerciseMediaUpload({ name: "diagram.webp", size: 1024, type: "image/webp" })).toEqual({ contentType: "image/webp", extension: "webp" });
  });
  it("rejects oversized or unsupported uploads", () => {
    expect(() => validateExerciseMediaUpload({ name: "diagram.jpg", size: MAX_EXERCISE_MEDIA_BYTES + 1, type: "image/jpeg" })).toThrow("5 MB");
    expect(() => validateExerciseMediaUpload({ name: "shooting-drill.mov", size: 1024, type: "video/quicktime" })).toThrow("MP4");
    expect(() => validateExerciseMediaUpload({ name: "unsafe.svg", size: 1024, type: "image/svg+xml" })).toThrow("JPG");
  });
});

describe("team logo uploads", () => {
  it("accepts supported image formats up to and including 2 MB", () => {
    expect(validateTeamLogoUpload({ name: "klubb.png", size: MAX_TEAM_LOGO_BYTES, type: "image/png" })).toEqual({ contentType: "image/png", extension: "png" });
    expect(validateTeamLogoUpload({ name: "klubb.JPEG", size: 1024, type: "image/jpeg" })).toEqual({ contentType: "image/jpeg", extension: "jpg" });
    expect(validateTeamLogoUpload({ name: "klubb.webp", size: 1024, type: "image/webp" })).toEqual({ contentType: "image/webp", extension: "webp" });
  });
  it("rejects oversized logos, video and SVG", () => {
    expect(() => validateTeamLogoUpload({ name: "klubb.png", size: MAX_TEAM_LOGO_BYTES + 1, type: "image/png" })).toThrow("2 MB");
    expect(() => validateTeamLogoUpload({ name: "klubb.mp4", size: 1024, type: "video/mp4" })).toThrow("JPG");
    expect(() => validateTeamLogoUpload({ name: "klubb.svg", size: 1024, type: "image/svg+xml" })).toThrow("JPG");
  });
  it("rejects a file whose extension contradicts its type", () => {
    expect(() => validateTeamLogoUpload({ name: "klubb.png", size: 1024, type: "image/jpeg" })).toThrow("JPG");
  });
});

describe("media credit", () => {
  const oEmbed = { author_name: "Norges Håndballforbund", author_url: "https://vimeo.com/norgeshaandballforbund" };

  it("credits the account that uploaded the video", () => {
    expect(readMediaCredit(oEmbed)).toEqual({ name: "Norges Håndballforbund", url: "https://vimeo.com/norgeshaandballforbund" });
  });
  it("keeps the name but drops a profile link that leaves Vimeo", () => {
    expect(readMediaCredit({ ...oEmbed, author_url: "https://handball.no/" })).toEqual({ name: "Norges Håndballforbund", url: null });
    expect(readMediaCredit({ ...oEmbed, author_url: "http://vimeo.com/nhf" })).toEqual({ name: "Norges Håndballforbund", url: null });
    expect(readMediaCredit({ ...oEmbed, author_url: "https://notvimeo.com/nhf" })).toEqual({ name: "Norges Håndballforbund", url: null });
    expect(readMediaCredit({ ...oEmbed, author_url: 42 })).toEqual({ name: "Norges Håndballforbund", url: null });
  });
  it("credits nobody when the provider names nobody", () => {
    expect(readMediaCredit({ author_url: "https://vimeo.com/nhf" })).toBeNull();
    expect(readMediaCredit({ author_name: "   " })).toBeNull();
    expect(readMediaCredit(null)).toBeNull();
  });
});

describe("fetchMediaInfo", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("asks the proxy once per Vimeo link and reuses the answer", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ thumbnailUrl: "https://i.vimeocdn.com/video/1.jpg", credit: { name: "NHF", url: "https://vimeo.com/nhf" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const url = "https://vimeo.com/900000001";
    expect(await fetchMediaInfo(url)).toEqual({ thumbnailUrl: "https://i.vimeocdn.com/video/1.jpg", credit: { name: "NHF", url: "https://vimeo.com/nhf" } });
    expect(await fetchMediaInfo(url)).toEqual({ thumbnailUrl: "https://i.vimeocdn.com/video/1.jpg", credit: { name: "NHF", url: "https://vimeo.com/nhf" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never asks the proxy about a link no provider can answer for", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await fetchMediaInfo("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({ thumbnailUrl: null, credit: null });
    expect(await fetchMediaInfo("not a url")).toEqual({ thumbnailUrl: null, credit: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries a link the proxy could not answer for, and survives a failed request", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ ok: true, json: async () => ({ thumbnailUrl: null, credit: { name: "NHF" } }) });
    vi.stubGlobal("fetch", fetchMock);

    const url = "https://vimeo.com/900000002";
    expect(await fetchMediaInfo(url)).toEqual({ thumbnailUrl: null, credit: null });
    expect(await fetchMediaInfo(url)).toEqual({ thumbnailUrl: null, credit: { name: "NHF", url: null } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

/** An `Image` that answers the way the browser would for a page (`error`) or a picture (`load`). */
function stubImage(outcome: "load" | "error") {
  const sources: string[] = [];
  vi.stubGlobal("Image", class {
    onload: (() => void) | null = null; onerror: (() => void) | null = null; naturalWidth = outcome === "load" ? 640 : 0;
    set src(url: string) { sources.push(url); queueMicrotask(() => (outcome === "load" ? this.onload : this.onerror)?.()); }
  });
  return sources;
}

describe("resolveExerciseMedia", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("keeps a page the browser cannot draw as a link with no thumbnail", async () => {
    stubImage("error");
    await expect(resolveExerciseMedia("https://www.instagram.com/reel/DaxOEfeMBIP/")).resolves.toEqual({ kind: "link", thumbnailUrl: null });
  });
  it("saves an image without an extension as an image once the browser has drawn it", async () => {
    stubImage("load");
    const url = "https://images.unsplash.com/photo-1?auto=format&w=1000";
    await expect(resolveExerciseMedia(url)).resolves.toEqual({ kind: "image", thumbnailUrl: url });
  });
  it("does not load a link it can already name", async () => {
    const sources = stubImage("load");
    await resolveExerciseMedia("https://example.com/diagram.png");
    await resolveExerciseMedia("https://youtu.be/dQw4w9WgXcQ");
    expect(sources).toEqual([]);
  });
});

describe("mediaKindOf", () => {
  it("reads an image saved as its own thumbnail as an image, extension or not", () => {
    const url = "https://images.unsplash.com/photo-1?auto=format&w=1000";
    expect(mediaKindOf({ mediaUrl: url, thumbnailUrl: url })).toBe("image");
  });
  it("reads a page saved without a thumbnail as a link", () => {
    expect(mediaKindOf({ mediaUrl: "https://www.instagram.com/reel/DaxOEfeMBIP/", thumbnailUrl: null })).toBe("link");
  });
  it("names video providers from the url whatever the thumbnail", () => {
    expect(mediaKindOf({ mediaUrl: "https://youtu.be/dQw4w9WgXcQ", thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg" })).toBe("youtube");
    expect(mediaKindOf({ mediaUrl: "https://vimeo.com/123456", thumbnailUrl: null })).toBe("vimeo");
  });
  it("has no kind without a usable url", () => {
    expect(mediaKindOf({ mediaUrl: null, thumbnailUrl: null })).toBeNull();
    expect(mediaKindOf({ mediaUrl: "not a url", thumbnailUrl: null })).toBeNull();
    expect(mediaKindOf({ mediaUrl: "http://example.com/page", thumbnailUrl: null })).toBeNull();
  });
});

describe("media links", () => {
  it("names the sites coaches link to and drops the share tracking from the address", () => {
    expect(describeMediaLink("https://www.instagram.com/reel/DaxOEfeMBIP/?stkn=cDgwMmZ5c3duN3g4")).toEqual({ site: "Instagram", address: "instagram.com/reel/DaxOEfeMBIP", video: true });
    expect(describeMediaLink("https://vm.tiktok.com/ZNabc123/")).toEqual({ site: "TikTok", address: "vm.tiktok.com/ZNabc123", video: true });
    expect(describeMediaLink("https://www.instagram.com/p/DaxOEfeMBIP/")).toMatchObject({ site: "Instagram", video: false });
  });
  it("falls back to the host for any other site", () => {
    expect(describeMediaLink("https://www.example.no/ovelser/kontring")).toEqual({ site: "example.no", address: "example.no/ovelser/kontring", video: false });
    expect(describeMediaLink("not a url")).toBeNull();
  });
  it("labels every kind for its tag", () => {
    expect([null, "image", "link", "youtube", "vimeo", "video"].map((kind) => mediaKindLabel(kind as Parameters<typeof mediaKindLabel>[0]))).toEqual(["Uten medier", "Bilde", "Lenke", "Video", "Video", "Video"]);
  });
});
