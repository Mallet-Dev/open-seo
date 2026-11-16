import Papa from "papaparse";
import { expect, it } from "vitest";
import { retainedQueryCsv } from "./retainedQueryExport";

it("carries the filtered order, comparison window and source revision into the CSV", () => {
  const row = {
    query: "tile",
    clicks: 0,
    impressions: 12,
    position: null,
    ctr: 0,
    improvement: null,
    previousPosition: null,
    dominantPage: "https://example.test/tile",
    daysObserved: 1,
    segments: [],
    pageCount: 1,
    label: null,
  };
  const file = retainedQueryCsv(
    {
      property: "sc-domain:example.test",
      revision: 4,
      previousStart: "2026-10-02",
      previousEnd: "2026-10-31",
    },
    [
      { ...row, query: "tile installation" },
      { ...row, daysObserved: 0, impressions: 0 },
    ],
    { startDate: "2026-11-01", endDate: "2026-11-30" },
    { device: "MOBILE", country: "CAN", trackedOnly: true, notesRevision: 2 },
    "tile",
  );
  const { data, errors } = Papa.parse<Record<string, string>>(file, {
    header: true,
  });
  expect(errors).toEqual([]);
  expect(data.map((item) => item.Query)).toEqual(["tile installation", "tile"]);
  expect(data[1]).toMatchObject({ Clicks: "", Impressions: "" });
  expect(data[0]).toMatchObject({
    Clicks: "0",
    Position: "",
    Property: "sc-domain:example.test",
    "Source revision": "4",
    "Tracking revision": "2",
    "End date": "2026-11-30",
    "Previous end": "2026-10-31",
    Device: "MOBILE",
    Country: "CAN",
    "Tracked only": "true",
    "Query filter": "tile",
  });
});
