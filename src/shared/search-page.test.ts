import { describe, expect, it } from "vitest";
import { normalizePageKey } from "./search-page";
describe("shared page identity", () => {
  it("matches the existing host/path join without treating neighbouring pages as the same", () => {
    expect(
      normalizePageKey("https://EXAMPLE.test/porcelain/?utm_source=x"),
    ).toBe(normalizePageKey("example.test/porcelain"));
    expect(normalizePageKey("example.test/porcelain-guide")).not.toBe(
      normalizePageKey("example.test/porcelain"),
    );
    expect(normalizePageKey("https://example.test/Porcelain")).not.toBe(
      normalizePageKey("https://example.test/porcelain"),
    );
  });
  it("preserves non-default ports and rejects missing page identity", () => {
    expect(normalizePageKey("https://example.test:8443/a")).toBe(
      "example.test:8443/a",
    );
    expect(normalizePageKey("(not set)")).toBeNull();
    expect(normalizePageKey("")).toBeNull();
  });
});
