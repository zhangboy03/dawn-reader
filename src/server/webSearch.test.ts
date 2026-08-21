import { describe, expect, it } from "vitest";
import { plainTextFromSearchSnippet } from "./searchText";

describe("search result plain text", () => {
  it("decodes supported entities before removing markup", () => {
    expect(plainTextFromSearchSnippet('<span class="searchmatch">Dawn</span> &amp; Reader'))
      .toBe("Dawn & Reader");
  });

  it("does not let decoded content create surviving markup", () => {
    expect(plainTextFromSearchSnippet('&amp;<script>alert(1)</script> safe'))
      .toBe("&alert(1) safe");
  });
});
