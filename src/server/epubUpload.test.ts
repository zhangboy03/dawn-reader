import { describe, expect, it } from "vitest";
import { InvalidEpubError, normalizedEpubPath } from "./epubUpload";

describe("EPUB archive paths", () => {
  it("normalizes ordinary publication paths", () => {
    expect(normalizedEpubPath("OPS/chapter-1.xhtml")).toBe("OPS/chapter-1.xhtml");
  });

  it.each(["../secret", "/absolute", "C:/drive", "OPS\\chapter.xhtml", "OPS/./chapter.xhtml"])(
    "rejects unsafe path %s",
    (path) => expect(() => normalizedEpubPath(path)).toThrow(InvalidEpubError),
  );
});
