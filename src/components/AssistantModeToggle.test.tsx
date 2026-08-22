// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssistantModeToggle } from "./AssistantModeToggle";

afterEach(cleanup);

describe("AssistantModeToggle", () => {
  it("shows both quiet choices and changes mode with one direct action", () => {
    const onChange = vi.fn();
    const { rerender } = render(<AssistantModeToggle mode="rewrite" onChange={onChange} />);

    expect(screen.getByRole("button", { name: "划线后使用英文改写" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "划线后使用 AI 提问" }));
    expect(onChange).toHaveBeenCalledWith("ask");

    rerender(<AssistantModeToggle mode="ask" onChange={onChange} />);
    expect(screen.getByRole("button", { name: "划线后使用 AI 提问" })).toHaveAttribute("aria-pressed", "true");
  });
});
