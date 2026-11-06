import { useCallback, useEffect, useRef, useState } from "react";
import {
  Link,
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  StudioDeliverySection,
  StudioFeedbackReview,
  StudioPhotoList,
  StudioSelectionReview,
} from "@/features/studio/components/GalleryWorkspaceSections";
import {
  ApiError,
  completePhotoUpload,
  createGalleryAccess,
  createPhotoUpload,
  deletePhoto,
  type GalleryAccessCredentials,
  getGallery,
  getGalleryAccess,
  getPhotographerMe,
  getStudioDelivery,
  getStudioPhotoStatus,
  listGalleryPhotos,
  listSelectedPhotos,
  listStudioFeedback,
  type PhotoRecord,
  prepareStudioDelivery,
  publishGallery,
  releaseStudioDelivery,
  resetGalleryAccess,
  type StudioDeliveryDetails,
  type StudioFeedback,
  type StudioSelectedPhoto,
  setStudioPhotoReview,
  uploadPhotoFile,
} from "@/lib/api";
import { useRetryableLoad } from "@/lib/use-retryable-load";
import { GalleryPublicationPanel } from "../components/GalleryPublicationPanel";

type GalleryDetail = Record<string, unknown> & {
  name?: string;
  selectionStatus?: string | null;
  selectionSubmittedAt?: string | null;
};

type PhotoUploadItem = {
  id: string;
  file: File;
  status: "queued" | "uploading" | "processing" | "complete" | "failed";
  progress: number;
  photoId?: string;
  error?: string;
};

