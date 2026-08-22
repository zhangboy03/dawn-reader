// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssistantModeToggle } from "./AssistantModeToggle";

afterEach(cleanup);

describe("AssistantModeToggle", () => {
  it("shows the current mode and changes it with one direct action", () => {
    const onToggle = vi.fn();
    const { rerender } = render(<AssistantModeToggle mode="rewrite" onToggle={onToggle} />);

    fireEvent.click(screen.getByRole("button", { name: "划线后：英文改写。点击切换：AI 提问" }));
    expect(onToggle).toHaveBeenCalledOnce();
    expect(screen.getByText("英")).toBeInTheDocument();

    rerender(<AssistantModeToggle mode="ask" onToggle={onToggle} />);
    expect(screen.getByRole("button", { name: "划线后：AI 提问。点击切换：英文改写" })).toHaveTextContent("问");
  });
});
