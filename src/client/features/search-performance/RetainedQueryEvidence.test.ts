import { load } from "cheerio";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { retainedReport, type RetainedRow } from "@/shared/gsc-retained";
import { RetainedQueryEvidence } from "./RetainedQueryEvidence";

it("checks a city-named query against its reported country and device observations", () => {
  const row: RetainedRow = {
    date: "2026-03-01",
    query: "harpsichord repair Montreal",
    page: "https://example.test/repair",
    country: "USA",
    device: "MOBILE",
    impressions: 36,
    clicks: 2,
    position: 6,
  };
  const report = retainedReport(
    [
      row,
      { ...row, date: "2026-03-02", impressions: 4, position: 11 },
      {
        ...row,
        date: "2026-03-03",
        country: "ALL",
        device: "TABLET",
        impressions: 2,
      },
      { ...row, date: "2026-03-04", device: "ALL", impressions: 3 },
      { ...row, query: "piano repair", country: "CAN", device: "DESKTOP" },
    ],
    {
      projectId: "p",
      property: "sc-domain:example.test",
      revision: 1,
      notesRevision: 0,
      trackedOnly: false,
      startDate: "2026-03-01",
      endDate: "2026-03-04",
      country: "ALL",
      device: "ALL",
    },
  );
  function inspect(queryName: string, targetCountry: string) {
    const query = report.queries.find((item) => item.query === queryName)!;
    return load(
      renderToStaticMarkup(
        createElement(RetainedQueryEvidence, {
          query: { ...query, label: null },
          countries: report.countries,
          countryFilter: "ALL",
          targetCountry,
          onTargetChange: () => {},
        }),
      ),
    );
  }
  const absent = inspect(row.query, "CAN");
  expect(absent("p").first().text()).toBe("Query impressions in this view 45");
  expect(absent('[role="status"]').text()).toBe(
    "CAN impressions Unknown. No matching country row in this view.",
  );
  expect(
    absent("tbody tr")
      .toArray()
      .map((tr) =>
        absent(tr)
          .find("td")
          .toArray()
          .map((td) => absent(td).text()),
      ),
  ).toEqual([
    ["USA", "mobile", "40", "6.5"],
    ["USA", "Unknown", "3", "6.0"],
    ["Unknown", "tablet", "2", "6.0"],
  ]);
  expect(absent("section").text()).toContain(
    "Analytics measures visits. Won jobs are unknown without a linked sales record.",
  );
  expect(inspect(row.query, "USA")('[role="status"]').text()).toBe(
    "USA impressions 43",
  );
  const observed = inspect("piano repair", "CAN");
  expect(observed('[role="status"]').text()).toBe("CAN impressions 36");
  expect(
    observed("tbody td")
      .map((_, td) => observed(td).text())
      .get(),
  ).toEqual(["CAN", "desktop", "36", "6.0"]);
});
