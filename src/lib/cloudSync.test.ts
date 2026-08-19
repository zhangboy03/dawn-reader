import { afterEach, describe, expect, it, vi } from "vitest";
import { saveCloudProgress } from "./cloudSync";

describe("saveCloudProgress", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("can keep the final position request alive while the page closes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      position: {
        cfi: "epubcfi(/6/16!/4/4/62/5:0)",
        percentage: 2,
        updatedAt: "2026-08-19T02:11:35.800Z",
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await saveCloudProgress("book-1", {
      cfi: "epubcfi(/6/16!/4/4/62/5:0)",
      percentage: 2,
      updatedAt: "2026-08-19T02:11:35.800Z",
    }, { keepalive: true });

    expect(fetchMock).toHaveBeenCalledWith("/api/books/book-1/progress", expect.objectContaining({
      method: "PUT",
      keepalive: true,
    }));
  });
});
