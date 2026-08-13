import { describe, expect, it } from "vitest";
import { cleanBookTitle } from "./bookStore";

describe("book title cleanup", () => {
  it("removes source-domain suffixes without changing the actual title", () => {
    expect(cleanBookTitle("Zen and the Art of Motorcycle Maintenance (Robert M. Pirsig) (z-library.sk, 1lib.sk, z-lib.sk).epub"))
      .toBe("Zen and the Art of Motorcycle Maintenance (Robert M. Pirsig)");
  });

  it("cleans the supplied Outlive filename", () => {
    expect(cleanBookTitle("Outlive - The Science and Art of Longevity (Peter Attia, MD) (z-library.sk, 1lib.sk, z-lib.sk).epub"))
      .toBe("Outlive - The Science and Art of Longevity (Peter Attia, MD)");
  });
});
