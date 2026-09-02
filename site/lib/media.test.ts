import { describe, expect, it } from "vitest";
import { getExerciseEmbedUrl, MAX_EXERCISE_MEDIA_BYTES, MAX_TEAM_LOGO_BYTES, parseExerciseMedia, validateExerciseMediaUpload, validateTeamLogoUpload } from "./media";

describe("exercise media", () => {
  it("extracts YouTube thumbnails", () => {
    expect(parseExerciseMedia("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({ kind: "youtube", thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg" });
  });
  it("recognizes Vimeo and direct video links", () => {
    expect(parseExerciseMedia("https://vimeo.com/123456?share=copy")).toEqual({ kind: "vimeo", thumbnailUrl: null });
    expect(parseExerciseMedia("https://cdn.example.com/drill.webm").kind).toBe("video");
  });
  it("does not treat lookalike domains as video providers", () => {
    expect(parseExerciseMedia("https://notvimeo.com/123456").kind).toBe("image");
    expect(parseExerciseMedia("https://notyoutube.com/watch?v=123456").kind).toBe("image");
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
