import { useState, type FormEvent } from "react";
import { mapsCampaignInputSchema } from "@/shared/local-maps";
export function MapsCampaignForm({
  onCreate,
  onCancel,
  busy,
}: {
  onCreate: (
    input: ReturnType<typeof mapsCampaignInputSchema.parse>,
  ) => Promise<void>;
  onCancel: () => void;
  busy: boolean;
}) {
  const [id] = useState(() => crypto.randomUUID());
  const [name, setName] = useState("");
  const [kind, setKind] = useState("cid");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = mapsCampaignInputSchema.safeParse({
      id,
      name,
      business: { kind, value },
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the campaign");
      return;
    }
    setError("");
    await onCreate(parsed.data);
  }
  return (
    <form className="maps-setup-form" onSubmit={submit}>
      <h2>New campaign</h2>
      <fieldset disabled={busy} className="maps-form-fields">
        <label>
          Campaign name
          <input
            required
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Business ID type
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="cid">Google CID</option>
            <option value="placeId">Google place ID</option>
          </select>
        </label>
        <label className="maps-form-wide">
          Business ID
          <input
            required
            maxLength={kind === "cid" ? 64 : 256}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
      </fieldset>
      {error && (
        <p role="alert" className="maps-error">
          {error}
        </p>
      )}
      <div className="maps-form-actions">
        <button className="maps-action" disabled={busy}>
          {busy ? "Saving…" : "Create campaign"}
        </button>
        <button type="button" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
