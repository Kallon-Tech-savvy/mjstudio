import { useState, type FormEvent } from "react";
import { createGallery, type ClientRecord } from "@/lib/api";
import { ClientPicker, type ClientChoice } from "./ClientPicker";

type Props = {
  clients: ClientRecord[];
  /** Called after a gallery is created so the page can refresh galleries and clients. */
  onCreated: () => Promise<void>;
};

/** One short flow: choose or create the client, name the gallery, create. */
export function NewGalleryForm({ clients, onCreated }: Props) {
  const [choice, setChoice] = useState<ClientChoice | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!choice || !name.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const galleryName = name.trim();
      await createGallery(
        choice.kind === "existing"
          ? { clientId: choice.client.clientId, name: galleryName, expiresAt: null }
          : { newClient: { name: choice.name, email: choice.email, phone: choice.phone }, name: galleryName, expiresAt: null },
      );
      setChoice(null);
      setName("");
      await onCreated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create gallery.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={submit}>
      <ClientPicker clients={clients} value={choice} onChange={setChoice} />
      <div>
        <label className="mb-1.5 block text-sm opacity-70" htmlFor="new-gallery-name">
          Gallery name
        </label>
        <input
          id="new-gallery-name"
          className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-base text-inherit outline-none placeholder:text-white/40 focus:border-white/60"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Spring Session"
          maxLength={200}
        />
      </div>
      {error ? <div className="error-box">{error}</div> : null}
      <button className="primary-button" type="submit" disabled={!choice || !name.trim() || busy}>
        {busy ? "Creating…" : "Create gallery"}
      </button>
    </form>
  );
}
