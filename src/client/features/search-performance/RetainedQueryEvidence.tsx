import { useId } from "react";
import type { Report } from "./RetainedSearchPerformance";

type Query = Report["queries"][number];
const count = new Intl.NumberFormat("en-CA");

export function RetainedQueryEvidence({
  query,
  countries,
  countryFilter,
  targetCountry,
  onTargetChange,
}: {
  query: Query;
  countries: string[];
  countryFilter: string;
  targetCountry: string;
  onTargetChange: (country: string) => void;
}) {
  const choices = useId();
  const country = countryFilter === "ALL" ? targetCountry : countryFilter;
  const validCountry = /^[A-Z]{3}$/.test(country) && country !== "ALL";
  const matched = query.segments.filter((row) => row.country === country);
  return (
    <section className="my-4 space-y-3 text-xs" aria-label="Query evidence">
      <p>
        <strong>Query impressions in this view</strong>{" "}
        {query.daysObserved ? count.format(query.impressions) : "Unknown"}
      </p>
      {countryFilter === "ALL" && (
        <label className="block">
          Target country (3-letter code)
          <input
            className="input input-bordered input-sm mt-1 w-full"
            list={choices}
            placeholder="e.g. CAN"
            maxLength={3}
            value={targetCountry}
            onChange={(event) =>
              onTargetChange(event.target.value.toUpperCase())
            }
          />
          <datalist id={choices}>
            {countries
              .filter((code) => code !== "ALL")
              .map((code) => (
                <option key={code} value={code} />
              ))}
          </datalist>
        </label>
      )}
      <p role="status">
        {validCountry ? (
          <>
            <strong>{country} impressions</strong>{" "}
            {matched.length
              ? count.format(matched.reduce((n, row) => n + row.impressions, 0))
              : "Unknown. No matching country row in this view."}
          </>
        ) : (
          "Enter a 3-letter country code to check its impressions."
        )}
      </p>
      {query.segments.length > 0 && (
        <table className="w-full text-left">
          <caption className="sr-only">
            Observed country and device for this query
          </caption>
          <thead>
            <tr>
              <th scope="col">Country</th>
              <th scope="col">Device</th>
              <th scope="col" className="text-right">
                Impressions
              </th>
              <th scope="col" className="text-right">
                Avg. position
              </th>
            </tr>
          </thead>
          <tbody>
            {query.segments.map((row) => (
              <tr key={`${row.country}:${row.device}`}>
                <td>{row.country === "ALL" ? "Unknown" : row.country}</td>
                <td>
                  {row.device === "ALL" ? "Unknown" : row.device.toLowerCase()}
                </td>
                <td className="text-right">{count.format(row.impressions)}</td>
                <td className="text-right">
                  {row.position?.toFixed(1) ?? "Unknown"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p>
        Analytics measures visits. Won jobs are unknown without a linked sales
        record.
      </p>
    </section>
  );
}
