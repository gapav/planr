import { describe, expect, it } from "vitest";
import { getExerciseEmbedUrl, parseExerciseMedia } from "./media";

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
});
