import {
  type FormEvent,
  type TouchEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ClientPhotoImage } from "@/components/ClientPhotoImage";
import { ModalDialog } from "@/components/ModalDialog";
import {
  ApiError,
  type ClientDeliveryResponse,
  type ClientPhoto,
  type ClientSelection,
  createGalleryFeedback,
  createPhotoFeedback,
  downloadDeliveryPhoto,
  getClientDelivery,
  getClientGallery,
  getClientPhoto,
  getClientSelection,
  listClientPhotos,
  setSelection,
  submitSelection,
  verifyClientAccess,
} from "@/lib/api";
import { loadClientPhotosForIds } from "@/lib/load-client-photos";
import { useRetryableLoad } from "@/lib/use-retryable-load";

function startPhotoDownload(url: string, filename: string) {
  const downloadUrl = new URL(url, window.location.origin);
  if (downloadUrl.protocol !== "http:" && downloadUrl.protocol !== "https:") {
    throw new Error("The download link is invalid. Please try again.");
  }

  const link = document.createElement("a");
  link.href = downloadUrl.href;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function ClientAccessPage() {
  const navigate = useNavigate();
  const [hasLinkSecret, setHasLinkSecret] = useState(false);
  const verifying = useRef(false);
  const [secret, setSecret] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const linkSecret = fragment.get("secret");
    if (!linkSecret) return;

    setSecret(linkSecret);
    setHasLinkSecret(true);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (verifying.current) return;
    verifying.current = true;
    setError("");
    setIsSubmitting(true);

    try {
      const access = await verifyClientAccess({ secret, pin });
      if (!access.authenticated || !access.galleryId)
        throw new Error("Gallery access was not confirmed. Please try again.");
      navigate(`/client/gallery/${encodeURIComponent(access.galleryId)}`, {
        replace: true,
      });
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError &&
          caughtError.code === "INVALID_GALLERY_ACCESS"
          ? "We couldn't verify this access. Check that you are using the latest gallery link and its matching PIN. The studio may need to publish the gallery or issue new access."
          : caughtError instanceof Error
            ? caughtError.message
            : "Gallery access could not be verified.",
      );
    } finally {
      verifying.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <main className="page-shell auth-shell">
      <div className="panel auth-panel">
        <div className="panel-header">
          <p className="eyebrow">Private gallery</p>
          <h1>Your gallery is just a step away.</h1>
          <p className="muted">
            Enter the six-digit PIN your photographer shared. Your private link
            and PIN will open the gallery securely.
          </p>
        </div>

        <form className="stack" onSubmit={handleSubmit}>
          {hasLinkSecret ? (
            <p className="muted">
              Your private gallery link is ready. Enter the matching PIN to
              continue.
            </p>
          ) : (
            <label className="field">
              <span>Private access key</span>
              <input
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                placeholder="Paste the key from your link"
                required
              />
            </label>
          )}

          <label className="field">
            <span>Six-digit gallery PIN</span>
            <input
              value={pin}
              onChange={(event) =>
                setPin(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="Enter 6 digits"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="\d{6}"
              required
            />
          </label>

          {error ? (
            <div className="error-box" role="alert">
              {error}
            </div>
          ) : null}

          <button
            className="primary-button"
            type="submit"
            disabled={isSubmitting}
          >
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
  feedback,
  onFeedbackChange,
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
  feedback: string;
  onFeedbackChange: (value: string) => void;
}) {
  const [photo, setPhoto] = useState<Awaited<
    ReturnType<typeof getClientPhoto>
  > | null>(null);
  const [error, setError] = useState("");
  const [feedbackError, setFeedbackError] = useState("");
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [isFeedbackSubmitting, setIsFeedbackSubmitting] = useState(false);
  const sendLock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [feedbackStatus, setFeedbackStatus] = useState("");
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const currentIndex = photos.findIndex((item) => item.photoId === photoId);
  const previousPhoto = currentIndex > 0 ? photos[currentIndex - 1] : null;
  const nextPhoto =
    currentIndex >= 0 && currentIndex < photos.length - 1
      ? photos[currentIndex + 1]
      : null;
  const isSelected = selectedPhotoIds.has(photoId);
  const canAdvance = Boolean(nextPhoto) || hasMorePhotos;
  const previousPhotoId = previousPhoto?.photoId;

  const handleNext = useCallback(async () => {
    if (sendLock.current) return;
    if (nextPhoto) {
      onNavigate(nextPhoto.photoId);
      return;
    }
    if (hasMorePhotos) {
      const firstNewPhotoId = await onLoadMore();
      if (firstNewPhotoId && mounted.current && !sendLock.current)
        onNavigate(firstNewPhotoId);
    }
  }, [hasMorePhotos, nextPhoto, onLoadMore, onNavigate]);

  useEffect(() => {
    let active = true;
    setPhoto(null);
    setError("");
    setFeedbackError("");
    setFeedbackStatus("");

    void getClientPhoto(galleryId, photoId)
      .then((result) => {
        if (active) setPhoto(result);
      })
      .catch((caughtError) => {
        if (active)
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Unable to open photograph.",
          );
      });

    return () => {
      active = false;
    };
  }, [galleryId, photoId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (sendLock.current) return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("input, textarea, select, [contenteditable]")
      )
        return;
      if (event.key === "ArrowLeft" && previousPhotoId) {
        event.preventDefault();
        onNavigate(previousPhotoId);
      } else if (event.key === "ArrowRight" && canAdvance) {
        event.preventDefault();
        void handleNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canAdvance, handleNext, onNavigate, previousPhotoId]);

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    setTouchStartX(event.changedTouches[0]?.clientX ?? null);
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (sendLock.current) return;
    if (touchStartX === null) return;
    const endX = event.changedTouches[0]?.clientX ?? touchStartX;
    const distance = endX - touchStartX;
    setTouchStartX(null);

    if (Math.abs(distance) < 48) return;
    if (distance < 0 && canAdvance) void handleNext();
    if (distance > 0 && previousPhoto) onNavigate(previousPhoto.photoId);
  };

  const handlePhotoFeedback = async () => {
    if (!feedback.trim() || sendLock.current) return;
    sendLock.current = true;
    setIsFeedbackSubmitting(true);
    setFeedbackError("");

    try {
      await createPhotoFeedback(galleryId, photoId, feedback.trim());
      onFeedbackChange("");
      setIsFeedbackOpen(false);
      setFeedbackStatus("Your note was sent to the photographer.");
    } catch (caughtError) {
      setFeedbackError(
        caughtError instanceof Error
          ? caughtError.message
          : "Photo feedback could not be submitted.",
      );
    } finally {
      sendLock.current = false;
      setIsFeedbackSubmitting(false);
    }
  };

  if (error) {
    return (
      <ModalDialog
        className="viewer-backdrop"
        label="Photograph viewer"
        onRequestClose={onClose}
        closeDisabled={isFeedbackSubmitting}
      >
        <div
          className={`viewer-panel${isFeedbackOpen ? " is-writing-note" : ""}`}
        >
          <div className="viewer-toolbar">
            <span>Unable to open photograph</span>
            <button
              type="button"
              className="viewer-close"
              disabled={isFeedbackSubmitting}
              onClick={onClose}
            >
              Close
            </button>
          </div>
          <div className="viewer-error">
            <div className="error-box">{error}</div>
          </div>
        </div>
      </ModalDialog>
    );
  }

  return (
    <ModalDialog
      className="viewer-backdrop"
      label="Photograph viewer"
      onRequestClose={onClose}
      closeDisabled={isFeedbackSubmitting}
    >
      <button
        type="button"
        className="viewer-dismiss"
        tabIndex={-1}
        disabled={isFeedbackSubmitting}
        aria-label="Close photograph viewer"
        onClick={onClose}
      />
      <div
        className={`viewer-panel${isFeedbackOpen ? " is-writing-note" : ""}`}
      >
        <div className="viewer-toolbar">
          <div>
            <span className="viewer-count">
              {currentIndex >= 0 ? currentIndex + 1 : "…"} of {totalPhotos}
            </span>
            {photo?.recommended ? (
              <span className="viewer-recommended">Recommended</span>
            ) : null}
          </div>
          <button
            type="button"
            className="viewer-close"
            disabled={isFeedbackSubmitting}
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div
          className="viewer-image-wrap"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {photo ? (
            <ClientPhotoImage
              key={`${galleryId}:${photoId}:${photo.preview.url}`}
              galleryId={galleryId}
              photoId={photoId}
              representation={photo.preview}
              variant="preview"
              alt={`Photograph ${photo.position + 1} from this gallery`}
            />
          ) : (
            <div className="viewer-loading">Loading photograph…</div>
          )}
        </div>

        <nav className="viewer-controls" aria-label="Photograph controls">
          <button
            type="button"
            className="viewer-nav viewer-nav-previous"
            onClick={() => previousPhoto && onNavigate(previousPhoto.photoId)}
            disabled={!previousPhoto || isFeedbackSubmitting}
            aria-label="Previous photograph"
          >
            Previous
          </button>

          <button
            type="button"
            className={`viewer-select ${isSelected ? "is-selected" : ""}`}
            onClick={() => onSelectToggle(photoId)}
            aria-pressed={isSelected}
            disabled={!photo || isFeedbackSubmitting}
          >
            {isSelected ? "Selected" : "Select photograph"}
          </button>

          <button
            type="button"
            className="viewer-nav viewer-nav-next"
            onClick={() => void handleNext()}
            disabled={!canAdvance || isFeedbackSubmitting}
            aria-label="Next photograph"
          >
            Next
          </button>

          <button
            type="button"
            className="viewer-feedback-trigger"
            onClick={() => setIsFeedbackOpen((open) => !open)}
            disabled={!photo || isFeedbackSubmitting}
          >
            {isFeedbackOpen ? "Close note" : "Leave a note"}
          </button>
        </nav>

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
              onChange={(event) => onFeedbackChange(event.target.value)}
              placeholder="Tell your photographer what you'd like changed or reviewed."
              maxLength={5000}
              disabled={isFeedbackSubmitting}
            />
            {feedbackError ? (
              <div className="viewer-feedback-error" role="alert">
                {feedbackError}
              </div>
            ) : null}
            <div className="viewer-feedback-actions">
              <button
                type="button"
                className="viewer-feedback-cancel"
                onClick={() => {
                  onFeedbackChange("");
                  setIsFeedbackOpen(false);
                }}
                disabled={isFeedbackSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="viewer-feedback-submit"
                disabled={isFeedbackSubmitting || !feedback.trim()}
              >
                {isFeedbackSubmitting ? "Sending…" : "Send note"}
              </button>
            </div>
          </form>
        ) : null}
        {feedbackStatus ? (
          <output className="muted" aria-live="polite">
            {feedbackStatus}
          </output>
        ) : null}
      </div>
    </ModalDialog>
  );
}

