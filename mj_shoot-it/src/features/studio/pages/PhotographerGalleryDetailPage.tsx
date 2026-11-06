import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { StudioDeliverySection, StudioFeedbackReview, StudioPhotoList, StudioSelectionReview } from "@/features/studio/components/GalleryWorkspaceSections";
import {
  ApiError,
  completePhotoUpload,
  createGalleryAccess,
  createPhotoUpload,
  deletePhoto,
  getGalleryAccess,
  getGallery,
  getStudioPhotoStatus,
  getPhotographerMe,
  getStudioDelivery,
  listGalleryPhotos,
  listSelectedPhotos,
  listStudioFeedback,
  prepareStudioDelivery,
  releaseStudioDelivery,
  resetGalleryAccess,
  setStudioPhotoReview,
  type GalleryAccessCredentials,
  type PhotoRecord,
  type StudioDeliveryDetails,
  type StudioFeedback,
  type StudioSelectedPhoto,
  uploadPhotoFile,
} from "@/lib/api";

type GalleryDetail = Record<string, unknown> & {
  name?: string;
  selectionStatus?: string;
  selectionSubmittedAt?: string | null;
};

type PhotoUploadItem = {
  id: string;
  file: File;
  status: "queued" | "uploading" | "processing" | "complete" | "failed";
  progress: number;
  error?: string;
};

