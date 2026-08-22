// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InviteManager } from "./InviteManager";

describe("InviteManager", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows a created invite, resets the form and does not report a false failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: "ZKBM-NVJP-QH",
      expiresAt: "2026-08-25T01:50:02.208Z",
      joinUrl: "https://reader.example/join",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(<InviteManager initialOverview={{ accounts: [], invites: [], sessions: [] }} />);
    const name = screen.getByLabelText("测试者备注") as HTMLInputElement;
    const email = screen.getByLabelText("联系邮箱（可选）") as HTMLInputElement;
    fireEvent.change(name, { target: { value: "香港测试者" } });
    fireEvent.change(email, { target: { value: "tester@example.com" } });
    fireEvent.submit(name.form!);

    expect(await screen.findByText("ZKBM-NVJP-QH")).toBeVisible();
    expect(screen.queryByText(/邀请码创建失败/)).not.toBeInTheDocument();
    await waitFor(() => {
      expect(name.value).toBe("");
      expect(email.value).toBe("");
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
