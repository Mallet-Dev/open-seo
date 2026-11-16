import { useState } from "react";
import { ChevronDown, Columns2 } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { KeywordResearchRow } from "@/types/keywords";
import { INTENT_LABELS } from "../components/IntentBadge";
import { formatCompactNumber } from "../utils";

import {
  comparisonMonths,
  formatComparisonMonth,
  type KeywordPair,
} from "./keywordComparisonMonths";

export function KeywordComparison({ rows }: { rows: KeywordResearchRow[] }) {
  const [firstName, setFirst] = useState("");
  const [secondName, setSecond] = useState("");
  const [expanded, setExpanded] = useState(false);
  const first = rows.find((row) => row.keyword === firstName) ?? rows[0];
  const second =
    rows.find((row) => row.keyword === secondName && row !== first) ??
    rows.find((row) => row !== first);
  if (!first || !second) return null;

  const pair: KeywordPair = [first, second];
  const metrics = [
    [
      "Monthly searches",
      ...pair.map((row) => row.searchVolume?.toLocaleString()),
    ],
    ["Difficulty / 100", ...pair.map((row) => row.keywordDifficulty)],
    ["CPC (USD)", ...pair.map((row) => row.cpc?.toFixed(2))],
    ["Ad competition / 1", ...pair.map((row) => row.competition?.toFixed(2))],
    ["Search intent", ...pair.map((row) => INTENT_LABELS[row.intent])],
  ];
  const months = expanded ? comparisonMonths(pair) : [];

  return (
    <details
      className="mb-3 rounded-xl border border-primary/35 bg-base-100"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3 font-medium text-primary">
        <Columns2 className="size-4" aria-hidden /> Compare selected keywords
        <ChevronDown
          className={`ml-auto size-4 ${expanded ? "rotate-180" : ""}`}
          aria-hidden
        />
      </summary>
      {expanded && (
        <div className="grid gap-4 border-t border-base-300 p-4 lg:grid-cols-2">
          <div className="min-w-0 overflow-auto">
            <table className="table table-sm">
              <caption className="sr-only">Keyword comparison</caption>
              <thead>
                <tr>
                  <th scope="col">Metric</th>
                  {pair.map((row, i) => (
                    <th scope="col" key={i}>
                      <select
                        aria-label={
                          i === 0 ? "First keyword" : "Second keyword"
                        }
                        className="select select-bordered select-sm w-full min-w-24 max-w-52"
                        value={row.keyword}
                        onChange={(event) =>
                          (i === 0 ? setFirst : setSecond)(event.target.value)
                        }
                      >
                        {rows.map((option) => (
                          <option
                            key={option.keyword}
                            disabled={option === pair[1 - i]}
                          >
                            {option.keyword}
                          </option>
                        ))}
                      </select>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metrics.map(([label, a, b]) => (
                  <tr key={label}>
                    <th scope="row" className="font-medium">
                      {label}
                    </th>
                    <td className="tabular-nums">{a ?? "Unavailable"}</td>
                    <td className="tabular-nums">{b ?? "Unavailable"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <figure className="min-w-0">
            <figcaption className="mb-2 text-sm font-semibold">
              Monthly search volume
            </figcaption>
            {months.length > 0 ? (
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={months}
                    margin={{ left: 0, right: 15, top: 8 }}
                  >
                    <CartesianGrid
                      stroke="currentColor"
                      opacity={0.12}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="month"
                      type="number"
                      domain={["dataMin", "dataMax"]}
                      allowDecimals={false}
                      tickFormatter={formatComparisonMonth}
                      minTickGap={26}
                      tick={{ fontSize: 10 }}
                    />
                    <YAxis width={46} tickFormatter={formatCompactNumber} />
                    <Tooltip
                      labelFormatter={(month) =>
                        formatComparisonMonth(Number(month))
                      }
                      contentStyle={{
                        background: "var(--color-base-100)",
                        color: "var(--color-base-content)",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line
                      dataKey="first"
                      name={first.keyword}
                      stroke="var(--color-primary)"
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      isAnimationActive={false}
                    />
                    <Line
                      dataKey="second"
                      name={second.keyword}
                      stroke="#ef7625"
                      strokeWidth={2}
                      strokeDasharray="4 3"
                      dot={{ r: 2 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-base-content/65">
                Monthly history is unavailable for these keywords.
              </p>
            )}
          </figure>
        </div>
      )}
    </details>
  );
}