function ClientSelectionReviewPage() {
  const { galleryId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [galleryName, setGalleryName] = useState("Gallery");
  const [photos, setPhotos] = useState<ClientPhoto[]>([]);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(
    new Set(),
  );
  const [error, setError] = useState("");
  const [removingPhotoId, setRemovingPhotoId] = useState<string | null>(null);
  const [selectionStatus, setSelectionStatus] =
    useState<ClientSelection["status"]>("draft");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const retryLoad = useRetryableLoad(
    useCallback(
      async (isCurrent: () => boolean) => {
        if (!galleryId) return;
        setLoading(true);
        setLoadError("");
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

          const loadedPhotos = await loadClientPhotosForIds(
            galleryId,
            selectedIds,
          );
          if (!isCurrent()) return;

          setGalleryName(String(gallery.name ?? "Gallery"));
          setPhotos(loadedPhotos);
          setSelectedPhotoIds(selectedIds);
          setSelectionStatus(selectionResponse.status);
        } catch (caughtError) {
          if (isCurrent())
            setLoadError(
              caughtError instanceof Error
                ? caughtError.message
                : "Unable to load your selection.",
            );
        } finally {
          if (isCurrent()) setLoading(false);
        }
      },
      [galleryId],
    ),
  );

  const handleRemove = async (photoId: string) => {
    if (
      !galleryId ||
      removingPhotoId ||
      isSubmitting ||
      loading ||
      loadError ||
      selectionStatus === "submitted"
    )
      return;

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
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "This photograph could not be removed from your selection.",
      );
    } finally {
      setRemovingPhotoId(null);
    }
  };

  const handleSubmit = async () => {
    if (
      !galleryId ||
      isSubmitting ||
      removingPhotoId ||
      loading ||
      loadError ||
      selectedPhotoIds.size === 0 ||
      selectionStatus === "submitted"
    )
      return;

    setIsSubmitting(true);
    setError("");

    try {
      await submitSelection(galleryId);
      navigate(`/client/gallery/${galleryId}/complete`, { replace: true });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Your selection could not be submitted.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!galleryId) return <Navigate to="/client/access" replace />;

  if (loading || loadError)
    return (
      <main className="page-shell client-gallery-shell">
        <section className="panel workflow-state">
          <h1>
            {loading
              ? "Loading your shortlist…"
              : "Your shortlist couldn’t be loaded."}
          </h1>
          {loadError ? (
            <>
              <p className="error-box" role="alert">
                {loadError}
              </p>
              <button
                className="primary-button"
                type="button"
                onClick={retryLoad}
              >
                Try again
              </button>
            </>
          ) : (
            <output>Please wait while we check your saved choices.</output>
          )}
        </section>
      </main>
    );

  const selectedPhotos = photos.filter((photo) =>
    selectedPhotoIds.has(photo.photoId),
  );

  return (
    <main className="page-shell client-gallery-shell">
      <div className="client-gallery selection-review-page">
        <header className="gallery-header">
          <div>
            <p className="eyebrow">Your shortlist</p>
            <h1>{galleryName}</h1>
            <p className="gallery-intro">
              A final look before you send these choices to your photographer.
              You can still remove a photograph before submitting.
            </p>
          </div>
          {removingPhotoId || isSubmitting ? (
            <span className="muted">Saving your choices…</span>
          ) : (
            <Link
              to={`/client/gallery/${galleryId}`}
              className="secondary-button"
            >
              Back to photographs
            </Link>
          )}
        </header>

        {error ? (
          <div className="error-box" role="alert">
            {error}
          </div>
        ) : null}

        <div className="gallery-summary" aria-live="polite">
          <strong>{selectedPhotoIds.size} selected</strong>
          <span>
            {removingPhotoId
              ? "Saving your change…"
              : isSubmitting
                ? "Sending your choices…"
                : "Ready when you are"}
          </span>
        </div>

        {selectedPhotos.length === 0 ? (
          <section className="empty-state panel">
            <h2>Your shortlist is empty</h2>
            <p>
              Browse the gallery and select the photographs you’d like your
              photographer to focus on.
            </p>
            <Link
              to={`/client/gallery/${galleryId}`}
              className="primary-button"
            >
              Choose photographs
            </Link>
          </section>
        ) : (
          <div className="photo-grid client-photo-grid">
            {selectedPhotos.map((photo) => (
              <article
                key={photo.photoId}
                className="photo-card panel is-selected"
              >
                <div className="photo-thumb">
                  <ClientPhotoImage
                    key={`${galleryId}:${photo.photoId}:${photo.thumbnail.url}`}
                    galleryId={galleryId}
                    photoId={photo.photoId}
                    representation={photo.thumbnail}
                    variant="thumbnail"
                    alt={`Selected photograph ${photo.position + 1}`}
                    loading="lazy"
                  />
                  <span className="photo-selected-badge">Selected</span>
                </div>
                <button
                  type="button"
                  className="photo-select-button is-selected"
                  onClick={() => void handleRemove(photo.photoId)}
                  disabled={
                    Boolean(removingPhotoId) ||
                    isSubmitting ||
                    selectionStatus === "submitted"
                  }
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
            <output className="muted" aria-live="polite">
              Your selection has been sent to the photographer.
            </output>
          ) : (
            <>
              <p className="muted">
                Happy with your choices? Send them to your photographer to
                review.
              </p>
              <button
                type="button"
                className="primary-button"
                onClick={() => void handleSubmit()}
                disabled={
                  isSubmitting ||
                  Boolean(removingPhotoId) ||
                  selectedPhotoIds.size === 0
                }
              >
                {isSubmitting ? "Sending…" : "Send to photographer"}
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
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "We couldn't confirm your submission.",
        );
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
          <Link
            to={`/client/gallery/${galleryId}/selection`}
            className="primary-button"
          >
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
          Your selection from <strong>{galleryName}</strong> has been sent to
          your photographer.
        </p>
        <p className="gallery-intro">
          Your photographer can now review your choices and prepare the next
          step. Your photographs are not ready for download yet.
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
  const [canDownload, setCanDownload] = useState(false);
  const [loading, setLoading] = useState(true);
  const [downloadingPhotoId, setDownloadingPhotoId] = useState<string | null>(
    null,
  );
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");

  const retryLoad = useRetryableLoad(
    useCallback(
      async (isCurrent: () => boolean) => {
        if (!galleryId) return;
        setLoading(true);
        setLoadError("");
        setCanDownload(false);
        try {
          const [galleryRes, deliveryRes] = await Promise.all([
            getClientGallery(galleryId),
            getClientDelivery(galleryId),
          ]);
          const loadedPhotos = deliveryRes.isReleased
            ? await loadClientPhotosForIds(
                galleryId,
                new Set(deliveryRes.items.map((item) => item.photoId)),
              )
            : [];
          if (!isCurrent()) return;
          setGalleryName(String(galleryRes.name ?? "Gallery"));
          setCanDownload(galleryRes.permission === "view_download");
          setDelivery(deliveryRes);
          setPhotos(loadedPhotos);
        } catch (err) {
          if (isCurrent())
            setLoadError(
              err instanceof Error ? err.message : "Unable to load delivery.",
            );
        } finally {
          if (isCurrent()) setLoading(false);
        }
      },
      [galleryId],
    ),
  );

  const handleDownloadSingle = async (photoId: string) => {
    if (!galleryId || downloadingPhotoId || isDownloadingAll) return;
    setDownloadingPhotoId(photoId);
    setError("");
    try {
      const res = await downloadDeliveryPhoto(galleryId, photoId);
      if (!res.download_url)
        throw new Error(
          "The download link could not be created. Please try again.",
        );
      const item = delivery?.items.find(
        (deliveryItem) => deliveryItem.photoId === photoId,
      );
      startPhotoDownload(res.download_url, item?.filename || "photograph");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Download failed. Please try again.",
      );
    } finally {
      setDownloadingPhotoId(null);
    }
  };

  const handleDownloadAllDirect = async () => {
    if (
      !delivery ||
      !delivery.items.length ||
      !galleryId ||
      downloadingPhotoId ||
      isDownloadingAll
    )
      return;
    setIsDownloadingAll(true);
    setError("");
    let failedDownloads = 0;
    try {
      for (const item of delivery.items) {
        try {
          const res = await downloadDeliveryPhoto(galleryId, item.photoId);
          if (!res.download_url)
            throw new Error("Download link was not returned.");
          startPhotoDownload(res.download_url, item.filename || "photograph");
        } catch {
          failedDownloads += 1;
        }
      }
      if (failedDownloads > 0) {
        setError(
          `${failedDownloads} of ${delivery.items.length} photographs could not be prepared. You can retry failed downloads individually.`,
        );
      }
    } finally {
      setIsDownloadingAll(false);
    }
  };

  if (!galleryId) return <Navigate to="/client/access" replace />;

  if (loading) {
    return (
      <main className="page-shell">
        <div className="panel">
          <p className="muted">Loading your delivered photographs…</p>
        </div>
      </main>
    );
  }

  if (loadError)
    return (
      <main className="page-shell">
        <section className="panel workflow-state">
          <h1>Your delivery couldn’t be loaded.</h1>
          <p className="error-box" role="alert">
            {loadError}
          </p>
          <button className="primary-button" type="button" onClick={retryLoad}>
            Try again
          </button>
          <Link
            className="secondary-button"
            to={`/client/gallery/${galleryId}`}
          >
            Return to gallery
          </Link>
        </section>
      </main>
    );

  if (!delivery || !delivery.isReleased) {
    return (
      <main className="page-shell">
        <div className="panel">
          <p className="eyebrow">{galleryName}</p>
          <h1>Your photographs are being prepared</h1>
          <p className="muted">
            Your photographer is currently finishing your gallery. Once
            released, your final photographs will appear here.
          </p>
          <div style={{ marginTop: "20px" }}>
            <Link
              to={`/client/gallery/${galleryId}`}
              className="secondary-button"
            >
              Return to gallery
            </Link>
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
      preview: match?.thumbnail,
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
              {delivery.releasedAt
                ? new Date(delivery.releasedAt).toLocaleDateString()
                : "recently"}
              .
            </p>
          </div>
          <div className="client-delivery-actions">
            <Link
              to={`/client/gallery/${galleryId}`}
              className="secondary-button"
            >
              Back to gallery
            </Link>
            {canDownload && deliveredItems.length > 0 ? (
              <button
                type="button"
                className="primary-button"
                onClick={() => void handleDownloadAllDirect()}
                disabled={isDownloadingAll || Boolean(downloadingPhotoId)}
              >
                {isDownloadingAll ? "Preparing downloads…" : "Download all"}
              </button>
            ) : null}
          </div>
        </div>

        {error ? <div className="error-box">{error}</div> : null}
        {!canDownload ? (
          <output className="muted" aria-live="polite">
            This gallery link allows viewing only. Contact the studio if you
            need download access.
          </output>
        ) : null}
        {canDownload && deliveredItems.length > 1 ? (
          <p className="muted">
            Download all starts one file per photograph. Your browser may ask to
            allow multiple downloads.
          </p>
        ) : null}

        <div className="photo-grid client-delivery-grid">
          {deliveredItems.map((item) => (
            <article key={item.id} className="photo-card client-delivery-card">
              <div className="photo-thumb">
                {item.preview ? (
                  <ClientPhotoImage
                    key={`${galleryId}:${item.photoId}:${item.preview.url}`}
                    galleryId={galleryId}
                    photoId={item.photoId}
                    representation={item.preview}
                    variant="preview"
                    alt={item.filename}
                    loading="lazy"
                  />
                ) : (
                  <div className="photo-placeholder">{item.filename}</div>
                )}
              </div>
              <div className="photo-meta client-delivery-meta">
                <strong>Photograph {item.position + 1}</strong>
                {canDownload ? (
                  <button
                    type="button"
                    className="secondary-button compact-button"
                    disabled={
                      isDownloadingAll || downloadingPhotoId === item.photoId
                    }
                    onClick={() => handleDownloadSingle(item.photoId)}
                    aria-label={`Download photograph ${item.position + 1}`}
                  >
                    {downloadingPhotoId === item.photoId
                      ? "Preparing…"
                      : "Download"}
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}

function ClientGalleryPage() {
  // Isolate photographs, selection state and note drafts when the gallery changes.
  const { galleryId } = useParams();
  return <ClientGalleryWorkspace key={galleryId} />;
}

function ClientGalleryWorkspace() {
  const { galleryId } = useParams();
  const [galleryName, setGalleryName] = useState("Gallery");
  const [photos, setPhotos] = useState<ClientPhoto[]>([]);
  const [deliveryIsReleased, setDeliveryIsReleased] = useState(false);
  const [canDownload, setCanDownload] = useState(false);
  const [totalPhotos, setTotalPhotos] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(
    new Set(),
  );
  const [viewerPhotoId, setViewerPhotoId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState("");
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [isFeedbackSubmitting, setIsFeedbackSubmitting] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState("");
  const [feedbackError, setFeedbackError] = useState("");
  const [error, setError] = useState("");
  const [savingPhotoId, setSavingPhotoId] = useState<string | null>(null);
  const [selectionStatus, setSelectionStatus] =
    useState<ClientSelection["status"]>("draft");

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [deliveryLoading, setDeliveryLoading] = useState(true);
  const [deliveryError, setDeliveryError] = useState("");

  const retryLoad = useRetryableLoad(
    useCallback(
      async (isCurrent: () => boolean) => {
        if (!galleryId) return;
        setLoading(true);
        setLoadError("");
        try {
          const [gallery, photoResponse, selectionResponse] = await Promise.all(
            [
              getClientGallery(galleryId),
              listClientPhotos(galleryId, 1, 20),
              getClientSelection(galleryId),
            ],
          );
          if (!isCurrent()) return;
          setGalleryName(String(gallery.name ?? "Gallery"));
          setCanDownload(gallery.permission === "view_download");
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
          if (isCurrent())
            setLoadError(
              caughtError instanceof Error
                ? caughtError.message
                : "Unable to load gallery.",
            );
        } finally {
          if (isCurrent()) setLoading(false);
        }
      },
      [galleryId],
    ),
  );

  // Delivery availability is independent of reviewing and saving choices.
  const retryDelivery = useRetryableLoad(
    useCallback(
      async (isCurrent: () => boolean) => {
        if (!galleryId) return;
        setDeliveryLoading(true);
        setDeliveryError("");
        try {
          const response = await getClientDelivery(galleryId);
          if (isCurrent()) setDeliveryIsReleased(response.isReleased);
        } catch (caughtError) {
          if (isCurrent())
            setDeliveryError(
              caughtError instanceof Error
                ? caughtError.message
                : "Delivery status could not be checked.",
            );
        } finally {
          if (isCurrent()) setDeliveryLoading(false);
        }
      },
      [galleryId],
    ),
  );

  const handleSelectionToggle = async (photoId: string) => {
    if (!galleryId || savingPhotoId || selectionStatus === "submitted") return;

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
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Your selection could not be saved.",
      );
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
      const newPhotos = incoming.filter(
        (photo) => !existingIds.has(photo.photoId),
      );

      setPhotos((current) => [...current, ...newPhotos]);
      setCurrentPage(nextPage);
      setTotalPhotos(response.total ?? totalPhotos);
      return newPhotos[0]?.photoId ?? null;
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "More photographs could not be loaded.",
      );
      return null;
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleGalleryFeedback = async () => {
    if (!galleryId || !feedback.trim() || isFeedbackSubmitting) return;

    setIsFeedbackSubmitting(true);
    setFeedbackError("");
    try {
      await createGalleryFeedback(galleryId, feedback.trim());
      setFeedback("");
      setIsFeedbackOpen(false);
      setFeedbackStatus("Your note was sent to the photographer.");
    } catch (caughtError) {
      setFeedbackError(
        caughtError instanceof Error
          ? caughtError.message
          : "Your feedback could not be submitted.",
      );
    } finally {
      setIsFeedbackSubmitting(false);
    }
  };

  const handleOpenGalleryFeedback = () => {
    setFeedbackError("");
    setFeedbackStatus("");
    setIsFeedbackOpen(true);
  };

  const handleCloseGalleryFeedback = () => {
    if (isFeedbackSubmitting) return;
    setFeedbackError("");
    setIsFeedbackOpen(false);
  };

  if (!galleryId) {
    return <Navigate to="/client/access" replace />;
  }

  if (loading || loadError) {
    return (
      <main className="page-shell client-gallery-shell">
        <div className="client-gallery gallery-load-state">
          <p className="eyebrow">Your photographs</p>
          <h1>
            {loading
              ? "Opening your gallery"
              : "Your gallery couldn’t be loaded"}
          </h1>
          {loading ? (
            <output aria-live="polite">
              Loading your photographs and saved choices…
            </output>
          ) : (
            <div className="empty-state">
              <p className="error-box" role="alert">
                {loadError}
              </p>
              <p>
                Your saved choices are unchanged. Try loading the gallery again.
              </p>
              <button
                type="button"
                className="primary-button"
                onClick={retryLoad}
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell client-gallery-shell">
      <div className="client-gallery">
        <header className="gallery-header">
          <div>
            <p className="eyebrow">Your photographs</p>
            <h1>{galleryName}</h1>
            <p className="gallery-intro">
              Take your time. Open a photograph to see it in detail, then choose
              the images you’d like to keep in focus.
            </p>
          </div>
          {deliveryIsReleased ? (
            <Link
              to={`/client/gallery/${galleryId}/delivery`}
              className="primary-button delivery-ready-link"
            >
              {canDownload ? "Download final photos" : "View final photos"}
            </Link>
          ) : null}
        </header>

        {deliveryLoading ? (
          <output aria-live="polite" className="muted">
            Checking final photo availability…
          </output>
        ) : null}
        {deliveryError ? (
          <section
            className="empty-state delivery-status-notice"
            aria-label="Delivery status"
          >
            <p role="alert">
              We couldn’t check whether your final photos are ready.
            </p>
            <p>You can still review photographs and save your choices.</p>
            <button
              type="button"
              className="button-ghost"
              onClick={retryDelivery}
            >
              Check delivery again
            </button>
          </section>
        ) : null}
        {error ? (
          <div className="error-box" role="alert">
            {error}
          </div>
        ) : null}
        {feedbackStatus ? (
          <output className="muted" aria-live="polite">
            {feedbackStatus}
          </output>
        ) : null}

        <div className="gallery-summary" aria-live="polite">
          <strong>{selectedPhotoIds.size} selected</strong>
          <span>{totalPhotos} photographs</span>
        </div>

        <div className="photo-grid client-photo-grid">
          {photos.length === 0 ? (
            <div className="empty-state">
              <strong>Your gallery is taking shape.</strong>
              <span>
                There are no photographs to review just yet. Check back soon or
                contact the studio for an update.
              </span>
            </div>
          ) : (
            photos.map((photo) => {
              const selected = selectedPhotoIds.has(photo.photoId);
              return (
                <article
                  key={photo.photoId}
                  className={`photo-card panel ${selected ? "is-selected" : ""}`}
                >
                  <button
                    type="button"
                    className="photo-thumb"
                    onClick={() => setViewerPhotoId(photo.photoId)}
                    aria-label={`Open photograph ${photo.position + 1}${selected ? ", selected" : ""}`}
                  >
                    <ClientPhotoImage
                      key={`${galleryId}:${photo.photoId}:${photo.thumbnail.url}`}
                      galleryId={galleryId}
                      photoId={photo.photoId}
                      representation={photo.thumbnail}
                      variant="thumbnail"
                      insideButton
                      alt={`Photograph ${photo.position + 1} from this gallery`}
                      loading="lazy"
                    />
                    {selected ? (
                      <span className="photo-selected-badge">Selected</span>
                    ) : null}
                  </button>

                  <div className="photo-meta">
                    {photo.recommended ? (
                      <span className="tag">Recommended</span>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    className={`photo-select-button ${selected ? "is-selected" : ""}`}
                    onClick={() => void handleSelectionToggle(photo.photoId)}
                    disabled={
                      Boolean(savingPhotoId) || selectionStatus === "submitted"
                    }
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
            <button
              type="button"
              className="button-ghost"
              onClick={() => void handleLoadMore()}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? "Loading…" : "Load more photographs"}
            </button>
          </div>
        ) : null}

        {isFeedbackOpen ? (
          <form
            className="gallery-feedback"
            onSubmit={(event) => {
              event.preventDefault();
              void handleGalleryFeedback();
            }}
          >
            <textarea
              id="gallery-feedback"
              className="textarea"
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              placeholder="Share a thought, question, or anything you’d like the photographer to know."
              aria-label="Note for your photographer"
              maxLength={5000}
              disabled={isFeedbackSubmitting}
            />
            {feedbackError ? (
              <div className="error-box" role="alert">
                {feedbackError}
              </div>
            ) : null}
            <button
              type="button"
              className="secondary-button"
              onClick={handleCloseGalleryFeedback}
              disabled={isFeedbackSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={isFeedbackSubmitting || !feedback.trim()}
            >
              {isFeedbackSubmitting ? "Sending…" : "Send note"}
            </button>
          </form>
        ) : (
          <button
            type="button"
            className="button-ghost feedback-trigger"
            onClick={handleOpenGalleryFeedback}
          >
            Leave a note for your photographer
          </button>
        )}
      </div>

      {selectedPhotoIds.size > 0 ? (
        <section
          className="selection-bar"
          aria-live="polite"
          aria-label="Selection status"
        >
          <div>
            <strong>{selectedPhotoIds.size} selected</strong>
            <span className="selection-bar-note">
              {savingPhotoId
                ? "Saving your choice…"
                : error
                  ? "A change could not be saved. Check the message above."
                  : "Your choices are saved."}
            </span>
          </div>
          {savingPhotoId ? (
            <span className="muted">Saving…</span>
          ) : (
            <Link
              to={`/client/gallery/${galleryId}/selection`}
              className="primary-button selection-review-link"
            >
              Review selection
            </Link>
          )}
        </section>
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
          feedback={noteDrafts[viewerPhotoId] ?? ""}
          onFeedbackChange={(value) =>
            setNoteDrafts((current) => ({ ...current, [viewerPhotoId]: value }))
          }
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
