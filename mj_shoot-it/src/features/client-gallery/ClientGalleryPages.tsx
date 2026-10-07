import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useEffect, useState, type FormEvent, type TouchEvent } from "react";
import {
  createGalleryFeedback,
  createPhotoFeedback,
  getClientGallery,
  getClientDelivery,
  downloadDeliveryPhoto,
  getClientSelection,
  submitSelection,
  setSelection,
  verifyClientAccess,
  listClientPhotos,
  getClientPhoto,
  type ClientDeliveryResponse,
  type ClientPhoto,
  type ClientSelection,
} from "@/lib/api";

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


function ClientDeliveryPage() {
  const { galleryId } = useParams();
  const [delivery, setDelivery] = useState<ClientDeliveryResponse | null>(null);
  const [photos, setPhotos] = useState<ClientPhoto[]>([]);
  const [galleryName, setGalleryName] = useState("Gallery");
  const [loading, setLoading] = useState(true);
  const [downloadingPhotoId, setDownloadingPhotoId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      if (!galleryId) return;
      try {
        const [galleryRes, deliveryRes, photoRes] = await Promise.all([
          getClientGallery(galleryId),
          getClientDelivery(galleryId),
          listClientPhotos(galleryId, 1, 100),
        ]);
        setGalleryName(String(galleryRes.name ?? "Gallery"));
        setDelivery(deliveryRes);
        setPhotos(photoRes.items ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load delivery.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [galleryId]);

  const handleDownloadSingle = async (photoId: string) => {
    if (!galleryId || downloadingPhotoId) return;
    setDownloadingPhotoId(photoId);
    setError("");
    try {
      const res = await downloadDeliveryPhoto(galleryId, photoId);
      if (res.download_url) {
        window.open(res.download_url, "_blank");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed. Please try again.");
    } finally {
      setDownloadingPhotoId(null);
    }
  };

  const handleDownloadAllDirect = async () => {
    if (!delivery || !delivery.items.length || !galleryId) return;
    setError("");
    for (const item of delivery.items) {
      try {
        const res = await downloadDeliveryPhoto(galleryId, item.photoId);
        if (res.download_url) {
          const a = document.createElement("a");
          a.href = res.download_url;
          a.download = item.filename || "photograph";
          document.body.appendChild(a);
          a.click();
          a.remove();
        }
      } catch (err) {
        console.error("Download error for photo", item.photoId, err);
      }
    }
  };

  if (loading) {
    return (
      <main className="page-shell">
        <div className="panel">
          <p className="muted">Loading your delivered photographs…</p>
        </div>
      </main>
    );
  }

  if (!delivery || !delivery.isReleased) {
    return (
      <main className="page-shell">
        <div className="panel">
          <p className="eyebrow">{galleryName}</p>
          <h1>Your photographs are being prepared</h1>
          <p className="muted">Your photographer is currently finishing your gallery. Once released, your final photographs will appear here.</p>
          <div style={{ marginTop: "20px" }}>
            <Link to={`/client/gallery/${galleryId}`} className="secondary-button">Return to gallery</Link>
          </div>
        </div>
      </main>
    );
  }

  // Match delivery items with loaded photos to get preview URLs
  const deliveredItems = delivery.items.map((item) => {
    const match = photos.find((p) => p.photoId === item.photoId);
    return {
      ...item,
      preview: match?.preview,
    };
  });

  return (
    <main className="page-shell client-delivery-shell">
      <div className="panel">
        <div className="panel-header compact-header">
          <div>
            <p className="eyebrow">{galleryName}</p>
            <h1>Your Final Photographs</h1>
            <p className="muted">
              {deliveredItems.length} final photographs released on{" "}
              {delivery.releasedAt ? new Date(delivery.releasedAt).toLocaleDateString() : "recently"}.
            </p>
          </div>
          {deliveredItems.length > 0 ? (
            <button type="button" className="primary-button" onClick={handleDownloadAllDirect}>
              Download All Photographs
            </button>
          ) : null}
        </div>

        {error ? <div className="error-box">{error}</div> : null}

        <div className="photo-grid client-delivery-grid">
          {deliveredItems.map((item) => (
            <article key={item.id} className="photo-card client-delivery-card">
              <div className="photo-thumb">
                {item.preview ? (
                  <img
                    src={item.preview.url}
                    alt={item.filename}
                    width={item.preview.width}
                    height={item.preview.height}
                    loading="lazy"
                  />
                ) : (
                  <div className="photo-placeholder">{item.filename}</div>
                )}
              </div>
              <div className="photo-meta client-delivery-meta">
                <strong>Photograph {item.position + 1}</strong>
                <button
                  type="button"
                  className="secondary-button compact-button"
                  disabled={downloadingPhotoId === item.photoId}
                  onClick={() => handleDownloadSingle(item.photoId)}
                >
                  {downloadingPhotoId === item.photoId ? "Preparing…" : "Download"}
                </button>
              </div>
            </article>
          ))}
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


export {
  ClientAccessPage,
  ClientGalleryPage,
  ClientSelectionReviewPage,
  ClientSelectionCompletionPage,
  ClientDeliveryPage,
};
