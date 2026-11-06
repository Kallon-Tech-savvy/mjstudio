import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ApiError,
  type ClientRecord,
  type GalleryRecord,
  getPhotographerMe,
  listClients,
  listGalleries,
} from "@/lib/api";
import { NewGalleryForm } from "../components/NewGalleryForm";

export default function PhotographerGalleriesPage() {
  const navigate = useNavigate();
  const [galleries, setGalleries] = useState<GalleryRecord[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const startGallery = () => {
    setCreating(true);
    requestAnimationFrame(() => {
      const input = document.getElementById("new-gallery-name");
      input?.scrollIntoView({ block: "center" });
      input?.focus({ preventScroll: true });
    });
  };
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const me = await getPhotographerMe();
      if (!me?.user) {
        navigate("/photographer/login", { replace: true });
        return;
      }
      const [response, clientResponse] = await Promise.all([
        listGalleries(1, 20),
        listClients(1, 100),
      ]);
      setGalleries(response.items ?? []);
      setClients(clientResponse.items ?? []);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        navigate("/photographer/login", { replace: true });
        return;
      }
      setError(
        caught instanceof Error ? caught.message : "Unable to load galleries.",
      );
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    void load();
  }, [load]);
  const visible = galleries.filter((gallery) =>
    `${gallery.name} ${gallery.clientName ?? ""}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );

  const showCreator =
    creating || (!loading && !error && galleries.length === 0);

  return (
    <main className="page-shell studio-library">
      <nav className="studio-masthead" aria-label="Studio navigation">
        <Link to="/photographer/dashboard" className="studio-wordmark">
          mj<span>studio / workspace</span>
        </Link>
        <Link to="/photographer/dashboard" className="tiny-link">
          ← Dashboard
        </Link>
      </nav>
      <header className="library-heading">
        <div>
          <p className="eyebrow">The studio / Galleries</p>
          <h1>
            {showCreator
              ? "Make space for the story."
              : "Your work. Their memories."}
          </h1>
          <p className="muted">
            {showCreator
              ? "A few details, then you’re ready to add photographs."
              : "Prepare a gallery, gather their favourites, deliver something personal."}
          </p>
        </div>
        {!loading && !error && !showCreator ? (
          <button
            type="button"
            className="primary-button"
            aria-expanded={false}
            onClick={startGallery}
          >
            + New gallery
          </button>
        ) : creating && galleries.length > 0 ? (
          <button
            type="button"
            className="button-ghost"
            onClick={() => setCreating(false)}
          >
            Back to collection
          </button>
        ) : null}
      </header>

      {loading ? (
        <output className="panel library-message">
          Getting your studio ready…
        </output>
      ) : error ? (
        <div className="error-box" role="alert">
          {error}
          <button
            className="secondary-button"
            type="button"
            onClick={() => void load()}
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          <section
            id="gallery-creator"
            className="gallery-creator"
            aria-label="Create a gallery"
            hidden={!showCreator}
          >
            <NewGalleryForm
              clients={clients}
              onCreated={(gallery) =>
                navigate(
                  `/photographer/galleries/${encodeURIComponent(gallery.galleryId)}?created=1#photo-upload`,
                )
              }
            />
          </section>
          <section
            className="gallery-library"
            hidden={showCreator}
            aria-labelledby="gallery-library-title"
          >
            <header className="library-toolbar">
              <div>
                <p className="eyebrow">The collection</p>
                <h2 id="gallery-library-title">
                  Recent galleries{" "}
                  <span className="library-count">{galleries.length}</span>
                </h2>
              </div>
              {galleries.length > 0 ? (
                <label className="field library-search">
                  <span>Find in recent galleries</span>
                  <input
                    type="search"
                    placeholder="Gallery or client name"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
              ) : null}
            </header>
            {galleries.length === 0 ? (
              <div className="library-empty">
                <span aria-hidden="true">01 /</span>
                <div>
                  <h3>Your first story starts above.</h3>
                  <p className="muted">
                    Create a private gallery, add your photographs, then prepare
                    client access.
                  </p>
                </div>
              </div>
            ) : visible.length === 0 ? (
              <output className="library-message">
                No matches in your recent galleries. Try a different name.
              </output>
            ) : (
              <ul className="gallery-card-grid">
                {visible.map((gallery, index) => (
                  <li key={gallery.galleryId}>
                    <Link
                      className="gallery-library-card"
                      to={`/photographer/galleries/${gallery.galleryId}`}
                    >
                      <div className="gallery-card-top">
                        <span className="gallery-index">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="tag">
                          {gallery.selectionStatus === "submitted"
                            ? "Selection received"
                            : (gallery.status ?? "draft")}
                        </span>
                      </div>
                      <h3>{gallery.name}</h3>
                      <p>{gallery.clientName ?? "Client gallery"}</p>
                      <div className="gallery-card-bottom">
                        <span>
                          {gallery.selectionStatus === "submitted"
                            ? `${gallery.selectedCount ?? 0} selected · Review selections`
                            : "Open workspace"}
                        </span>
                        <span aria-hidden="true">↗</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {galleries.length === 20 ? (
              <p className="muted">Showing the 20 most recent galleries.</p>
            ) : null}
          </section>
        </>
      )}
    </main>
  );
}