async function waitForPhotoProcessing(
  photoId: string,
): Promise<"active" | "failed" | "timeout"> {
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
  onReviewUpdate: (
    updated: Awaited<ReturnType<typeof setStudioPhotoReview>>,
  ) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  const [status, setStatus] = useState<"approved" | "needs_revision">(
    selectedPhoto.reviewStatus === "needs_revision"
      ? "needs_revision"
      : "approved",
  );
  const [note, setNote] = useState(selectedPhoto.reviewNote ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setStatus(
      selectedPhoto.reviewStatus === "needs_revision"
        ? "needs_revision"
        : "approved",
    );
    setNote(selectedPhoto.reviewNote ?? "");
    setError("");
  }, [selectedPhoto.reviewStatus, selectedPhoto.reviewNote]);

  const saveReview = async () => {
    if (status === "needs_revision" && !note.trim()) {
      setError("Add a revision note before requesting changes.");
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      const updated = await setStudioPhotoReview(
        galleryId,
        selectedPhoto.photoId,
        status,
        note.trim() || null,
      );
      onReviewUpdate(updated);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to save the review.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const photoFeedback = feedbackList.filter(
    (item) =>
      item.feedbackType === "photo" && item.photoId === selectedPhoto.photoId,
  );

  return (
    <dialog
      ref={dialogRef}
      className="panel studio-photo-review-modal"
      aria-label={`Review photograph ${selectedPhoto.position + 1}`}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = event.currentTarget.querySelectorAll<HTMLElement>(
          "button:not(:disabled), select:not(:disabled), textarea:not(:disabled), input:not(:disabled), a[href]",
        );
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!first) {
          event.preventDefault();
          return;
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!isSaving) onClose();
      }}
    >
      <div className="panel-header compact-header">
        <div>
          <p className="eyebrow">Proofing</p>
          <h2>Photograph {selectedPhoto.position + 1}</h2>
          <p className="muted">{selectedPhoto.filename}</p>
        </div>
        <button
          type="button"
          className="secondary-button"
          disabled={isSaving}
          onClick={onClose}
        >
          Close
        </button>
      </div>

      <div className="studio-photo-viewer-image-wrap">
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
          <select
            value={status}
            disabled={isSaving}
            onChange={(event) => setStatus(event.target.value as typeof status)}
          >
            <option value="approved">Approved</option>
            <option value="needs_revision">Needs revision</option>
          </select>
        </label>

        {status === "needs_revision" ? (
          <label className="field">
            <span>Revision note</span>
            <textarea
              value={note}
              disabled={isSaving}
              onChange={(event) => setNote(event.target.value)}
              rows={4}
              maxLength={2000}
            />
          </label>
        ) : null}
      </div>

      {error ? <div className="error-box">{error}</div> : null}

      <div className="inline-actions">
        <button
          type="button"
          className="secondary-button"
          disabled={isSaving || selectedPhotoIndex === 0}
          onClick={() => onNavigate(selectedPhotoIndex - 1)}
        >
          Previous
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={isSaving}
          onClick={saveReview}
        >
          {isSaving ? "Saving..." : "Save review"}
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={isSaving || selectedPhotoIndex >= totalPhotos - 1}
          onClick={() => onNavigate(selectedPhotoIndex + 1)}
        >
          Next
        </button>
      </div>
    </dialog>
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
  const [permission, setPermission] = useState<"view" | "view_download">(
    "view",
  );
  const [accessCredentials, setAccessCredentials] =
    useState<GalleryAccessCredentials | null>(null);
  const [hasActiveAccess, setHasActiveAccess] = useState(false);
  const [accessStatus, setAccessStatus] = useState<
    "loading" | "available" | "forbidden" | "error"
  >("loading");
  const [accessError, setAccessError] = useState("");
  const [isIssuingAccess, setIsIssuingAccess] = useState(false);
  const [accessCopyStatus, setAccessCopyStatus] = useState("");
  const [error, setError] = useState("");
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(
    null,
  );
  const [delivery, setDelivery] = useState<StudioDeliveryDetails | null>(null);
  const [isProcessingDelivery, setIsProcessingDelivery] = useState(false);
  const [photoUploads, setPhotoUploads] = useState<PhotoUploadItem[]>([]);
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  const [photoUploadError, setPhotoUploadError] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [checkingUploadId, setCheckingUploadId] = useState<string | null>(null);
  const uploadLock = useRef(false);
  const publishLock = useRef(false);
  const waitingForPhotos =
    isUploadingPhotos ||
    photoUploads.some((item) =>
      ["queued", "uploading", "processing"].includes(item.status),
    );

  useEffect(() => {
    if (!isUploadingPhotos && !isPublishing) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [isUploadingPhotos, isPublishing]);

  const handlePhotoFiles = async (files: FileList | null) => {
    if (
      !galleryId ||
      !gallery ||
      !files?.length ||
      uploadLock.current ||
      isPublishing
    )
      return;
    uploadLock.current = true;

    const uploads = Array.from(files).map(
      (file): PhotoUploadItem => ({
        id: crypto.randomUUID(),
        file,
        status: file.type.startsWith("image/") ? "queued" : "failed",
        progress: 0,
        error: file.type.startsWith("image/")
          ? undefined
          : "Choose an image file.",
      }),
    );
    setPhotoUploads(uploads);
    setPhotoUploadError("");
    setIsUploadingPhotos(true);
    let acceptedUploads = 0;

    for (const upload of uploads) {
      if (upload.status === "failed") continue;
      let photoId: string | null = null;
      let uploadCompleted = false;
      let completionAttempted = false;
      try {
        const capability = await createPhotoUpload(galleryId, upload.file);
        photoId = capability.photo.id;
        setPhotoUploads((current) =>
          current.map((item) =>
            item.id === upload.id
              ? { ...item, photoId: capability.photo.id, status: "uploading" }
              : item,
          ),
        );
        await uploadPhotoFile(capability.upload, upload.file, (progress) => {
          setPhotoUploads((current) =>
            current.map((item) =>
              item.id === upload.id ? { ...item, progress } : item,
            ),
          );
        });
        setPhotoUploads((current) =>
          current.map((item) =>
            item.id === upload.id ? { ...item, status: "processing" } : item,
          ),
        );
        completionAttempted = true;
        await completePhotoUpload(capability.photo.id);
        uploadCompleted = true;
        acceptedUploads += 1;
        const processingStatus = await waitForPhotoProcessing(
          capability.photo.id,
        );
        if (processingStatus === "failed") {
          await deletePhoto(capability.photo.id);
          setPhotoUploads((current) =>
            current.map((item) =>
              item.id === upload.id
                ? {
                    ...item,
                    status: "failed",
                    error:
                      "Photo processing failed. The incomplete photo was removed; try uploading it again.",
                  }
                : item,
            ),
          );
        } else if (processingStatus === "active") {
          setPhotoUploads((current) =>
            current.map((item) =>
              item.id === upload.id
                ? { ...item, status: "complete", progress: 100 }
                : item,
            ),
          );
        } else {
          setPhotoUploads((current) =>
            current.map((item) =>
              item.id === upload.id
                ? {
                    ...item,
                    status: "processing",
                    error:
                      "Upload received; processing is taking longer than expected. Refresh the gallery shortly.",
                  }
                : item,
            ),
          );
        }
      } catch (caughtError) {
        let errorMessage =
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to upload this photo.";
        let recovered = false;
        if (photoId && completionAttempted) {
          // A lost completion response is not proof that the server rejected the photo.
          try {
            recovered =
              (await getStudioPhotoStatus(photoId)).status === "active";
          } catch {
            /* Keep the upload for explicit reconciliation. */
          }
          if (recovered && !uploadCompleted) acceptedUploads += 1;
        }
        if (photoId && !completionAttempted) {
          try {
            await deletePhoto(photoId);
          } catch (cleanupError) {
            const cleanupMessage =
              cleanupError instanceof Error
                ? cleanupError.message
                : "Unable to clean up the failed upload.";
            errorMessage = `${errorMessage} The incomplete photo could not be removed: ${cleanupMessage}`;
          }
        }
        setPhotoUploads((current) =>
          current.map((item) =>
            item.id === upload.id
              ? {
                  ...item,
                  status: recovered
                    ? "complete"
                    : completionAttempted
                      ? "processing"
                      : "failed",
                  progress: recovered ? 100 : item.progress,
                  error: recovered
                    ? undefined
                    : completionAttempted
                      ? `Upload confirmation was interrupted. Check this upload before choosing the file again. ${errorMessage}`
                      : errorMessage,
                }
              : item,
          ),
        );
      }
    }

    try {
      const photoSummary = await listGalleryPhotos(galleryId, 1, 1);
      const lastPage =
        acceptedUploads > 0
          ? Math.max(1, Math.ceil(photoSummary.total / 20))
          : 1;
      const refreshedPhotos = await listGalleryPhotos(galleryId, lastPage, 20);
      setPhotos(refreshedPhotos.items);
    } catch (caughtError) {
      setPhotoUploadError(
        caughtError instanceof Error
          ? caughtError.message
          : "Photos uploaded but the gallery could not be refreshed.",
      );
    } finally {
      setIsUploadingPhotos(false);
      uploadLock.current = false;
    }
  };

  const checkUpload = async (upload: PhotoUploadItem) => {
    if (!galleryId || !upload.photoId || checkingUploadId || isUploadingPhotos)
      return;
    setCheckingUploadId(upload.id);
    try {
      let status = (await getStudioPhotoStatus(upload.photoId)).status;
      if (status !== "active" && status !== "failed") {
        // This endpoint is idempotent: retry confirmation, never the original upload.
        await completePhotoUpload(upload.photoId);
        status = (await getStudioPhotoStatus(upload.photoId)).status;
      }
      if (status === "failed") await deletePhoto(upload.photoId);
      setPhotoUploads((current) =>
        current.map((item) =>
          item.id === upload.id
            ? {
                ...item,
                status:
                  status === "active"
                    ? "complete"
                    : status === "failed"
                      ? "failed"
                      : "processing",
                progress: status === "active" ? 100 : item.progress,
                error:
                  status === "active"
                    ? undefined
                    : status === "failed"
                      ? "Processing failed. The incomplete photo was removed; choose the file again."
                      : "Still preparing this photograph. Check again shortly.",
              }
            : item,
        ),
      );
      setPhotos((await listGalleryPhotos(galleryId, 1, 20)).items);
    } catch (caught) {
      setPhotoUploads((current) =>
        current.map((item) =>
          item.id === upload.id
            ? {
                ...item,
                error:
                  caught instanceof Error
                    ? caught.message
                    : "Unable to check this upload. Try again.",
              }
            : item,
        ),
      );
    } finally {
      setCheckingUploadId(null);
    }
  };

  const handlePublish = async () => {
    if (
      !galleryId ||
      !gallery ||
      publishLock.current ||
      waitingForPhotos ||
      !hasActiveAccess
    )
      return;
    publishLock.current = true;
    setIsPublishing(true);
    setPublishError("");
    try {
      const updated = await publishGallery(galleryId);
      setGallery((current) => ({ ...current, ...updated }));
    } catch (caught) {
      setPublishError(
        caught instanceof Error
          ? caught.message
          : "Unable to publish. Your draft and access credentials are still here.",
      );
    } finally {
      setIsPublishing(false);
      publishLock.current = false;
    }
  };

  const handlePrepareDelivery = async () => {
    if (!galleryId || isProcessingDelivery) return;
    setIsProcessingDelivery(true);
    setError("");
    try {
      setDelivery(await prepareStudioDelivery(galleryId));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to prepare delivery.",
      );
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
      setError(
        err instanceof Error ? err.message : "Failed to release delivery.",
      );
    } finally {
      setIsProcessingDelivery(false);
    }
  };

  const retryLoad = useRetryableLoad(
    useCallback(
      async (isCurrent: () => boolean) => {
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
          if (!isCurrent()) return;
          if (!me?.user) {
            navigate("/photographer/login", { replace: true });
            return;
          }

          const [
            galleryResponse,
            photoResponse,
            selectionResponse,
            feedbackResponse,
            deliveryResponse,
            accessResult,
          ] = await Promise.all([
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
          if (!isCurrent()) return;
          setGallery(galleryResponse as GalleryDetail);
          setPhotos(photoResponse.items ?? []);
          setSelection(selectionResponse);
          setFeedback(feedbackResponse);
          setDelivery(deliveryResponse);
          if ("items" in accessResult) {
            const now = Date.now();
            setHasActiveAccess(
              accessResult.items.some(
                (access) =>
                  !access.revokedAt &&
                  (!access.expiresAt || Date.parse(access.expiresAt) > now),
              ),
            );
            setAccessStatus("available");
          } else if (
            accessResult.error instanceof ApiError &&
            accessResult.error.status === 403
          ) {
            setAccessStatus("forbidden");
          } else {
            setAccessStatus("error");
            setAccessError(
              accessResult.error instanceof Error
                ? accessResult.error.message
                : "Unable to check current client access.",
            );
          }
        } catch (caughtError) {
          if (!isCurrent()) return;
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Unable to load gallery.",
          );
        }
      },
      [galleryId, navigate],
    ),
  );

  const handleAccessGrant = async () => {
    if (
      !galleryId ||
      !gallery ||
      isIssuingAccess ||
      isPublishing ||
      isUploadingPhotos
    )
      return;

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
      if (
        caughtError instanceof ApiError &&
        caughtError.status === 409 &&
        caughtError.code === "INVALID_GALLERY_ACCESS"
      ) {
        setHasActiveAccess(true);
        setError("");
        return;
      }
      if (
        caughtError instanceof ApiError &&
        caughtError.status === 404 &&
        caughtError.code === "INVALID_GALLERY_ACCESS"
      ) {
        setHasActiveAccess(false);
        setAccessCredentials(null);
        setError(
          "The previous access grant is no longer active. Issue a new link.",
        );
        return;
      }
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : hasActiveAccess
            ? "Unable to regenerate gallery access."
            : "Unable to create gallery access.",
      );
    } finally {
      setIsIssuingAccess(false);
    }
  };

  const copyAccessValue = async (value: string, label: string) => {
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("Clipboard access is unavailable.");
      await navigator.clipboard.writeText(value);
      setAccessCopyStatus(`${label} copied.`);
    } catch {
      setAccessCopyStatus(
        `Copy isn’t available here. Select the ${label.toLowerCase()} above and copy it manually.`,
      );
    }
  };

  if (!galleryId) return <Navigate to="/photographer/galleries" replace />;

  if (!gallery)
    return (
      <main className="page-shell">
        <section className="panel workflow-state">
          <h1>
            {error
              ? "Your gallery couldn’t be loaded."
              : "Loading your gallery…"}
          </h1>
          {error ? (
            <>
              <p className="error-box" role="alert">
                {error}
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
            <output>Checking your photographs and client access.</output>
          )}
          <Link className="secondary-button" to="/photographer/galleries">
            Back to galleries
          </Link>
        </section>
      </main>
    );

  const selectedPhoto =
    selectedPhotoIndex === null
      ? null
      : (selection[selectedPhotoIndex] ?? null);
  const clientAccessUrl = accessCredentials
    ? `${window.location.origin}/client/access?galleryId=${encodeURIComponent(galleryId)}#secret=${encodeURIComponent(accessCredentials.secretToken)}`
    : "";

  return (
    <main className="page-shell">
      {searchParams.get("created") === "1" && !hasActiveAccess ? (
        <section className="gallery-setup-banner" aria-label="Gallery created">
          <p className="eyebrow">
            01 Created / 02 Photographs / 03 Access / 04 Publish
          </p>
          <h2>Your gallery is created.</h2>
          <p>
            Next, add your photographs. No client access has been issued by
            creating this draft.
          </p>
          <a className="primary-button" href="#photo-upload">
            Add photographs ↓
          </a>
        </section>
      ) : null}
      <div className="panel">
        <div className="panel-header compact-header">
          <div>
            <p className="eyebrow">Gallery workspace</p>
            <h1>{String(gallery?.name ?? "Loading gallery…")}</h1>
          </div>
          <button
            type="button"
            className="secondary-button"
            disabled={
              isUploadingPhotos || isPublishing || Boolean(checkingUploadId)
            }
            onClick={() => navigate("/photographer/galleries")}
          >
            Back to galleries
          </button>
        </div>

        <section
          id="photo-upload"
          className="photo-upload panel"
          aria-labelledby="photo-upload-heading"
        >
          <div className="panel-header compact-header">
            <div>
              <p className="eyebrow">Gallery photos</p>
              <h2 id="photo-upload-heading" tabIndex={-1}>
                Add photographs
              </h2>
              <p className="muted">
                Choose image files to add to this gallery. They’ll appear here
                as each upload finishes processing.
              </p>
            </div>
          </div>
          <label className="field photo-upload-picker">
            <span>Select photos to upload</span>
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={isUploadingPhotos || isPublishing}
              onChange={(event) => {
                void handlePhotoFiles(event.currentTarget.files);
                event.currentTarget.value = "";
              }}
            />
          </label>
          {photoUploadError ? (
            <div className="error-box" role="alert">
              {photoUploadError}
            </div>
          ) : null}
          {photoUploads.length ? (
            <ul className="list-stack photo-upload-list" aria-live="polite">
              {photoUploads.map((upload) => (
                <li className="list-row photo-upload-row" key={upload.id}>
                  <div className="photo-upload-details">
                    <strong>{upload.file.name}</strong>
                    <small>
                      {upload.status === "queued" ? "Waiting to upload" : null}
                      {upload.status === "uploading"
                        ? `Uploading · ${upload.progress}%`
                        : null}
                      {upload.status === "processing"
                        ? (upload.error ?? "Upload received · preparing photo")
                        : null}
                      {upload.status === "complete" ? "Upload complete" : null}
                      {upload.status === "failed" ? upload.error : null}
                    </small>
                    {upload.status === "uploading" ? (
                      <progress
                        value={upload.progress}
                        max={100}
                        aria-label={`Uploading ${upload.file.name}`}
                      />
                    ) : null}
                  </div>
                  {upload.status === "processing" && !isUploadingPhotos ? (
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={Boolean(checkingUploadId)}
                      onClick={() => void checkUpload(upload)}
                    >
                      {checkingUploadId === upload.id
                        ? "Checking…"
                        : "Check upload"}
                    </button>
                  ) : null}
                  <span
                    className={`tag photo-upload-status status-${upload.status}`}
                  >
                    {upload.status === "complete"
                      ? "Complete"
                      : upload.status === "failed"
                        ? "Failed"
                        : upload.status === "processing"
                          ? "Processing"
                          : upload.status === "uploading"
                            ? "Uploading"
                            : "Queued"}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
        <StudioPhotoList photos={photos} />

        {accessStatus === "loading" ? (
          <p className="muted">Checking client access…</p>
        ) : null}
        {accessStatus === "forbidden" ? (
          <p className="muted">
            You do not have permission to manage client access for this gallery.
          </p>
        ) : null}
        {accessStatus === "error" ? (
          <div className="error-box">{accessError}</div>
        ) : null}
        {accessStatus === "available" ? (
          <section
            className="gallery-access-setup"
            aria-label="Prepare client access"
          >
            <h2>Prepare client access</h2>
            <p className="muted">
              Choose what your client can do. The link opens only after you
              publish the gallery.
            </p>
            <div className="toolbar-stack">
              <label className="field compact-field">
                <span>What the client can do</span>
                <select
                  value={permission}
                  onChange={(event) =>
                    setPermission(
                      event.target.value as "view" | "view_download",
                    )
                  }
                >
                  <option value="view">View</option>
                  <option value="view_download">View + download</option>
                </select>
              </label>
              <button
                type="button"
                className="primary-button"
                disabled={isIssuingAccess || isUploadingPhotos || isPublishing}
                onClick={handleAccessGrant}
              >
                {isIssuingAccess
                  ? hasActiveAccess
                    ? "Creating new link…"
                    : "Issuing…"
                  : hasActiveAccess
                    ? "Create new share link"
                    : "Issue access link"}
              </button>
            </div>
          </section>
        ) : null}
        {hasActiveAccess ? (
          <p className="muted">
            Creating a new link replaces the current link and PIN and ends
            existing client sessions. Saved client feedback and selections will
            remain. New credentials are shown only once.
          </p>
        ) : null}

        {accessCredentials ? (
          <section
            className="panel access-credentials-panel"
            aria-live="polite"
          >
            <div className="panel-header">
              <div>
                <p className="eyebrow">Share with client</p>
                <h2>Access issued</h2>
                <p className="muted">
                  Send the link and PIN separately. This PIN is shown only in
                  this response.
                </p>
              </div>
            </div>
            <label className="field access-credential-field">
              <span>Client access link</span>
              <span className="access-credential-control">
                <input
                  readOnly
                  value={clientAccessUrl}
                  onFocus={(event) => event.currentTarget.select()}
                  aria-label="Client access link"
                />
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void copyAccessValue(clientAccessUrl, "Link")}
                >
                  Copy link
                </button>
              </span>
            </label>
            <label className="field access-credential-field">
              <span>Six-digit PIN — send separately</span>
              <span className="access-credential-control">
                <input
                  readOnly
                  value={accessCredentials.pin}
                  onFocus={(event) => event.currentTarget.select()}
                  aria-label="Six-digit gallery PIN"
                />
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    void copyAccessValue(accessCredentials.pin, "PIN")
                  }
                >
                  Copy PIN
                </button>
              </span>
            </label>
            {accessCopyStatus ? (
              <output className="muted" aria-live="polite">
                {accessCopyStatus}
              </output>
            ) : null}
            {gallery?.publicationStatus !== "published" ? (
              <p className="muted">
                Clients can open this link only after the gallery is published.
              </p>
            ) : null}
            <p className="muted">
              For privacy, send this link and PIN in separate messages. Keep
              this screen open until you’ve shared both.
            </p>
          </section>
        ) : null}

        <GalleryPublicationPanel
          published={gallery.publicationStatus === "published"}
          hasPhotos={photos.some((photo) => photo.status === "active")}
          hasAccess={hasActiveAccess && accessStatus === "available"}
          busy={isPublishing || isIssuingAccess}
          waitingForPhotos={waitingForPhotos}
          error={publishError}
          onPublish={() => void handlePublish()}
        />

        {error ? <div className="error-box">{error}</div> : null}

        {gallery?.selectionStatus === "submitted" ? (
          <StudioSelectionReview
            submittedAt={gallery.selectionSubmittedAt}
            selection={selection}
            onSelect={setSelectedPhotoIndex}
          />
        ) : null}

        {gallery.selectionStatus === "submitted" || delivery ? (
          <StudioDeliverySection
            delivery={delivery}
            isProcessing={isProcessingDelivery}
            onPrepare={() => void handlePrepareDelivery()}
            onRelease={() => void handleReleaseDelivery()}
          />
        ) : null}

        {feedback.length > 0 ? (
          <StudioFeedbackReview feedback={feedback} />
        ) : null}

        {selectedPhoto ? (
          <StudioPhotoViewerModal
            key={selectedPhoto.photoId}
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
                        reviewedAt: updated.reviewedAt,
                      }
                    : item,
                ),
              );
            }}
          />
        ) : null}
      </div>
    </main>
  );
}
