import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  createGalleryAccess,
  getGallery,
  getPhotographerMe,
  getStudioDelivery,
  listGalleryPhotos,
  listSelectedPhotos,
  listStudioFeedback,
  prepareStudioDelivery,
  releaseStudioDelivery,
  setStudioPhotoReview,
  type PhotoRecord,
  type StudioDeliveryDetails,
  type StudioFeedback,
  type StudioSelectedPhoto,
} from "@/lib/api";

type GalleryDetail = Record<string, unknown> & {
  name?: string;
  selectionStatus?: string;
  selectionSubmittedAt?: string | null;
};

function StudioPhotoViewerModal({
  galleryId,
  selectedPhoto,
  selectedPhotoIndex,
  totalPhotos,
  feedbackList,
  onClose,
  onNavigate,
  onReviewUpdate,
}: {
  galleryId: string;
  selectedPhoto: StudioSelectedPhoto;
  selectedPhotoIndex: number;
  totalPhotos: number;
  feedbackList: StudioFeedback[];
  onClose: () => void;
  onNavigate: (index: number) => void;
  onReviewUpdate: (updated: Awaited<ReturnType<typeof setStudioPhotoReview>>) => void;
}) {
  const [status, setStatus] = useState<"approved" | "needs_revision">(
    selectedPhoto.reviewStatus === "needs_revision" ? "needs_revision" : "approved",
  );
  const [note, setNote] = useState(selectedPhoto.reviewNote ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setStatus(selectedPhoto.reviewStatus === "needs_revision" ? "needs_revision" : "approved");
    setNote(selectedPhoto.reviewNote ?? "");
    setError("");
  }, [selectedPhoto.photoId, selectedPhoto.reviewStatus, selectedPhoto.reviewNote]);

  const saveReview = async () => {
    if (status === "needs_revision" && !note.trim()) {
      setError("Add a revision note before requesting changes.");
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      const updated = await setStudioPhotoReview(galleryId, selectedPhoto.photoId, status, note.trim() || null);
      onReviewUpdate(updated);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to save the review.");
    } finally {
      setIsSaving(false);
    }
  };

  const photoFeedback = feedbackList.filter((item) => item.feedbackType === "photo" && item.photoId === selectedPhoto.photoId);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="panel studio-photo-review-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Review photograph ${selectedPhoto.position + 1}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="panel-header compact-header">
          <div>
            <p className="eyebrow">Proofing</p>
            <h2>Photograph {selectedPhoto.position + 1}</h2>
            <p className="muted">{selectedPhoto.filename}</p>
          </div>
          <button type="button" className="secondary-button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="photo-viewer-stage">
          <img
            src={selectedPhoto.preview.url}
            alt={`Selected photograph ${selectedPhoto.position + 1}`}
            width={selectedPhoto.preview.width}
            height={selectedPhoto.preview.height}
          />
        </div>

        {photoFeedback.length > 0 ? (
          <div className="studio-feedback-review">
            <p className="eyebrow">Client feedback</p>
            {photoFeedback.map((item) => (
              <p key={item.id}>{item.message}</p>
            ))}
          </div>
        ) : null}

        <div className="toolbar-stack">
          <label className="field">
            <span>Review decision</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
              <option value="approved">Approved</option>
              <option value="needs_revision">Needs revision</option>
            </select>
          </label>

          {status === "needs_revision" ? (
            <label className="field">
              <span>Revision note</span>
              <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} maxLength={2000} />
            </label>
          ) : null}
        </div>

        {error ? <div className="error-box">{error}</div> : null}

        <div className="inline-actions">
          <button type="button" className="secondary-button" disabled={selectedPhotoIndex === 0} onClick={() => onNavigate(selectedPhotoIndex - 1)}>
            Previous
          </button>
          <button type="button" className="primary-button" disabled={isSaving} onClick={saveReview}>
            {isSaving ? "Saving..." : "Save review"}
          </button>
          <button type="button" className="secondary-button" disabled={selectedPhotoIndex >= totalPhotos - 1} onClick={() => onNavigate(selectedPhotoIndex + 1)}>
            Next
          </button>
        </div>
      </section>
    </div>
  );
}

