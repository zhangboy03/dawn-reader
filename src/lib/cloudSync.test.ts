import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadCloudBook } from "./cloudSync";
import type { StoredBook } from "./bookStore";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PDF cloud boundary", () => {
  it("rejects local PDF records before any EPUB cloud request", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const pdf = {
      id: "sha256:pdf",
      title: "Local paper",
      fileName: "paper.pdf",
      blob: new Blob(["%PDF-1.7"], { type: "application/pdf" }),
      cover: null,
      coverChecked: true,
      addedAt: "2026-08-19T00:00:00.000Z",
      format: "pdf",
      mimeType: "application/pdf",
      fileSize: 8,
    } satisfies StoredBook;

    await expect(uploadCloudBook(pdf)).rejects.toThrow(/PDF.*本机|local/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
