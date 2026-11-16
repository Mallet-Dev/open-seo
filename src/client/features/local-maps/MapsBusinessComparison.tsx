import {
  mapsRunSummary,
  type MapsBusiness,
  type MapsRun,
} from "@/shared/local-maps";

export function MapsBusinessComparison({
  run,
  business,
  name,
  competitor,
  competitorName,
}: {
  run: MapsRun;
  business: MapsBusiness;
  name: string;
  competitor: MapsBusiness;
  competitorName: string;
}) {
  if (business.kind === competitor.kind && business.value === competitor.value)
    return null;
  const rows = [
    { name, summary: mapsRunSummary(run, business) },
    { name: competitorName, summary: mapsRunSummary(run, competitor) },
  ];
  return (
    <section
      className="maps-business-comparison"
      aria-label="Business comparison"
    >
      <h2>Business comparison</h2>
      <div
        className="maps-comparison-scroll"
        tabIndex={0}
        role="region"
        aria-label="Business comparison table"
      >
        <table>
          <thead>
            <tr>
              <th scope="col">Business</th>
              <th scope="col">Found</th>
              <th scope="col">Top three</th>
              <th scope="col">Average where found</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ name: label, summary }, index) => (
              <tr key={index}>
                <th scope="row">{label}</th>
                <td>
                  {summary.found} / {summary.successful}
                </td>
                <td>
                  {summary.top3} / {summary.successful}
                </td>
                <td>
                  {summary.averageWhereFound === null
                    ? "Not observed"
                    : summary.averageWhereFound.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Same scan and successful points. Averages use each business’s returned
        ranks. Missing results have no observed rank.
      </p>
    </section>
  );
}
