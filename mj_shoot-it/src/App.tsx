import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useEffect, useState, type FormEvent, type TouchEvent } from "react";
import {
  createDownload,
  createGallery,
  createGalleryAccess,
  createGalleryFeedback,
  createPhotoFeedback,
  getClientGallery,
  getClientSelection,
  submitSelection,
  getGallery,
  getPhotographerMe,
  getStudioSummary,
  listSelectedPhotos,
  listClients,
  listGalleryPhotos,
  listGalleries,
  listClientPhotos,
  getClientPhoto,
  photographerLogin,
  photographerLogout,
  setSelection,
  verifyClientAccess,
  type ClientRecord,
  type GalleryRecord,
  type PhotoRecord,
  type ClientPhoto,
  type PhotographerUser,
  type ClientSelection,
  type StudioSelectedPhoto,
} from "@/lib/api";

function HomePage() {
  return (
    <main className="page-shell landing-shell">
      <section className="panel hero-panel">
        <p className="eyebrow">MJ Studio</p>
        <h1>Private gallery workflows for photographers and clients.</h1>
        <p className="lead">
          The frontend is intentionally a thin consumer of the MJ Studio API. All permission decisions stay with the backend.
        </p>

        <div className="cta-row">
          <Link to="/photographer/login" className="primary-button">
            Photographer login
          </Link>
          <Link to="/client/access" className="secondary-button">
            Client access
          </Link>
        </div>
      </section>

      <section className="feature-grid">
        <article className="panel card">
          <h2>Photographer</h2>
          <p>Studio overview, gallery operations, access issuance, and asset workflows are surfaced through secure API contracts.</p>
          <Link to="/photographer/dashboard" className="tiny-link">
            Open dashboard
          </Link>
        </article>

        <article className="panel card">
          <h2>Client</h2>
          <p>Clients verify access with a secret and PIN, review images, provide selections, and submit gallery feedback.</p>
          <Link to="/client/access" className="tiny-link">
            Open client access
          </Link>
        </article>

        <article className="panel card">
          <h2>Trust boundary</h2>
          <p>The browser is only a presentation layer. It never owns authorization, gallery state, or download policy.</p>
          <Link to="/photographer/login" className="tiny-link">
            Sign in
          </Link>
        </article>
      </section>
    </main>
  );
}

function PhotographerLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("photographer@example.com");
  const [password, setPassword] = useState("Password123!");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await photographerLogin({ email, password });
      navigate("/photographer/dashboard", { replace: true });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to sign in.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="page-shell auth-shell">
      <div className="panel auth-panel">
        <div className="panel-header">
          <p className="eyebrow">Photographer workspace</p>
          <h1>Sign in to MJ Studio</h1>
          <p className="muted">
            Authentication is handled by the backend service. The UI never decides who is allowed to view a gallery.
          </p>
        </div>

        <form className="stack" onSubmit={handleSubmit}>
          <label className="field">
            <span>Email</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="photographer@studio.com" required />
          </label>

          <label className="field">
            <span>Password</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" required />
          </label>

          {error ? <div className="error-box">{error}</div> : null}

          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="inline-actions">
          <Link to="/">Back to home</Link>
          <Link to="/client/access">Client access flow</Link>
        </div>
      </div>
    </main>
  );
}

function PhotographerDashboardPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<PhotographerUser | null>(null);
  const [studio, setStudio] = useState<Record<string, unknown> | null>(null);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [galleries, setGalleries] = useState<GalleryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewerPhotoId, setViewerPhotoId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const meResponse = await getPhotographerMe();
        if (!meResponse?.user) {
          navigate("/photographer/login", { replace: true });
          return;
        }

        const [studioSummary, clientList, galleryList] = await Promise.all([
          getStudioSummary(),
          listClients(1, 10),
          listGalleries(1, 10),
        ]);

        setUser(meResponse.user);
        setStudio(studioSummary);
        setClients(clientList.items ?? []);
        setGalleries(galleryList.items ?? []);
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "Unable to load dashboard.");
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [navigate]);

  const handleLogout = async () => {
    try {
      await photographerLogout();
      navigate("/photographer/login", { replace: true });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to sign out.");
    }
  };

  if (isLoading) {
    return (
      <main className="page-shell">
        <div className="panel">
          <p>Loading studio dashboard…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell dashboard-shell">
      <header className="dashboard-header panel">
        <div>
          <p className="eyebrow">Studio overview</p>
          <h1>{user?.displayName ?? "Photographer"}</h1>
        </div>
        <div className="header-actions">
          <Link to="/photographer/galleries" className="secondary-button">
            Manage galleries
          </Link>
          <button type="button" className="button-ghost" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      {error ? <div className="error-box">{error}</div> : null}

      <section className="stats-grid">
        <article className="panel metric-card">
          <span>Studio</span>
          <strong>{String(studio?.name ?? "MJ Studio")}</strong>
          <small>Authorized studio context</small>
        </article>
        <article className="panel metric-card">
          <span>Clients</span>
          <strong>{clients.length}</strong>
          <small>Studio roster</small>
        </article>
        <article className="panel metric-card">
          <span>Galleries</span>
          <strong>{galleries.length}</strong>
          <small>Shared with clients</small>
        </article>
        <article className="panel metric-card">
          <span>Role</span>
          <strong>{user?.role ?? "owner"}</strong>
          <small>Server-authorized access</small>
        </article>
      </section>

      <section className="two-column-layout">
        <div className="panel">
          <div className="panel-header compact-header">
            <div>
              <p className="eyebrow">Needs attention</p>
              <h2>Selection received</h2>
            </div>
            <span className="tag">{galleries.filter((gallery) => gallery.selectionStatus === "submitted").length}</span>
          </div>
          <ul className="list-stack">
            {galleries.filter((gallery) => gallery.selectionStatus === "submitted").length === 0 ? (
              <li className="empty-state">No client selections are waiting for review.</li>
            ) : (
              galleries
                .filter((gallery) => gallery.selectionStatus === "submitted")
                .map((gallery) => (
                  <li key={gallery.galleryId} className="list-row interactive-row">
                    <div>
                      <strong>{gallery.clientName ?? gallery.name}</strong>
                      <small>{gallery.selectedCount ?? 0} photographs selected · {gallery.name}</small>
                    </div>
                    <Link to={`/photographer/galleries/${gallery.galleryId}`} className="tiny-link">
                      Review →
                    </Link>
                  </li>
                ))
            )}
          </ul>
        </div>

        <div className="panel">
          <div className="panel-header compact-header">
            <h2>Recent galleries</h2>
            <Link to="/photographer/galleries" className="tiny-link">
              View all
            </Link>
          </div>
          <ul className="list-stack">
            {galleries.length === 0 ? (
              <li className="empty-state">No galleries yet.</li>
            ) : (
              galleries.map((gallery) => (
                <li key={gallery.galleryId} className="list-row">
                  <div>
                    <strong>{gallery.name}</strong>
                    <small>{gallery.selectionStatus === "submitted" ? "Selection received" : gallery.status ?? "draft"}</small>
                  </div>
                  <Link to={`/photographer/galleries/${gallery.galleryId}`} className="tiny-link">
                    Open
                  </Link>
                </li>
              ))
            )}
          </ul>
        </div>
      </section>
    </main>
  );
}

function PhotographerGalleriesPage() {
  const navigate = useNavigate();
  const [galleries, setGalleries] = useState<GalleryRecord[]>([]);
  const [name, setName] = useState("Spring Session");
  const [clientId, setClientId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const ensureAccess = async () => {
      try {
        const me = await getPhotographerMe();
        if (!me?.user) {
          navigate("/photographer/login", { replace: true });
          return;
        }

        const response = await listGalleries(1, 20);
        setGalleries(response.items ?? []);
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "Unable to load galleries.");
      }
    };

    void ensureAccess();
  }, [navigate]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await createGallery({ clientId, name, expiresAt: null });
      const response = await listGalleries(1, 20);
      setGalleries(response.items ?? []);
      setName("");
      setClientId("");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to create gallery.");
    }
  };

  return (
    <main className="page-shell">
      <div className="panel">
        <div className="panel-header compact-header">
          <div>
            <p className="eyebrow">Photographer</p>
            <h1>Galleries</h1>
          </div>
          <Link to="/photographer/dashboard" className="secondary-button">
            Back to dashboard
          </Link>
        </div>

        <form className="stack" onSubmit={handleCreate}>
          <div className="inline-grid two-up">
            <label className="field">
              <span>Client ID</span>
              <input value={clientId} onChange={(event) => setClientId(event.target.value)} placeholder="UUID" required />
            </label>
            <label className="field">
              <span>Gallery name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Spring Session" required />
            </label>
          </div>
          <button className="primary-button" type="submit">
            Create gallery
          </button>
        </form>

        {error ? <div className="error-box">{error}</div> : null}

        {gallery?.selectionStatus === "submitted" ? (
          <div className="selection-review-banner">
            <div>
              <p className="eyebrow">Client decision</p>
              <strong>{Number(gallery.selectedCount ?? 0)} photographs selected</strong>
              <small>
                Selection received
                {gallery.selectionSubmittedAt
                  ? " · " + new Date(String(gallery.selectionSubmittedAt)).toLocaleString()
                  : ""}
              </small>
            </div>
            <span className="tag">Review</span>
          </div>
        ) : null}

        <ul className="list-stack spaced-list">
          {galleries.length === 0 ? (
            <li className="empty-state">No galleries are available for this studio yet.</li>
          ) : (
            galleries.map((gallery) => (
              <li key={gallery.galleryId} className="list-row interactive-row">
                <div>
                  <strong>{gallery.clientName ?? gallery.name}</strong>
                  <small>
                    {gallery.selectionStatus === "submitted"
                      ? `${gallery.selectedCount ?? 0} photographs selected · Selection received`
                      : gallery.status ?? "draft"}
                  </small>
                </div>
                <Link to={`/photographer/galleries/${gallery.galleryId}`} className="tiny-link">
                  {gallery.selectionStatus === "submitted" ? "Review →" : "Open"}
                </Link>
              </li>
            ))
          )}
        </ul>
      </div>
    </main>
  );
}

