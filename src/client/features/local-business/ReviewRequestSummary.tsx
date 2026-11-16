import { LOCATION_OPTIONS } from "@/shared/keyword-locations";
import type { getReviewReport } from "@/serverFunctions/localReviews";
type Task = Awaited<ReturnType<typeof getReviewReport>>["task"];
export const stateLabel = {
  prepared: "Not submitted",
  submitting: "Submission unconfirmed",
  queued: "Ready to collect",
  unknown: "Submission unconfirmed",
};
export function FrozenRequest({
  task,
  saved,
  uncertain,
}: {
  task: Task;
  saved: boolean;
  uncertain: boolean;
}) {
  return (
    <section className="reviews-frozen" aria-label="Saved request settings">
      <div>
        <span>
          {task.identityKind === "cid" ? "Google CID" : "Google place ID"}
        </span>
        <strong>{task.identityValue}</strong>
      </div>
      <div>
        <span>Market / language</span>
        <strong>
          {LOCATION_OPTIONS.find((option) => option.code === task.locationCode)
            ?.label ?? task.locationCode}{" "}
          · {task.languageCode}
        </strong>
      </div>
      <div>
        <span>Requested sample</span>
        <strong>
          {task.depth} ·{" "}
          {task.includeOtherSources
            ? "Extended reviews"
            : task.sortBy.replaceAll("_", " ")}
        </strong>
      </div>
      <div>
        <span>Request status</span>
        <strong>
          {saved
            ? "Saved report"
            : uncertain
              ? "Submission unconfirmed"
              : stateLabel[task.state]}
        </strong>
      </div>
    </section>
  );
}
