import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";

import {
  type ClientRecord,
  type GalleryRecord,
  type WorkflowStatus,
  createGallery,
  getPhotographerMe,
  listClients,
  listGalleries,
} from "@/lib/api";
import "./../styles/Gallery.css";

type ClientMode = "existing" | "new";

const WORKFLOW_OPTIONS: { value: WorkflowStatus; label: string; hint: string }[] = [
  { value: "draft", label: "Draft", hint: "Still preparing" },
  { value: "reviewing", label: "Reviewing", hint: "Client is choosing" },
  { value: "completed", label: "Completed", hint: "All done" },
];

/** Value for <input type="datetime-local"> in the user's local time. */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function clientLabel(client: ClientRecord): string {
  return client.name || client.email || client.phone || "Unnamed client";
}

function Gallery() {
  const navigate = useNavigate();

  const [galleries, setGalleries] = useState<GalleryRecord[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [clientMode, setClientMode] = useState<ClientMode>("existing");
  const [clientId, setClientId] = useState("");
  const [newClient, setNewClient] = useState({ name: "", email: "", phone: "" });

  const [name, setName] = useState("");
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus>("draft");
  const [expiresAt, setExpiresAt] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    const [galleryResponse, clientResponse] = await Promise.all([
      listGalleries(1, 20),
      listClients(1, 100),
    ]);
    setGalleries(galleryResponse.items ?? []);
    setClients(clientResponse.items ?? []);
    return clientResponse.items ?? [];
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        const me = await getPhotographerMe();
        if (!me?.user) {
          navigate("/photographer/login", { replace: true });
          return;
        }
        const loadedClients = await refresh();
        // No clients yet: go straight to creating one.
        if (loadedClients.length === 0) setClientMode("new");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to load galleries.");
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, [navigate, refresh]);

  const resetForm = () => {
    setName("");
    setWorkflowStatus("draft");
    setExpiresAt("");
    setNewClient({ name: "", email: "", phone: "" });
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!name.trim()) {
      setError("Give the gallery a name.");
      return;
    }
    if (clientMode === "existing" && !clientId) {
      setError("Choose a client, or switch to “New client”.");
      return;
    }
    const expiresIso = toIso(expiresAt);
    if (expiresIso && new Date(expiresIso) <= new Date()) {
      setError("The expiry date must be in the future.");
      return;
    }

    setSubmitting(true);
    try {
      // Blank fields must be omitted: the server rejects empty strings.
      const details = Object.fromEntries(
        Object.entries({
          name: newClient.name.trim(),
          email: newClient.email.trim(),
          phone: newClient.phone.trim(),
        }).filter(([, value]) => value),
      );

      await createGallery({
        ...(clientMode === "new" ? { newClient: details } : { clientId }),
        name: name.trim(),
        workflowStatus,
        expiresAt: expiresIso,
      });

      await refresh();
      setNotice(`“${name.trim()}” was created.`);
      resetForm();
      setClientId("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create gallery.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="gallery-page">
      <div className="gallery-shell">
        <header className="gallery-header">
          <div>
            <p className="gallery-eyebrow">Photographer</p>
            <h1>Galleries</h1>
          </div>
          <Link to="/photographer/dashboard" className="g-btn g-btn-ghost">
            Back to dashboard
          </Link>
        </header>

        <form className="g-card" onSubmit={handleCreate} noValidate>
          <h2 className="g-card-title">New gallery</h2>

          {/* Step 1 */}
          <section className="g-step">
            <div className="g-step-head">
              <span className="g-step-num">1</span>
              <div>
                <h3>Who is it for?</h3>
                <p>Pick an existing client or add one now. Every client detail is optional.</p>
              </div>
            </div>

            <div className="g-segment" role="tablist" aria-label="Client source">
              <button
                type="button"
                role="tab"
                aria-selected={clientMode === "existing"}
                className={clientMode === "existing" ? "is-active" : ""}
                onClick={() => setClientMode("existing")}
                disabled={clients.length === 0}
              >
                Existing client
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={clientMode === "new"}
                className={clientMode === "new" ? "is-active" : ""}
                onClick={() => setClientMode("new")}
              >
                New client
              </button>
            </div>

            {clientMode === "existing" ? (
              <label className="g-field">
                <span>Client</span>
                <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
                  <option value="">Select a client…</option>
                  {clients.map((client) => (
                    <option key={client.clientId} value={client.clientId}>
                      {clientLabel(client)}
                      {client.email ? ` · ${client.email}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="g-grid g-grid-3">
                <label className="g-field">
                  <span>Name <em>optional</em></span>
                  <input
                    value={newClient.name}
                    onChange={(e) => setNewClient((c) => ({ ...c, name: e.target.value }))}
                    placeholder="Amara Bangura"
                    autoComplete="off"
                  />
                </label>
                <label className="g-field">
                  <span>Email <em>optional</em></span>
                  <input
                    type="email"
                    value={newClient.email}
                    onChange={(e) => setNewClient((c) => ({ ...c, email: e.target.value }))}
                    placeholder="name@example.com"
                    autoComplete="off"
                  />
                </label>
                <label className="g-field">
                  <span>Phone <em>optional</em></span>
                  <input
                    type="tel"
                    value={newClient.phone}
                    onChange={(e) => setNewClient((c) => ({ ...c, phone: e.target.value }))}
                    placeholder="+232 …"
                    autoComplete="off"
                  />
                </label>
              </div>
            )}
          </section>

          {/* Step 2 */}
          <section className="g-step">
            <div className="g-step-head">
              <span className="g-step-num">2</span>
              <div>
                <h3>Gallery details</h3>
                <p>Only the name is required.</p>
              </div>
            </div>

            <label className="g-field">
              <span>Gallery name <em className="g-required">required</em></span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Spring Session"
                required
              />
            </label>

            <label className="g-field">
              <span>Expires <em>optional</em></span>
              <input
                type="datetime-local"
                value={expiresAt}
                min={toLocalInput(new Date())}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </label>
          </section>

          {/* Step 3 */}
          <section className="g-step">
            <div className="g-step-head">
              <span className="g-step-num">3</span>
              <div>
                <h3>Progress</h3>
                <p>You can change this later.</p>
              </div>
            </div>

            <fieldset className="g-choice-group">
              <legend>Workflow status</legend>
              <div className="g-choices">
                {WORKFLOW_OPTIONS.map((option) => (
                  <label key={option.value} className={workflowStatus === option.value ? "is-selected" : ""}>
                    <input
                      type="radio"
                      name="workflowStatus"
                      value={option.value}
                      checked={workflowStatus === option.value}
                      onChange={() => setWorkflowStatus(option.value)}
                    />
                    <strong>{option.label}</strong>
                    <small>{option.hint}</small>
                  </label>
                ))}
              </div>
            </fieldset>

            <p className="g-note">
              New galleries start <strong>unpublished</strong>. Publish from the gallery page once photos are
              uploaded and access is set up.
            </p>
          </section>

          <div aria-live="polite">
            {error ? <div className="g-alert g-alert-error" role="alert">{error}</div> : null}
            {notice ? <div className="g-alert g-alert-ok">{notice}</div> : null}
          </div>

          <div className="g-actions">
            <button className="g-btn g-btn-primary" type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create gallery"}
            </button>
          </div>
        </form>

        <section className="g-card">
          <h2 className="g-card-title">Your galleries</h2>
          {loading ? (
            <p className="g-empty">Loading…</p>
          ) : galleries.length === 0 ? (
            <p className="g-empty">No galleries yet. Your first one will appear here.</p>
          ) : (
            <ul className="g-list">
              {galleries.map((gallery) => {
                const publication = String(gallery.publicationStatus ?? "unpublished");
                const workflow = String(gallery.workflowStatus ?? gallery.status ?? "draft");
                const client = clients.find((c) => c.clientId === gallery.clientId);
                return (
                  <li key={gallery.galleryId} className="g-row">
                    <div className="g-row-main">
                      <strong>{gallery.name}</strong>
                      <small>{client ? clientLabel(client) : "No client details"}</small>
                    </div>
                    <div className="g-row-badges">
                      <span className="g-badge">{workflow}</span>
                      <span className={`g-badge ${publication === "published" ? "g-badge-live" : ""}`}>
                        {publication}
                      </span>
                    </div>
                    <Link to={`/photographer/galleries/${gallery.galleryId}`} className="g-link">
                      Open
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

export default Gallery;