function PhotographerGalleryDetailPage() {
  const { galleryId } = useParams();
  const navigate = useNavigate();
  const [gallery, setGallery] = useState<Record<string, unknown> | null>(null);
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [selection, setSelection] = useState<StudioSelectedPhoto[]>([]);
  const [permission, setPermission] = useState<"view" | "view_download">("view_download");
  const [error, setError] = useState("");
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!galleryId) {
        return;
      }
      try {
        const me = await getPhotographerMe();
        if (!me?.user) {
          navigate("/photographer/login", { replace: true });
          return;
        }

        const [galleryResponse, photoResponse, selectionResponse] = await Promise.all([
          getGallery(galleryId),
          listGalleryPhotos(galleryId, 1, 20),
          listSelectedPhotos(galleryId),
        ]);

        setGallery(galleryResponse);
        setPhotos(photoResponse.items ?? []);
        setSelection(selectionResponse);
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "Unable to load gallery.");
      }
    };

    void load();
  }, [galleryId, navigate]);

  const handleAccessGrant = async () => {
    if (!galleryId) {
      return;
    }

    try {
      await createGalleryAccess(galleryId, { permission, expiresAt: null });
      const photoResponse = await listGalleryPhotos(galleryId, 1, 20);
      setPhotos(photoResponse.items ?? []);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to create gallery access.");
    }
  };

  if (!galleryId) {
    return <Navigate to="/photographer/galleries" replace />;
  }

  const selectedPhoto = selectedPhotoIndex === null ? null : selection[selectedPhotoIndex] ?? null;

  return (
    <main className="page-shell">
      <div className="panel">
        <div className="panel-header compact-header">
          <div>
            <p className="eyebrow">Gallery</p>
            <h1>{String(gallery?.name ?? "Loading gallery…")}</h1>
          </div>
          <Link to="/photographer/galleries" className="secondary-button">
            Back to galleries
          </Link>
        </div>

        <div className="toolbar-stack">
          <label className="field compact-field">
            <span>Permission</span>
            <select value={permission} onChange={(event) => setPermission(event.target.value as "view" | "view_download")}>
              <option value="view">View</option>
              <option value="view_download">View + download</option>
            </select>
          </label>
          <button type="button" className="primary-button" onClick={handleAccessGrant}>
            Issue access link
          </button>
        </div>

        {error ? <div className="error-box">{error}</div> : null}

        {gallery?.selectionStatus === "submitted" ? (
          <section className="studio-selection-review">
            <div className="panel-header compact-header">
              <div>
                <p className="eyebrow">Client decision</p>
                <h2>{selection.length} photographs selected</h2>
                <p className="muted">
                  Received{gallery.selectionSubmittedAt ? ` · ${new Date(gallery.selectionSubmittedAt).toLocaleString()}` : ""}.
                  Review these choices before preparing delivery.
                </p>
              </div>
              <span className="tag">Selection received</span>
            </div>

            {selection.length === 0 ? (
              <div className="empty-state">The client submitted an empty selection.</div>
            ) : (
              <div className="photo-grid studio-selection-grid">
                {selection.map((photo, index) => (
                  <article
                    key={photo.photoId}
                    className="photo-card studio-selection-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedPhotoIndex(index)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedPhotoIndex(index);
                      }
                    }}
                    aria-label={"Inspect photograph " + (photo.position + 1)}
                  >
                    <div className="photo-thumb">
                      <img
                        src={photo.preview.url}
                        alt={`Selected photograph ${photo.position + 1}`}
                        width={photo.preview.width}
                        height={photo.preview.height}
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                    <div className="photo-meta">
                      <strong>Photograph {photo.position + 1}</strong>
                      <small>{photo.filename}</small>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {selectedPhoto ? (
          <div className="studio-photo-viewer" role="dialog" aria-modal="true" aria-label={"Photograph " + (selectedPhoto.position + 1)}>
            <button type="button" className="studio-photo-viewer-backdrop" aria-label="Close photograph viewer" onClick={() => setSelectedPhotoIndex(null)} />
            <div className="studio-photo-viewer-panel">
              <div className="studio-photo-viewer-toolbar">
                <div>
                  <p className="eyebrow">Proofing</p>
                  <strong>Photograph {selectedPhoto.position + 1}</strong>
                  <small>{selectedPhoto.filename}</small>
                </div>
                <button type="button" className="button-ghost" onClick={() => setSelectedPhotoIndex(null)}>Close</button>
              </div>
              <div className="studio-photo-viewer-image-wrap">
                <img
                  src={selectedPhoto.preview.url}
                  alt={"Selected photograph " + (selectedPhoto.position + 1)}
                  width={selectedPhoto.preview.width}
                  height={selectedPhoto.preview.height}
                />
              </div>
              <div className="studio-photo-viewer-nav">
                <button type="button" className="secondary-button" disabled={selectedPhotoIndex === 0} onClick={() => setSelectedPhotoIndex((index) => index === null ? null : Math.max(0, index - 1))}>Previous</button>
                <span>{(selectedPhotoIndex ?? 0) + 1} / {selection.length}</span>
                <button type="button" className="secondary-button" disabled={selectedPhotoIndex === selection.length - 1} onClick={() => setSelectedPhotoIndex((index) => index === null ? null : Math.min(selection.length - 1, index + 1))}>Next</button>
              </div>
            </div>
          </div>
        ) : null}

        <ul className="list-stack spaced-list">
          {photos.length === 0 ? (
            <li className="empty-state">No photos have been added to this gallery yet.</li>
          ) : (
            photos.map((photo) => (
              <li key={photo.photoId} className="list-row">
                <div>
                  <strong>{photo.filename}</strong>
                  <small>{photo.mimeType ?? "image"}</small>
                </div>
                <span className="tag">{photo.status ?? "ready"}</span>
              </li>
            ))
          )}
        </ul>
      </div>
    </main>
  );
}

function ClientAccessPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const galleryId = searchParams.get("galleryId") ?? "";
  const [secret, setSecret] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const access = await verifyClientAccess({ secret, pin });
      navigate(`/client/gallery/${galleryId || access.galleryId}`, { replace: true });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Gallery access could not be verified.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="page-shell auth-shell">
      <div className="panel auth-panel">
        <div className="panel-header">
          <p className="eyebrow">Client gallery</p>
          <h1>Verify access</h1>
          <p className="muted">
            The browser is never the authority. A valid secret and PIN grant a temporary session, and the server enforces access.
          </p>
        </div>

        <form className="stack" onSubmit={handleSubmit}>
          <label className="field">
            <span>Access secret</span>
            <input value={secret} onChange={(event) => setSecret(event.target.value)} placeholder="secret" required />
          </label>

          <label className="field">
            <span>Six-digit PIN</span>
            <input value={pin} onChange={(event) => setPin(event.target.value)} placeholder="123456" inputMode="numeric" maxLength={6} required />
          </label>

          {error ? <div className="error-box">{error}</div> : null}

          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Verifying..." : "Open gallery"}
          </button>
        </form>

        <div className="inline-actions">
          <Link to="/">Return home</Link>
          <Link to="/photographer/login">Photographer sign-in</Link>
        </div>
      </div>
    </main>
  );
}

function ClientPhotoViewer({
  galleryId,
  photos,
  photoId,
  selectedPhotoIds,
  onSelectToggle,
  onClose,
  onNavigate,
  totalPhotos,
  hasMorePhotos,
  onLoadMore,
}: {
  galleryId: string;
  photos: ClientPhoto[];
  photoId: string;
  selectedPhotoIds: Set<string>;
  onSelectToggle: (photoId: string) => void;
  onClose: () => void;
  onNavigate: (photoId: string) => void;
  totalPhotos: number;
  hasMorePhotos: boolean;
  onLoadMore: () => Promise<string | null>;
}) {
  const [photo, setPhoto] = useState<Awaited<ReturnType<typeof getClientPhoto>> | null>(null);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [isFeedbackSubmitting, setIsFeedbackSubmitting] = useState(false);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const currentIndex = photos.findIndex((item) => item.photoId === photoId);
  const previousPhoto = currentIndex > 0 ? photos[currentIndex - 1] : null;
  const nextPhoto = currentIndex >= 0 && currentIndex < photos.length - 1 ? photos[currentIndex + 1] : null;
  const isSelected = selectedPhotoIds.has(photoId);
  const isAtLoadedEnd = currentIndex >= 0 && currentIndex === photos.length - 1;
  const canAdvance = Boolean(nextPhoto) || hasMorePhotos;

  useEffect(() => {
    let active = true;
    setPhoto(null);
    setError("");

    void getClientPhoto(galleryId, photoId)
      .then((result) => {
        if (active) setPhoto(result);
      })
      .catch((caughtError) => {
        if (active) setError(caughtError instanceof Error ? caughtError.message : "Unable to open photograph.");
      });

    return () => {
      active = false;
    };
  }, [galleryId, photoId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowLeft" && previousPhoto) {
        event.preventDefault();
        onNavigate(previousPhoto.photoId);
      } else if (event.key === "ArrowRight" && canAdvance) {
        event.preventDefault();
        void handleNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, onNavigate, previousPhoto?.photoId, nextPhoto?.photoId]);

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    setTouchStartX(event.changedTouches[0]?.clientX ?? null);
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (touchStartX === null) return;
    const endX = event.changedTouches[0]?.clientX ?? touchStartX;
    const distance = endX - touchStartX;
    setTouchStartX(null);

    if (Math.abs(distance) < 48) return;
    if (distance < 0 && canAdvance) void handleNext();
    if (distance > 0 && previousPhoto) onNavigate(previousPhoto.photoId);
  };

  const handleNext = async () => {
    if (nextPhoto) {
      onNavigate(nextPhoto.photoId);
      return;
    }
    if (hasMorePhotos) {
      const firstNewPhotoId = await onLoadMore();
      if (firstNewPhotoId) onNavigate(firstNewPhotoId);
    }
  };

  const handlePhotoFeedback = async () => {
    if (!feedback.trim()) return;
    setIsFeedbackSubmitting(true);
    setError("");

    try {
      await createPhotoFeedback(galleryId, photoId, feedback.trim());
      setFeedback("");
      setIsFeedbackOpen(false);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Photo feedback could not be submitted.");
    } finally {
      setIsFeedbackSubmitting(false);
    }
  };

  if (error) {
    return (
      <div className="viewer-backdrop" role="dialog" aria-modal="true" aria-label="Photograph viewer">
        <div className="viewer-panel">
          <div className="viewer-toolbar">
            <span>Unable to open photograph</span>
            <button type="button" className="viewer-close" onClick={onClose}>Close</button>
          </div>
          <div className="viewer-error">
            <div className="error-box">{error}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="viewer-backdrop" role="dialog" aria-modal="true" aria-label="Photograph viewer">
      <button type="button" className="viewer-dismiss" aria-label="Close photograph viewer" onClick={onClose} />
      <div className="viewer-panel" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <div className="viewer-toolbar">
          <div>
            <span className="viewer-count">
              {currentIndex >= 0 ? currentIndex + 1 : "…"} of {totalPhotos}
            </span>
            {photo?.recommended ? <span className="viewer-recommended">Recommended</span> : null}
          </div>
          <button type="button" className="viewer-close" onClick={onClose}>Close</button>
        </div>

        <div className="viewer-image-wrap">
          {photo ? (
            <img
              src={photo.preview.url}
              alt={`Photograph ${photo.position + 1} from this gallery`}
              width={photo.preview.width}
              height={photo.preview.height}
              decoding="async"
            />
          ) : (
            <div className="viewer-loading">Loading photograph…</div>
          )}
        </div>

        <div className="viewer-controls" aria-label="Photograph controls">
          <button
            type="button"
            className="viewer-nav viewer-nav-previous"
            onClick={() => previousPhoto && onNavigate(previousPhoto.photoId)}
            disabled={!previousPhoto}
            aria-label="Previous photograph"
          >
            Previous
          </button>

          <button
            type="button"
            className={`viewer-select ${isSelected ? "is-selected" : ""}`}
            onClick={() => onSelectToggle(photoId)}
            aria-pressed={isSelected}
            disabled={!photo}
          >
            {isSelected ? "Selected" : "Select photograph"}
          </button>

          <button
            type="button"
            className="viewer-nav viewer-nav-next"
            onClick={() => void handleNext()}
            disabled={!canAdvance}
            aria-label="Next photograph"
          >
            Next
          </button>

          <button
            type="button"
            className="viewer-feedback-trigger"
            onClick={() => setIsFeedbackOpen((open) => !open)}
            disabled={!photo}
          >
            {isFeedbackOpen ? "Close note" : "Leave a note"}
          </button>
        </div>

        {isFeedbackOpen ? (
          <form
            className="viewer-feedback"
            onSubmit={(event) => {
              event.preventDefault();
              void handlePhotoFeedback();
            }}
          >
            <label className="viewer-feedback-label" htmlFor="photo-feedback">
              Note about this photograph
            </label>
            <textarea
              id="photo-feedback"
              className="viewer-feedback-input"
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              placeholder="Tell your photographer what you'd like changed or reviewed."
              autoFocus
              disabled={isFeedbackSubmitting}
            />
            {error ? <div className="viewer-feedback-error">{error}</div> : null}
            <div className="viewer-feedback-actions">
              <button
                type="button"
                className="viewer-feedback-cancel"
                onClick={() => {
                  setFeedback("");
                  setIsFeedbackOpen(false);
                }}
                disabled={isFeedbackSubmitting}
              >
                Cancel
              </button>
              <button type="submit" className="viewer-feedback-submit" disabled={isFeedbackSubmitting || !feedback.trim()}>
                {isFeedbackSubmitting ? "Sending…" : "Send note"}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}

function ClientSelectionReviewPage() {
  const { galleryId } = useParams();
  const [galleryName, setGalleryName] = useState("Gallery");
  const [photos, setPhotos] = useState<ClientPhoto[]>([]);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [removingPhotoId, setRemovingPhotoId] = useState<string | null>(null);
  const [selectionStatus, setSelectionStatus] = useState<ClientSelection["status"]>("draft");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!galleryId) return;
      try {
        const [gallery, selectionResponse] = await Promise.all([
          getClientGallery(galleryId),
          getClientSelection(galleryId),
        ]);

        const selectedIds = new Set(
          selectionResponse.items
            .filter((item) => item.selected)
            .map((item) => item.photoId),
        );

        const loadedPhotos: ClientPhoto[] = [];
        let page = 1;
        let total = 0;

        do {
          const response = await listClientPhotos(galleryId, page, 100);
          loadedPhotos.push(...(response.items ?? []));
          total = response.total ?? loadedPhotos.length;
          page += 1;
        } while (loadedPhotos.length < total && [...selectedIds].some((id) => !loadedPhotos.some((photo) => photo.photoId === id)));

        setGalleryName(String(gallery.name ?? "Gallery"));
        setPhotos(loadedPhotos);
        setSelectedPhotoIds(selectedIds);
        setSelectionStatus(selectionResponse.status);
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "Unable to load your selection.");
      }
    };

    void load();
  }, [galleryId]);

  const handleRemove = async (photoId: string) => {
    if (!galleryId || removingPhotoId === photoId || selectionStatus === "submitted") return;

    const previous = new Set(selectedPhotoIds);
    setSelectedPhotoIds((current) => {
      const next = new Set(current);
      next.delete(photoId);
      return next;
    });
    setRemovingPhotoId(photoId);
    setError("");

    try {
      await setSelection(galleryId, photoId, false);
    } catch (caughtError) {
      setSelectedPhotoIds(previous);
      setError(caughtError instanceof Error ? caughtError.message : "This photograph could not be removed from your selection.");
    } finally {
      setRemovingPhotoId(null);
    }
  };

  const handleSubmit = async () => {
    if (!galleryId || isSubmitting || selectionStatus === "submitted") return;

    setIsSubmitting(true);
    setError("");

    try {
      await submitSelection(galleryId);
      navigate(`/client/gallery/${galleryId}/complete`, { replace: true });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Your selection could not be submitted.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!galleryId) return <Navigate to="/client/access" replace />;

  const selectedPhotos = photos.filter((photo) => selectedPhotoIds.has(photo.photoId));

  return (
    <main className="page-shell client-gallery-shell">
      <div className="client-gallery selection-review-page">
        <header className="gallery-header">
          <div>
            <p className="eyebrow">Review your selection</p>
            <h1>{galleryName}</h1>
            <p className="gallery-intro">
              These are the photographs you have chosen. Review them before sending your selection to the photographer.
            </p>
          </div>
          <Link to={`/client/gallery/${galleryId}`} className="secondary-button">
            Back to photographs
          </Link>
        </header>

        {error ? <div className="error-box">{error}</div> : null}

        <div className="gallery-summary" aria-live="polite">
          <strong>{selectedPhotoIds.size} selected</strong>
          <span>Review before submission</span>
        </div>

        {selectedPhotos.length === 0 ? (
          <section className="empty-state panel">
            <h2>No photographs selected yet</h2>
            <p>Return to the gallery and choose the photographs you want your photographer to work with.</p>
            <Link to={`/client/gallery/${galleryId}`} className="primary-button">
              Choose photographs
            </Link>
          </section>
        ) : (
          <div className="photo-grid client-photo-grid">
            {selectedPhotos.map((photo) => (
              <article key={photo.photoId} className="photo-card panel is-selected">
                <div className="photo-thumb">
                  <img
                    src={photo.thumbnail.url}
                    alt={`Selected photograph ${photo.position + 1}`}
                    width={photo.thumbnail.width}
                    height={photo.thumbnail.height}
                    loading="lazy"
                    decoding="async"
                  />
                  <span className="photo-selected-badge">Selected</span>
                </div>
                <button
                  type="button"
                  className="photo-select-button is-selected"
                  onClick={() => void handleRemove(photo.photoId)}
                  disabled={removingPhotoId === photo.photoId || selectionStatus === "submitted"}
                  aria-label={`Remove photograph ${photo.position + 1} from your selection`}
                >
                  {removingPhotoId === photo.photoId ? "Removing…" : "Remove"}
                </button>
              </article>
            ))}
          </div>
        )}

        <div className="selection-review-actions">
          {selectionStatus === "submitted" ? (
            <p className="muted" role="status">
              Your selection has been sent to the photographer.
            </p>
          ) : (
            <>
              <p className="muted">
                When you're happy with these choices, send them to your photographer.
              </p>
              <button
                type="button"
                className="primary-button"
                onClick={() => void handleSubmit()}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Sending…" : "Send selection"}
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function ClientSelectionCompletionPage() {
  const { galleryId } = useParams();
  const navigate = useNavigate();
  const [galleryName, setGalleryName] = useState("Gallery");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      if (!galleryId) return;

      try {
        const [gallery, selection] = await Promise.all([
          getClientGallery(galleryId),
          getClientSelection(galleryId),
        ]);

        setGalleryName(String(gallery.name ?? "Gallery"));

        if (selection.status !== "submitted") {
          navigate(`/client/gallery/${galleryId}/selection`, { replace: true });
          return;
        }

        setIsSubmitted(true);
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "We couldn't confirm your submission.");
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [galleryId, navigate]);

  if (!galleryId) return <Navigate to="/client/access" replace />;

  if (isLoading) {
    return (
      <main className="page-shell client-gallery-shell">
        <div className="client-completion-page">
          <p className="eyebrow">Your photographs</p>
          <p className="muted">Checking your submission…</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="page-shell client-gallery-shell">
        <div className="client-completion-page">
          <p className="eyebrow">Your photographs</p>
          <h1>We couldn't confirm that just yet.</h1>
          <p className="gallery-intro">{error}</p>
          <Link to={`/client/gallery/${galleryId}/selection`} className="primary-button">
            Return to selection
          </Link>
        </div>
      </main>
    );
  }

  if (!isSubmitted) return null;

  return (
    <main className="page-shell client-gallery-shell">
      <div className="client-completion-page">
        <p className="eyebrow">Selection sent</p>
        <h1>You're all set.</h1>
        <p className="completion-lead">
          Your selection from <strong>{galleryName}</strong> has been sent to your photographer.
        </p>
        <p className="gallery-intro">
          Your photographer can now review your choices and prepare the next step. Your photographs are not ready for download yet.
        </p>

        <div className="completion-actions">
          <Link to={`/client/gallery/${galleryId}`} className="primary-button">
            Return to gallery
          </Link>
        </div>
      </div>
    </main>
  );
}

function ClientGalleryPage() {
  const { galleryId } = useParams();
  const [galleryName, setGalleryName] = useState("Gallery");
  const [photos, setPhotos] = useState<ClientPhoto[]>([]);
  const [totalPhotos, setTotalPhotos] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());
  const [viewerPhotoId, setViewerPhotoId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [error, setError] = useState("");
  const [savingPhotoId, setSavingPhotoId] = useState<string | null>(null);
  const [selectionStatus, setSelectionStatus] = useState<ClientSelection["status"]>("draft");

  useEffect(() => {
    const load = async () => {
      if (!galleryId) return;
      try {
        const [gallery, photoResponse, selectionResponse] = await Promise.all([
          getClientGallery(galleryId),
          listClientPhotos(galleryId, 1, 20),
          getClientSelection(galleryId),
        ]);
        setGalleryName(String(gallery.name ?? "Gallery"));
        setPhotos(photoResponse.items ?? []);
        setTotalPhotos(photoResponse.total ?? 0);
        setCurrentPage(1);
        setSelectedPhotoIds(
          new Set(
            selectionResponse.items
              .filter((item) => item.selected)
              .map((item) => item.photoId),
          ),
        );
        setSelectionStatus(selectionResponse.status);
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "Unable to load gallery.");
      }
    };

    void load();
  }, [galleryId]);

  const handleSelectionToggle = async (photoId: string) => {
    if (!galleryId || savingPhotoId === photoId || selectionStatus === "submitted") return;

    const wasSelected = selectedPhotoIds.has(photoId);
    const nextSelected = !wasSelected;
    const previous = new Set(selectedPhotoIds);

    setSelectedPhotoIds((current) => {
      const next = new Set(current);
      if (nextSelected) next.add(photoId);
      else next.delete(photoId);
      return next;
    });
    setSavingPhotoId(photoId);
    setError("");

    try {
      await setSelection(galleryId, photoId, nextSelected);
    } catch (caughtError) {
      setSelectedPhotoIds(previous);
      setError(caughtError instanceof Error ? caughtError.message : "Your selection could not be saved.");
    } finally {
      setSavingPhotoId(null);
    }
  };

  const hasMorePhotos = photos.length < totalPhotos;

  const handleLoadMore = async (): Promise<string | null> => {
    if (!galleryId || isLoadingMore || !hasMorePhotos) return null;

    const nextPage = currentPage + 1;
    setIsLoadingMore(true);
    setError("");

    try {
      const response = await listClientPhotos(galleryId, nextPage, 20);
      const incoming = response.items ?? [];
      const existingIds = new Set(photos.map((photo) => photo.photoId));
      const newPhotos = incoming.filter((photo) => !existingIds.has(photo.photoId));

      setPhotos((current) => [...current, ...newPhotos]);
      setCurrentPage(nextPage);
      setTotalPhotos(response.total ?? totalPhotos);
      return newPhotos[0]?.photoId ?? null;
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "More photographs could not be loaded.");
      return null;
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleGalleryFeedback = async () => {
    if (!galleryId || !feedback.trim()) return;

    try {
      await createGalleryFeedback(galleryId, feedback.trim());
      setFeedback("");
      setIsFeedbackOpen(false);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Your feedback could not be submitted.");
    }
  };

  if (!galleryId) {
    return <Navigate to="/client/access" replace />;
  }

  return (
    <main className="page-shell client-gallery-shell">
      <div className="client-gallery">
        <header className="gallery-header">
          <div>
            <p className="eyebrow">Your photographs</p>
            <h1>{galleryName}</h1>
            <p className="gallery-intro">
              Take your time. Open any photograph to view it larger, then select the photographs you want.
            </p>
          </div>
        </header>

        {error ? <div className="error-box">{error}</div> : null}

        <div className="gallery-summary" aria-live="polite">
          <strong>{selectedPhotoIds.size} selected</strong>
          <span>{totalPhotos} photographs</span>
        </div>

        <div className="photo-grid client-photo-grid">
          {photos.length === 0 ? (
            <div className="empty-state">No photos are visible in this gallery yet.</div>
          ) : (
            photos.map((photo) => {
              const selected = selectedPhotoIds.has(photo.photoId);
              return (
                <article key={photo.photoId} className={`photo-card panel ${selected ? "is-selected" : ""}`}>
                  <button
                    type="button"
                    className="photo-thumb"
                    onClick={() => setViewerPhotoId(photo.photoId)}
                    aria-label={`Open photograph ${photo.position + 1}${selected ? ", selected" : ""}`}
                  >
                    <img
                      src={photo.thumbnail.url}
                      alt={`Photograph ${photo.position + 1} from this gallery`}
                      width={photo.thumbnail.width}
                      height={photo.thumbnail.height}
                      loading="lazy"
                      decoding="async"
                    />
                    {selected ? <span className="photo-selected-badge">Selected</span> : null}
                  </button>

                  <div className="photo-meta">
                    {photo.recommended ? <span className="tag">Recommended</span> : null}
                  </div>

                  <button
                    type="button"
                    className={`photo-select-button ${selected ? "is-selected" : ""}`}
                    onClick={() => void handleSelectionToggle(photo.photoId)}
                    disabled={savingPhotoId === photo.photoId || selectionStatus === "submitted"}
                    aria-pressed={selected}
                  >
                    {savingPhotoId === photo.photoId
                      ? "Saving…"
                      : selected
                        ? "Selected"
                        : "Select"}
                  </button>

                </article>
              );
            })
          )}
        </div>

        {hasMorePhotos ? (
          <div className="gallery-load-more">
            <button type="button" className="button-ghost" onClick={() => void handleLoadMore()} disabled={isLoadingMore}>
              {isLoadingMore ? "Loading…" : "Load more photographs"}
            </button>
          </div>
        ) : null}

        {isFeedbackOpen ? (
          <section className="gallery-feedback">
            <textarea
              className="textarea"
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              placeholder="Anything you'd like your photographer to know?"
              aria-label="Gallery feedback"
            />
            <button type="button" className="primary-button" onClick={() => void handleGalleryFeedback()}>
              Send note
            </button>
          </section>
        ) : (
          <button type="button" className="button-ghost feedback-trigger" onClick={() => setIsFeedbackOpen(true)}>
            Leave a note for your photographer
          </button>
        )}
      </div>

      {selectedPhotoIds.size > 0 ? (
        <div className="selection-bar" role="status" aria-live="polite">
          <div>
            <strong>{selectedPhotoIds.size} selected</strong>
            <span className="selection-bar-note">Your choices are saved.</span>
          </div>
          <Link to={`/client/gallery/${galleryId}/selection`} className="primary-button selection-review-link">
            Review selection
          </Link>
        </div>
      ) : null}

      {viewerPhotoId ? (
        <ClientPhotoViewer
          galleryId={galleryId}
          photos={photos}
          photoId={viewerPhotoId}
          selectedPhotoIds={selectedPhotoIds}
          onSelectToggle={(id) => void handleSelectionToggle(id)}
          onNavigate={setViewerPhotoId}
          onClose={() => setViewerPhotoId(null)}
          totalPhotos={totalPhotos}
          hasMorePhotos={hasMorePhotos}
          onLoadMore={handleLoadMore}
        />
      ) : null}
    </main>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/photographer/login" element={<PhotographerLoginPage />} />
        <Route path="/photographer/dashboard" element={<PhotographerDashboardPage />} />
        <Route path="/photographer/galleries" element={<PhotographerGalleriesPage />} />
        <Route path="/photographer/galleries/:galleryId" element={<PhotographerGalleryDetailPage />} />
        <Route path="/client/access" element={<ClientAccessPage />} />
        <Route path="/client/gallery/:galleryId" element={<ClientGalleryPage />} />
        <Route path="/client/gallery/:galleryId/selection" element={<ClientSelectionReviewPage />} />
        <Route path="/client/gallery/:galleryId/complete" element={<ClientSelectionCompletionPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}