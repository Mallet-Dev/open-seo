import { useState, type FormEvent } from "react";
import { LocationSelect } from "@/client/components/LocationSelect";
import { SERP_LANGUAGE_OPTIONS } from "@/shared/keyword-locations";
import {
  reviewTaskRequestSchema,
  type ReviewTaskRequest,
} from "@/shared/local-reviews";
export function ReviewDraftForm({
  market,
  onPrepare,
  busy,
  onCancel,
}: {
  market: { locationCode: number; languageCode: string };
  onPrepare: (request: ReviewTaskRequest) => Promise<void>;
  busy: boolean;
  onCancel?: () => void;
}) {
  const [kind, setKind] = useState("cid");
  const [value, setValue] = useState("");
  const [location, setLocation] = useState(market.locationCode);
  const [language, setLanguage] = useState(market.languageCode);
  const [depth, setDepth] = useState(20);
  const [sort, setSort] = useState("newest");
  const [extended, setExtended] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = reviewTaskRequestSchema.safeParse({
      business: { kind, value },
      locationCode: location,
      languageCode: language,
      depth,
      sortBy: sort,
      includeOtherSources: extended,
    });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Check the request");
      return;
    }
    setError("");
    await onPrepare(result.data);
  }
  return (
    <form className="reviews-draft" onSubmit={submit}>
      <div className="reviews-form-grid">
        <label>
          Business ID type
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            <option value="cid">Google CID</option>
            <option value="placeId">Google place ID</option>
          </select>
        </label>
        <label className="reviews-business-id">
          Business ID
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            required
          />
        </label>
        <fieldset>
          <legend>Market</legend>
          <LocationSelect value={location} onChange={setLocation} />
        </fieldset>
        <label>
          Language
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
          >
            {SERP_LANGUAGE_OPTIONS.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Requested reviews
          <input
            type="number"
            min={10}
            max={200}
            value={depth}
            onChange={(event) => setDepth(Number(event.target.value))}
          />
        </label>
        <label>
          Sort
          <select
            value={sort}
            disabled={extended}
            onChange={(event) => setSort(event.target.value)}
          >
            <option value="newest">Newest</option>
            <option value="highest_rating">Highest rating</option>
            <option value="lowest_rating">Lowest rating</option>
            <option value="relevant">Relevant</option>
          </select>
        </label>
      </div>
      <label className="reviews-check">
        <input
          type="checkbox"
          checked={extended}
          onChange={(event) => setExtended(event.target.checked)}
        />
        Include third-party sources
      </label>
      {extended ? (
        <p className="reviews-notice">
          Extended collection pricing needs verification. You can prepare this
          request and open saved extended reports.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="maps-error">
          {error}
        </p>
      ) : null}
      <div className="reviews-actions">
        <button className="maps-action" type="submit" disabled={busy}>
          Prepare request
        </button>
        {onCancel ? (
          <button
            className="maps-action maps-action-secondary"
            type="button"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
