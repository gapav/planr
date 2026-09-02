import { describe, expect, it } from "vitest";
import { parseExerciseMedia } from "./media";

describe("exercise media", () => {
  it("extracts YouTube thumbnails", () => {
    expect(parseExerciseMedia("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({ kind: "youtube", thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg" });
  });
  it("recognizes Vimeo and direct video links", () => {
    expect(parseExerciseMedia("https://vimeo.com/123456").kind).toBe("vimeo");
    expect(parseExerciseMedia("https://cdn.example.com/drill.webm").kind).toBe("video");
  });
  it("uses a secure image URL directly as its thumbnail", () => {
    const url = "https://example.com/exercise.jpg";
    expect(parseExerciseMedia(url)).toEqual({ kind: "image", thumbnailUrl: url });
  });
  it("rejects non-HTTPS media", () => {
    expect(() => parseExerciseMedia("http://example.com/image.jpg")).toThrow("HTTPS");
  });
});