export default function PhotographerGalleryDetailPage() {
  const { galleryId } = useParams();
  const navigate = useNavigate();
  const [gallery, setGallery] = useState<GalleryDetail | null>(null);
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
      setDelivery(await prepareStudioDelivery(galleryId));
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
      setDelivery(await releaseStudioDelivery(galleryId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to release delivery.");
    } finally {
      setIsProcessingDelivery(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      if (!galleryId) return;

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

        setGallery(galleryResponse as GalleryDetail);
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
    if (!galleryId) return;

    try {
      await createGalleryAccess(galleryId, { permission, expiresAt: null });
      const photoResponse = await listGalleryPhotos(galleryId, 1, 20);
      setPhotos(photoResponse.items ?? []);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to create gallery access.");
    }
  };

  if (!galleryId) return <Navigate to="/photographer/galleries" replace />;

  const selectedPhoto = selectedPhotoIndex === null ? null : selection[selectedPhotoIndex] ?? null;

  return (
    <main className="page-shell">
      <div className="panel">
        <div className="panel-header compact-header">
          <div>
            <p className="eyebrow">Gallery</p>
            <h1>{String(gallery?.name ?? "Loading gallery…")}</h1>
          </div>
          <Link to="/photographer/galleries" className="secondary-button">Back to galleries</Link>
        </div>

        <div className="toolbar-stack">
          <label className="field compact-field">
            <span>Permission</span>
            <select value={permission} onChange={(event) => setPermission(event.target.value as "view" | "view_download")}>
              <option value="view">View</option>
              <option value="view_download">View + download</option>
            </select>
          </label>
          <button type="button" className="primary-button" onClick={handleAccessGrant}>Issue access link</button>
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
                      <img src={photo.preview.url} alt={`Selected photograph ${photo.position + 1}`} width={photo.preview.width} height={photo.preview.height} loading="lazy" decoding="async" />
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

        <section className="studio-delivery-section panel" style={{ marginTop: "20px" }}>
          <div className="panel-header compact-header">
            <div>
              <p className="eyebrow">Delivery Workflow</p>
              <h2>Release Final Photographs</h2>
              <p className="muted">{delivery?.approvedCount ?? 0} of {delivery?.totalSelectedCount ?? 0} selected photographs approved.</p>
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
                <button type="button" className="primary-button" disabled={isProcessingDelivery} onClick={handlePrepareDelivery}>
                  {isProcessingDelivery ? "Preparing..." : "1. Prepare Final Delivery Assets"}
                </button>
                {delivery?.status === "ready" || delivery?.items.length ? (
                  <button type="button" className="primary-button" style={{ background: "#137333" }} disabled={isProcessingDelivery} onClick={handleReleaseDelivery}>
                    {isProcessingDelivery ? "2. Explicitly Release to Client" : "Release Delivery"}
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="muted">You cannot prepare delivery until all selected photographs are reviewed and approved in Proofing.</p>
            )}
          </div>

          {delivery?.items && delivery.items.length > 0 ? (
            <ul className="list-stack">
              {delivery.items.map((item) => (
                <li key={item.id} className="list-row">
                  <div><strong>Photograph {item.position + 1}</strong><small>{item.filename}</small></div>
                  <span className="tag status-approved">Ready for download</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

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
                    <strong>{item.feedbackType === "photo" ? "Photograph " + (Number(item.position ?? 0) + 1) : "Gallery note"}</strong>
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
                    ? { ...item, reviewStatus: updated.status, reviewNote: updated.note, reviewedAt: updated.reviewedAt }
                    : item,
                ),
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
                <div><strong>{photo.filename}</strong><small>{photo.mimeType ?? "image"}</small></div>
                <span className="tag">{photo.status ?? "ready"}</span>
              </li>
            ))
          )}
        </ul>
      </div>
    </main>
  );
}
