import { useCallback, useEffect, useRef, useState } from "react";
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
  const [clientPage, setClientPage] = useState(1);
  const [clientTotal, setClientTotal] = useState(0);
  const [loadingClients, setLoadingClients] = useState(false);
  const [clientError, setClientError] = useState("");
  const clientRequest = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const requestVersion = useRef(0);
  const retryPage = useRef(1);
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

  const load = useCallback(
    async (targetPage = 1) => {
      const version = ++requestVersion.current;
      retryPage.current = targetPage;
      setLoading(true);
      setError("");
      try {
        const me = await getPhotographerMe();
        if (version !== requestVersion.current) return;
        if (!me?.user) {
          navigate("/photographer/login", { replace: true });
          return;
        }
        const [response, clientResponse] = await Promise.all([
          listGalleries(targetPage, 20),
          listClients(1, 100),
        ]);
        if (version !== requestVersion.current) return;
        const lastPage = Math.max(1, Math.ceil(response.total / 20));
        if (targetPage > lastPage) {
          void load(lastPage);
          return;
        }
        setGalleries(response.items ?? []);
        setTotal(response.total);
        setPage(targetPage);
        setLoaded(true);
        setQuery("");
        setClients(clientResponse.items ?? []);
        setClientPage(1);
        setClientTotal(clientResponse.total);
        setClientError("");
      } catch (caught) {
        if (version !== requestVersion.current) return;
        if (caught instanceof ApiError && caught.status === 401) {
          navigate("/photographer/login", { replace: true });
          return;
        }
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load galleries.",
        );
      } finally {
        if (version === requestVersion.current) setLoading(false);
      }
    },
    [navigate],
  );

  useEffect(() => {
    void load();
    return () => {
      requestVersion.current += 1;
    };
  }, [load]);
  const loadMoreClients = async () => {
    if (clientRequest.current || loading || clientPage * 100 >= clientTotal)
      return;
    clientRequest.current = true;
    const version = requestVersion.current;
    setLoadingClients(true);
    setClientError("");
    try {
      const response = await listClients(clientPage + 1, 100);
      if (version !== requestVersion.current) return;
      setClients((current) =>
        Array.from(
          new Map(
            [...current, ...response.items].map((client) => [
              client.clientId,
              client,
            ]),
          ).values(),
        ),
      );
      setClientPage((current) => current + 1);
      setClientTotal(response.total);
    } catch (caught) {
      if (version !== requestVersion.current) return;
      setClientError(
        caught instanceof Error
          ? caught.message
          : "Unable to load more clients.",
      );
    } finally {
      clientRequest.current = false;
      setLoadingClients(false);
    }
  };

  const visible = galleries.filter((gallery) =>
    `${gallery.name} ${gallery.clientName ?? ""}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );

  const showCreator = creating || (loaded && total === 0);

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

      {loading && !loaded ? (
        <output className="panel library-message">
          Getting your studio ready…
        </output>
      ) : null}
      {error ? (
        <div className="error-box" role="alert">
          {error}
          <button
            className="secondary-button"
            type="button"
            onClick={() => void load(retryPage.current)}
          >
            Try again
          </button>
        </div>
      ) : null}
      {loaded ? (
        <>
          <section
            id="gallery-creator"
            className="gallery-creator"
            aria-label="Create a gallery"
            hidden={!showCreator}
          >
            <NewGalleryForm
              clients={clients}
              clientTotal={clientTotal}
              hasMoreClients={clientPage * 100 < clientTotal}
              loadingClients={loadingClients}
              clientError={clientError}
              onLoadMoreClients={() => void loadMoreClients()}
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
                  Galleries <span className="library-count">{total}</span>
                </h2>
              </div>
              {galleries.length > 0 ? (
                <label className="field library-search">
                  <span>Find on this page</span>
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
                No matches on this page. Try another name or browse another
                page.
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
            <nav
              className="photo-library-pagination"
              aria-label="Gallery pages"
            >
              <button
                type="button"
                className="button-ghost"
                disabled={loading || page <= 1}
                onClick={() => void load(page - 1)}
              >
                Previous page
              </button>
              <output aria-live="polite">
                {loading
                  ? "Loading galleries…"
                  : `Page ${page} of ${Math.max(1, Math.ceil(total / 20))} · ${total} galleries`}
              </output>
              <button
                type="button"
                className="button-ghost"
                disabled={loading || page * 20 >= total}
                onClick={() => void load(page + 1)}
              >
                Next page
              </button>
              <button
                type="button"
                className="button-ghost"
                disabled={loading}
                onClick={() => void load(page)}
              >
                Refresh
              </button>
            </nav>
          </section>
        </>
      ) : null}
    </main>
  );
}
