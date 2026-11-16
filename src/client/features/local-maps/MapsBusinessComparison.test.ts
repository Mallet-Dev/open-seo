import { createElement } from "react";
import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { mapsFixture } from "./mapsFixture";
import { MapsBusinessComparison } from "./MapsBusinessComparison";

it("compares exact identities even when names match, and leaves absent ranks unobserved", () => {
  const props = {
    run: mapsFixture("11000000-0000-4000-8000-000000000001", false),
    business: { kind: "cid" as const, value: "example-northline" },
    name: "Same name",
    competitorName: "Same name",
  };
  expect(
    renderToStaticMarkup(
      createElement(MapsBusinessComparison, {
        ...props,
        competitor: props.business,
      }),
    ),
  ).toBe("");
  const output = renderToStaticMarkup(
    createElement(MapsBusinessComparison, {
      ...props,
      competitor: { kind: "cid", value: "not-returned" },
    }),
  );
  expect(output).toContain('aria-label="Business comparison"');
  expect(output).toContain("Not observed");
  expect(output).not.toContain("0.0");
  expect(output).toContain("Missing results have no observed rank.");
});
