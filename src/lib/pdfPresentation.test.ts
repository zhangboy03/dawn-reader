import { describe, expect, it } from "vitest";
import { paperAuthorLabel, paperYearFromMetadata } from "./paperMetadata";

describe("PDF paper presentation metadata", () => {
  it("uses the first author's surname as a compact shelf identity", () => {
    expect(paperAuthorLabel("Ada M. Lovelace; Grace Hopper")).toBe("Lovelace");
    expect(paperAuthorLabel("Lovelace, Ada M.")).toBe("Lovelace");
  });

  it("finds the first plausible publication year across PDF metadata", () => {
    expect(paperYearFromMetadata("D:20260224221658+08'00'", "Journal 584 (2026) 120869")).toBe("2026");
    expect(paperYearFromMetadata(null, "Published in 2024")).toBe("2024");
  });
});
