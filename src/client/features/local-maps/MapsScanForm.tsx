import { useState, type FormEvent } from "react";
import {
  mapsScanInputSchema,
  type MapsScanInput,
} from "@/shared/maps-collection";
import { SERP_LANGUAGE_OPTIONS } from "@/shared/keyword-locations";
export function MapsScanForm({
  languageCode,
  onPrepare,
  onCancel,
  busy,
}: {
  languageCode: string;
  onPrepare: (input: MapsScanInput) => Promise<void>;
  onCancel: () => void;
  busy: boolean;
}) {
  const [query, setQuery] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [gridSize, setGridSize] = useState(3);
  const [spacing, setSpacing] = useState("2");
  const [language, setLanguage] = useState(languageCode);
  const [device, setDevice] = useState("mobile");
  const [depth, setDepth] = useState("20");
  const [rankBasis, setRankBasis] = useState("absolute");
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = mapsScanInputSchema.safeParse({
      query,
      center: {
        latitude: latitude.trim() ? Number(latitude) : NaN,
        longitude: longitude.trim() ? Number(longitude) : NaN,
      },
      gridSize,
      spacingKm: Number(spacing),
      languageCode: language,
      device,
      depth: Number(depth),
      rankBasis,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the scan settings");
      return;
    }
    setError("");
    await onPrepare(parsed.data);
  }
  return (
    <form className="maps-setup-form" onSubmit={submit}>
      <h2>New geographic scan</h2>
      <fieldset disabled={busy} className="maps-form-fields">
        <label className="maps-form-wide">
          Search query
          <input
            required
            maxLength={120}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          Centre latitude
          <input
            type="number"
            step="any"
            min={-90}
            max={90}
            required
            value={latitude}
            onChange={(e) => setLatitude(e.target.value)}
          />
        </label>
        <label>
          Centre longitude
          <input
            type="number"
            step="any"
            min={-180}
            max={180}
            required
            value={longitude}
            onChange={(e) => setLongitude(e.target.value)}
          />
        </label>
        <label>
          Grid
          <select
            value={gridSize}
            onChange={(e) => setGridSize(Number(e.target.value))}
          >
            <option value={3}>3 × 3 · 9 points</option>
            <option value={5}>5 × 5 · 25 points</option>
          </select>
        </label>
        <label>
          Point spacing, km
          <input
            type="number"
            step="0.25"
            min="0.25"
            max="10"
            required
            value={spacing}
            onChange={(e) => setSpacing(e.target.value)}
          />
        </label>
        <label>
          Language
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            {SERP_LANGUAGE_OPTIONS.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Device
          <select value={device} onChange={(e) => setDevice(e.target.value)}>
            <option value="mobile">Mobile</option>
            <option value="desktop">Desktop</option>
          </select>
        </label>
        <label>
          Requested depth
          <input
            type="number"
            min="1"
            max="700"
            required
            value={depth}
            onChange={(e) => setDepth(e.target.value)}
          />
        </label>
        <label>
          Rank basis
          <select
            value={rankBasis}
            onChange={(e) => setRankBasis(e.target.value)}
          >
            <option value="absolute">Absolute position</option>
            <option value="group">Position within business results</option>
          </select>
        </label>
      </fieldset>
      {error && (
        <p role="alert" className="maps-error">
          {error}
        </p>
      )}
      <div className="maps-form-actions">
        <button className="maps-action" disabled={busy}>
          {busy ? "Saving…" : "Review settings and cost"}
        </button>
        <button type="button" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
