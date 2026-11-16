import type { BrandLookupResult } from "@/types/schemas/ai-search";

const count = new Intl.NumberFormat("en-CA");
const monthLabel = new Intl.DateTimeFormat("en-CA", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function BrandLookupMentionTrendCard({
  result,
}: {
  result: Pick<BrandLookupResult, "monthlyVolume">;
}) {
  const months = result.monthlyVolume;
  const maximum = Math.max(0, ...months.map((month) => month.volume ?? 0));
  return (
    <figure className="ai-volume-series">
      <figcaption>
        Sum of reported search volumes across sampled prompts and platforms.
        Only returned months are shown.
      </figcaption>
      <ol aria-label="Monthly prompt search volume">
        {months.map(({ year, month, volume }) => (
          <li key={`${year}-${month}`}>
            <time dateTime={`${year}-${String(month).padStart(2, "0")}`}>
              {monthLabel.format(Date.UTC(year, month - 1, 1))}
            </time>
            <span className="ai-volume-track" aria-hidden="true">
              {volume !== null && maximum > 0 && (
                <i style={{ width: `${(volume / maximum) * 100}%` }} />
              )}
            </span>
            <strong>
              {volume === null ? "Unknown" : count.format(volume)}
            </strong>
          </li>
        ))}
      </ol>
    </figure>
  );
}
