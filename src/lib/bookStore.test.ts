import { describe, expect, it } from "vitest";
import { cleanBookTitle } from "./bookStore";

describe("book title cleanup", () => {
  it("removes source-domain suffixes without changing the actual title", () => {
    expect(cleanBookTitle("Zen and the Art of Motorcycle Maintenance (Robert M. Pirsig) (z-library.sk, 1lib.sk, z-lib.sk).epub"))
      .toBe("Zen and the Art of Motorcycle Maintenance (Robert M. Pirsig)");
  });
});