async function waitForPhotoProcessing(photoId: string): Promise<"active" | "failed" | "timeout"> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const { status } = await getStudioPhotoStatus(photoId);
    if (status === "active" || status === "failed") return status;
    await new Promise((resolve) => window.setTimeout(resolve, 1000));
  }
  return "timeout";
}

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
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [gallery, setGallery] = useState<GalleryDetail | null>(null);

  useEffect(() => {
    if (!gallery || searchParams.get("created") !== "1") return;
    const heading = document.getElementById("photo-upload-heading");
    heading?.scrollIntoView({ block: "start" });
    heading?.focus({ preventScroll: true });
  }, [gallery, searchParams]);
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [selection, setSelection] = useState<StudioSelectedPhoto[]>([]);
  const [feedback, setFeedback] = useState<StudioFeedback[]>([]);
  const [permission, setPermission] = useState<"view" | "view_download">("view_download");
  const [accessCredentials, setAccessCredentials] = useState<GalleryAccessCredentials | null>(null);
  const [hasActiveAccess, setHasActiveAccess] = useState(false);
  const [accessStatus, setAccessStatus] = useState<"loading" | "available" | "forbidden" | "error">("loading");
  const [accessError, setAccessError] = useState("");
  const [isIssuingAccess, setIsIssuingAccess] = useState(false);
  const [accessCopyStatus, setAccessCopyStatus] = useState("");
  const [error, setError] = useState("");
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  const [delivery, setDelivery] = useState<StudioDeliveryDetails | null>(null);
  const [isProcessingDelivery, setIsProcessingDelivery] = useState(false);
  const [photoUploads, setPhotoUploads] = useState<PhotoUploadItem[]>([]);
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  const [photoUploadError, setPhotoUploadError] = useState("");

  const handlePhotoFiles = async (files: FileList | null) => {
    if (!galleryId || !files?.length || isUploadingPhotos) return;

    const uploads = Array.from(files).map((file): PhotoUploadItem => ({
      id: crypto.randomUUID(),
      file,
      status: file.type.startsWith("image/") ? "queued" : "failed",
      progress: 0,
      error: file.type.startsWith("image/") ? undefined : "Choose an image file.",
    }));
    setPhotoUploads(uploads);
    setPhotoUploadError("");
    setIsUploadingPhotos(true);
    let acceptedUploads = 0;

    for (const upload of uploads) {
      if (upload.status === "failed") continue;
      let photoId: string | null = null;
      let uploadCompleted = false;
      try {
        const capability = await createPhotoUpload(galleryId, upload.file);
        photoId = capability.photo.id;
        setPhotoUploads((current) => current.map((item) =>
          item.id === upload.id ? { ...item, status: "uploading" } : item,
        ));
        await uploadPhotoFile(capability.upload, upload.file, (progress) => {
          setPhotoUploads((current) => current.map((item) =>
            item.id === upload.id ? { ...item, progress } : item,
          ));
        });
        setPhotoUploads((current) => current.map((item) =>
          item.id === upload.id ? { ...item, status: "processing" } : item,
        ));
        await completePhotoUpload(capability.photo.id);
        uploadCompleted = true;
        acceptedUploads += 1;
        const processingStatus = await waitForPhotoProcessing(capability.photo.id);
        if (processingStatus === "failed") {
          await deletePhoto(capability.photo.id);
          setPhotoUploads((current) => current.map((item) =>
            item.id === upload.id ? { ...item, status: "failed", error: "Photo processing failed. The incomplete photo was removed; try uploading it again." } : item,
          ));
        } else if (processingStatus === "active") {
          setPhotoUploads((current) => current.map((item) =>
            item.id === upload.id ? { ...item, status: "complete", progress: 100 } : item,
          ));
        } else {
          setPhotoUploads((current) => current.map((item) =>
            item.id === upload.id ? { ...item, status: "processing", error: "Upload received; processing is taking longer than expected. Refresh the gallery shortly." } : item,
          ));
        }
      } catch (caughtError) {
        let errorMessage = caughtError instanceof Error ? caughtError.message : "Unable to upload this photo.";
        if (photoId && !uploadCompleted) {
          try {
            await deletePhoto(photoId);
          } catch (cleanupError) {
            const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : "Unable to clean up the failed upload.";
            errorMessage = `${errorMessage} The incomplete photo could not be removed: ${cleanupMessage}`;
          }
        }
        setPhotoUploads((current) => current.map((item) =>
          item.id === upload.id
            ? {
                ...item,
                status: uploadCompleted ? "processing" : "failed",
                error: uploadCompleted ? `Upload was accepted, but processing could not be confirmed: ${errorMessage}` : errorMessage,
              }
            : item,
        ));
      }
    }

    try {
      const photoSummary = await listGalleryPhotos(galleryId, 1, 1);
      const lastPage = acceptedUploads > 0 ? Math.max(1, Math.ceil(photoSummary.total / 20)) : 1;
      const refreshedPhotos = await listGalleryPhotos(galleryId, lastPage, 20);
      setPhotos(refreshedPhotos.items);
    } catch (caughtError) {
      setPhotoUploadError(caughtError instanceof Error ? caughtError.message : "Photos uploaded but the gallery could not be refreshed.");
    } finally {
      setIsUploadingPhotos(false);
    }
  };

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
    let active = true;
    const load = async () => {
      if (!galleryId) return;
      setError("");
      setGallery(null);
      setPhotos([]);
      setSelection([]);
      setFeedback([]);
      setDelivery(null);
      setAccessCredentials(null);
      setHasActiveAccess(false);
      setAccessStatus("loading");
      setAccessError("");

      try {
        const me = await getPhotographerMe();
        if (!active) return;
        if (!me?.user) {
          navigate("/photographer/login", { replace: true });
          return;
        }

        const [galleryResponse, photoResponse, selectionResponse, feedbackResponse, deliveryResponse, accessResult] = await Promise.all([
          getGallery(galleryId),
          listGalleryPhotos(galleryId, 1, 20),
          listSelectedPhotos(galleryId),
          listStudioFeedback(galleryId),
          getStudioDelivery(galleryId).catch((err: unknown) => {
            if (err instanceof ApiError && err.status === 404) return null;
            throw err;
          }),
          getGalleryAccess(galleryId).then(
            (items) => ({ items }),
            (error: unknown) => ({ error }),
          ),
        ]);
        if (!active) return;
        setGallery(galleryResponse as GalleryDetail);
        setPhotos(photoResponse.items ?? []);
        setSelection(selectionResponse);
        setFeedback(feedbackResponse);
        setDelivery(deliveryResponse);
        if ("items" in accessResult) {
          const now = Date.now();
          setHasActiveAccess(accessResult.items.some((access) =>
            !access.revokedAt && (!access.expiresAt || Date.parse(access.expiresAt) > now),
          ));
          setAccessStatus("available");
        } else if (accessResult.error instanceof ApiError && accessResult.error.status === 403) {
          setAccessStatus("forbidden");
        } else {
          setAccessStatus("error");
          setAccessError(accessResult.error instanceof Error
            ? accessResult.error.message
            : "Unable to check current client access.");
        }
      } catch (caughtError) {
        if (!active) return;
        setError(caughtError instanceof Error ? caughtError.message : "Unable to load gallery.");
      }
    };

    void load();
    return () => { active = false; };
  }, [galleryId, navigate]);

  const handleAccessGrant = async () => {
    if (!galleryId || isIssuingAccess) return;

    setIsIssuingAccess(true);
    setError("");
    setAccessCopyStatus("");
    try {
      const input = { permission, expiresAt: null };
      const credentials = hasActiveAccess
        ? await resetGalleryAccess(galleryId, input)
        : await createGalleryAccess(galleryId, input);
      setAccessCredentials(credentials);
      setHasActiveAccess(true);
    } catch (caughtError) {
      if (caughtError instanceof ApiError && caughtError.status === 409 && caughtError.code === "INVALID_GALLERY_ACCESS") {
        setHasActiveAccess(true);
        setError("");
        return;
      }
      if (caughtError instanceof ApiError && caughtError.status === 404 && caughtError.code === "INVALID_GALLERY_ACCESS") {
        setHasActiveAccess(false);
        setAccessCredentials(null);
        setError("The previous access grant is no longer active. Issue a new link.");
        return;
      }
      setError(caughtError instanceof Error
        ? caughtError.message
        : hasActiveAccess ? "Unable to regenerate gallery access." : "Unable to create gallery access.");
    } finally {
      setIsIssuingAccess(false);
    }
  };

  const copyAccessValue = async (value: string, label: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable.");
      await navigator.clipboard.writeText(value);
      setAccessCopyStatus(`${label} copied.`);
    } catch {
      setAccessCopyStatus(`Copy isn’t available here. Select the ${label.toLowerCase()} above and copy it manually.`);
    }
  };

  if (!galleryId) return <Navigate to="/photographer/galleries" replace />;

  const selectedPhoto = selectedPhotoIndex === null ? null : selection[selectedPhotoIndex] ?? null;
  const clientAccessUrl = accessCredentials
    ? `${window.location.origin}/client/access?galleryId=${encodeURIComponent(galleryId)}#secret=${encodeURIComponent(accessCredentials.secretToken)}`
    : "";

  return (
    <main className="page-shell">
      {searchParams.get("created") === "1" && !hasActiveAccess ? (
        <section className="gallery-setup-banner" aria-label="Gallery created">
          <p className="eyebrow">01 Complete / 02 Add photographs / 03 Share access</p>
          <h2>Your gallery is created.</h2>
          <p>Next, add your photographs. No client access has been issued by creating this draft.</p>
          <a className="primary-button" href="#photo-upload">Add photographs ↓</a>
        </section>
      ) : null}
      <div className="panel">
        <div className="panel-header compact-header">
          <div>
            <p className="eyebrow">Gallery workspace</p>
            <h1>{String(gallery?.name ?? "Loading gallery…")}</h1>
          </div>
          <Link to="/photographer/galleries" className="secondary-button">Back to galleries</Link>
        </div>

        {accessStatus === "loading" ? <p className="muted">Checking client access…</p> : null}
        {accessStatus === "forbidden" ? <p className="muted">You do not have permission to manage client access for this gallery.</p> : null}
        {accessStatus === "error" ? <div className="error-box">{accessError}</div> : null}
        {accessStatus === "available" ? (
          <div className="toolbar-stack">
            <label className="field compact-field">
              <span>What the client can do</span>
              <select value={permission} onChange={(event) => setPermission(event.target.value as "view" | "view_download")}>
                <option value="view">View</option>
                <option value="view_download">View + download</option>
              </select>
            </label>
            <button type="button" className="primary-button" disabled={isIssuingAccess} onClick={handleAccessGrant}>
              {isIssuingAccess ? (hasActiveAccess ? "Creating new link…" : "Issuing…") : (hasActiveAccess ? "Create new share link" : "Issue access link")}
            </button>
          </div>
        ) : null}
        {hasActiveAccess ? (
          <p className="muted">
            Creating a new link replaces the current link and PIN and ends existing client sessions. Saved client feedback and selections will remain. New credentials are shown only once.
          </p>
        ) : null}

        {accessCredentials ? (
          <section className="panel access-credentials-panel" aria-live="polite">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Share with client</p>
                <h2>Access issued</h2>
                <p className="muted">Send the link and PIN separately. This PIN is shown only in this response.</p>
              </div>
            </div>
            <label className="field access-credential-field">
              <span>Client access link</span>
              <span className="access-credential-control">
                <input readOnly value={clientAccessUrl} onFocus={(event) => event.currentTarget.select()} aria-label="Client access link" />
                <button type="button" className="secondary-button" onClick={() => void copyAccessValue(clientAccessUrl, "Link")}>Copy link</button>
              </span>
            </label>
            <label className="field access-credential-field">
              <span>Six-digit PIN — send separately</span>
              <span className="access-credential-control">
                <input readOnly value={accessCredentials.pin} onFocus={(event) => event.currentTarget.select()} aria-label="Six-digit gallery PIN" />
                <button type="button" className="secondary-button" onClick={() => void copyAccessValue(accessCredentials.pin, "PIN")}>Copy PIN</button>
              </span>
            </label>
            {accessCopyStatus ? <output className="muted" aria-live="polite">{accessCopyStatus}</output> : null}
            {gallery?.publicationStatus !== "published" ? (
              <p className="muted">
                Clients can open this link only after the gallery is published.
              </p>
            ) : null}
            <p className="muted">For privacy, send this link and PIN in separate messages. Keep this screen open until you’ve shared both.</p>
          </section>
        ) : null}

        {error ? <div className="error-box">{error}</div> : null}

        {gallery?.selectionStatus === "submitted" ? (
          <StudioSelectionReview
            submittedAt={gallery.selectionSubmittedAt}
            selection={selection}
            onSelect={setSelectedPhotoIndex}
          />
        ) : null}

        <StudioDeliverySection
          delivery={delivery}
          isProcessing={isProcessingDelivery}
          onPrepare={() => void handlePrepareDelivery()}
          onRelease={() => void handleReleaseDelivery()}
        />

        <StudioFeedbackReview feedback={feedback} />

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

        <section id="photo-upload" className="photo-upload panel" aria-labelledby="photo-upload-heading">
          <div className="panel-header compact-header">
            <div>
              <p className="eyebrow">Gallery photos</p>
              <h2 id="photo-upload-heading" tabIndex={-1}>Add photographs</h2>
              <p className="muted">Choose image files to add to this gallery. They’ll appear here as each upload finishes processing.</p>
            </div>
          </div>
          <label className="field photo-upload-picker">
            <span>Select photos to upload</span>
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={isUploadingPhotos}
              onChange={(event) => {
                void handlePhotoFiles(event.currentTarget.files);
                event.currentTarget.value = "";
              }}
            />
          </label>
          {photoUploadError ? <div className="error-box" role="alert">{photoUploadError}</div> : null}
          {photoUploads.length ? (
            <ul className="list-stack photo-upload-list" aria-live="polite">
              {photoUploads.map((upload) => (
                <li className="list-row photo-upload-row" key={upload.id}>
                  <div className="photo-upload-details">
                    <strong>{upload.file.name}</strong>
                    <small>
                      {upload.status === "queued" ? "Waiting to upload" : null}
                      {upload.status === "uploading" ? `Uploading · ${upload.progress}%` : null}
                      {upload.status === "processing" ? "Upload complete · preparing photo" : null}
                      {upload.status === "complete" ? "Upload complete" : null}
                      {upload.status === "failed" ? upload.error : null}
                    </small>
                    {upload.status === "uploading" ? (
                      <progress value={upload.progress} max={100} aria-label={`Uploading ${upload.file.name}`} />
                    ) : null}
                  </div>
                  <span className={`tag photo-upload-status status-${upload.status}`}>
                    {upload.status === "complete" ? "Complete" : upload.status === "failed" ? "Failed" : upload.status === "processing" ? "Processing" : upload.status === "uploading" ? "Uploading" : "Queued"}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
        <StudioPhotoList photos={photos} />
      </div>
    </main>
  );
}
