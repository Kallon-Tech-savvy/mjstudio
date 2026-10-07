import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useEffect, useState, type FormEvent, type TouchEvent } from "react";
import {
  createDownload,
  createGallery,
  createGalleryAccess,
  getGallery,
  getPhotographerMe,
  getStudioSummary,
  listSelectedPhotos,
  listStudioFeedback,
  setStudioPhotoReview,
  getStudioDelivery,
  prepareStudioDelivery,
  releaseStudioDelivery,
  type StudioDeliveryDetails,
  listClients,
  listGalleryPhotos,
  listGalleries,
  photographerLogin,
  photographerLogout,
  type ClientRecord,
  type GalleryRecord,
  type PhotoRecord,
  type PhotographerUser,
  type StudioSelectedPhoto,
  type StudioFeedback,
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
  const [feedback, setFeedback] = useState<StudioFeedback[]>([]);
  const [permission, setPermission] = useState<"view" | "view_download">("view_download");
  const [error, setError] = useState("");
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  const [delivery, setDelivery] = useState<StudioDeliveryDetails | null>(null);
  const [isProcessingDelivery, setIsProcessingDelivery] = useState(false);

  const handlePrepareDelivery = async () => {
    if (!galleryId || isProcessingDelivery) return;
    setIsProcessingDelivery(true);
    setError("");
    try {
      const res = await prepareStudioDelivery(galleryId);
      setDelivery(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to prepare delivery.");
    } finally {
      setIsProcessingDelivery(false);
    }
  };

  const handleReleaseDelivery = async () => {
    if (!galleryId || isProcessingDelivery) return;
    setIsProcessingDelivery(true);
    setError("");
    try {
      const res = await releaseStudioDelivery(galleryId);
      setDelivery(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to release delivery.");
    } finally {
      setIsProcessingDelivery(false);
    }
  };

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

        const [galleryResponse, photoResponse, selectionResponse, feedbackResponse, deliveryResponse] = await Promise.all([
          getGallery(galleryId),
          listGalleryPhotos(galleryId, 1, 20),
          listSelectedPhotos(galleryId),
          listStudioFeedback(galleryId),
          getStudioDelivery(galleryId).catch(() => null),
        ]);

        setGallery(galleryResponse);
        setPhotos(photoResponse.items ?? []);
        setSelection(selectionResponse);
        setFeedback(feedbackResponse);
        if (deliveryResponse) setDelivery(deliveryResponse);
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
                      <div className="photo-meta-header">
                        <strong>Photograph {photo.position + 1}</strong>
                        <span className={"status-tag status-" + (photo.reviewStatus || "pending")}>
                          {photo.reviewStatus === "approved" ? "Approved" : photo.reviewStatus === "needs_revision" ? "Revision" : "Pending"}
                        </span>
                      </div>
                      <small>{photo.filename}</small>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}


        (          <section className="studio-delivery-section panel" style={{ marginTop: "20px" }}>
            <div className="panel-header compact-header">
              <div>
                <p className="eyebrow">Delivery Workflow</p>
                <h2>Release Final Photographs</h2>
                <p className="muted">
                  {delivery?.approvedCount ?? 0} of {delivery?.totalSelectedCount ?? 0} selected photographs approved.
                </p>
              </div>
              <span className={"tag status-" + (delivery?.status || "pending")}>
                {delivery?.releasedAt ? "Released" : delivery?.status === "ready" ? "Ready for release" : "Pending proofing"}
              </span>
            </div>

            <div style={{ margin: "20px 0" }}>
              {delivery?.releasedAt ? (
                <div className="success-box" style={{ background: "#e6f4ea", padding: "16px", borderRadius: "4px", color: "#137333" }}>
                  <strong>Delivery Active:</strong> Final photographs were released to client on {new Date(delivery.releasedAt).toLocaleString()}.
                </div>
              ) : delivery?.canPrepare ? (
                <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={isProcessingDelivery}
                    onClick={handlePrepareDelivery}
                  >
                    {isProcessingDelivery ? "Preparing..." : "1. Prepare Final Delivery Assets"}
                  </button>
                  {delivery?.status === "ready" || delivery?.items.length ? (
                    <button
                      type="button"
                      className="primary-button"
                      style={{ background: "#137333" }}
                      disabled={isProcessingDelivery}
                      onClick={handleReleaseDelivery}
                    >
                      {isProcessingDelivery ? "2. Explicitly Release to Client" : "Release Delivery"}
                    </button>
                  ) : null}
                </div>
              ) : (
                <p className="muted">
                  You cannot prepare delivery until all selected photographs are reviewed and approved in Proofing.
                </p>
              )}
            </div>

            {delivery?.items && delivery.items.length > 0 ? (
              <ul className="list-stack">
                {delivery.items.map((item) => (
                  <li key={item.id} className="list-row">
                    <div>
                      <strong>Photograph {item.position + 1}</strong>
                      <small>{item.filename}</small>
                    </div>
                    <span className="tag status-approved">Ready for download</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        )}

        {feedback.length > 0 ? (
          <section className="studio-feedback-review">
            <div className="panel-header compact-header">
              <div>
                <p className="eyebrow">Client feedback</p>
                <h2>Notes from the client</h2>
                <p className="muted">Review these notes alongside the selected photographs before delivery.</p>
              </div>
              <span className="tag">{feedback.length}</span>
            </div>
            <ul className="list-stack">
              {feedback.map((item) => (
                <li key={item.id} className="list-row">
                  <div>
                    <strong>
                      {item.feedbackType === "photo"
                        ? "Photograph " + (Number(item.position ?? 0) + 1)
                        : "Gallery note"}
                    </strong>
                    <small>{item.filename ?? "Gallery-wide feedback"} · {new Date(item.createdAt).toLocaleString()}</small>
                  </div>
                  <p>{item.message}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {selectedPhoto ? (
          <StudioPhotoViewerModal
            galleryId={galleryId}
            selectedPhoto={selectedPhoto}
            selectedPhotoIndex={selectedPhotoIndex ?? 0}
            totalPhotos={selection.length}
            feedbackList={feedback}
            onClose={() => setSelectedPhotoIndex(null)}
            onNavigate={(index) => setSelectedPhotoIndex(index)}
            onReviewUpdate={(updated) => {
              setSelection((prev) =>
                prev.map((item) =>
                  item.photoId === updated.photoId
                    ? {
                        ...item,
                        reviewStatus: updated.status,
                        reviewNote: updated.note,
                        reviewedBy: updated.reviewedBy,
                        reviewedAt: updated.reviewedAt,
                      }
                    : item
                )
              );
            }}
          />
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

import AppRouter from "@/app/router";
import { ClientAccessPage, ClientGalleryPage, ClientSelectionReviewPage, ClientSelectionCompletionPage, ClientDeliveryPage } from "@/features/client-gallery/ClientGalleryPages";

export default function App() {
  return (
    <AppRouter
      home={<HomePage />}
      photographerLogin={<PhotographerLoginPage />}
      photographerDashboard={<PhotographerDashboardPage />}
      photographerGalleries={<PhotographerGalleriesPage />}
      photographerGalleryDetail={<PhotographerGalleryDetailPage />}
      clientAccess={<ClientAccessPage />}
      clientGallery={<ClientGalleryPage />}
      clientSelection={<ClientSelectionReviewPage />}
      clientCompletion={<ClientSelectionCompletionPage />}
      clientDelivery={<ClientDeliveryPage />}
    />
  );
}
