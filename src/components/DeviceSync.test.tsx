// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeviceSync } from "./DeviceSync";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DeviceSync", () => {
  it("uses universal device language and creates an unnamed device slot", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Response.json({
          id: "new-device",
          label: "新设备",
          token: "dawn_ABCD-EFGH-JKLM-NPQR-STUV-WXYZ-23",
          createdAt: "2026-08-18T00:00:00.000Z",
        });
      }
      return Response.json({
        devices: [{
          id: "phone",
          label: "iPhone",
          createdAt: "2026-08-18T00:00:00.000Z",
          lastUsedAt: "2026-08-18T01:00:00.000Z",
        }],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<DeviceSync />);
    fireEvent.click(screen.getByRole("button", { name: "设备同步" }));

    expect(await screen.findByRole("heading", { name: "把阅读带到每块屏幕" })).toBeInTheDocument();
    expect(screen.getByText("iPhone")).toBeInTheDocument();
    expect(screen.queryByText(/iPad App/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "连接新设备" }));
    expect(await screen.findByRole("link", { name: "在 Dawn Reader 中打开" })).toBeInTheDocument();

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
      expect(post).toBeDefined();
      expect(JSON.parse(String(post?.[1]?.body))).toEqual({ label: "新设备" });
    });
  });
});
