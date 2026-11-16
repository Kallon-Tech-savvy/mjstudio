import type {
  StudioDeliveryDetails,
  StudioFeedback,
  StudioSelectedPhoto,
} from "@/lib/api";

export function StudioSelectionReview({
  submittedAt,
  selection,
  onSelect,
}: {
  submittedAt?: string | null;
  selection: StudioSelectedPhoto[];
  onSelect: (index: number) => void;
}) {
  return (
    <section id="selection-review" className="studio-selection-review">
      <div className="panel-header compact-header">
        <div>
          <p className="eyebrow">Client decision</p>
          <h2>
            {selection.length}{" "}
            {selection.length === 1 ? "photograph" : "photographs"} selected
          </h2>
          <p className="muted">
            Received
            {submittedAt ? ` · ${new Date(submittedAt).toLocaleString()}` : ""}.
            Review these choices before preparing delivery.
          </p>
        </div>
        <span className="tag">Selection received</span>
      </div>

      {selection.length === 0 ? (
        <div className="empty-state">
          The client submitted an empty selection.
        </div>
      ) : (
        <div className="photo-grid studio-selection-grid">
          {selection.map((photo, index) => (
            <button
              type="button"
              key={photo.photoId}
              className="photo-card studio-selection-card"
              onClick={() => onSelect(index)}
              aria-label={`Inspect photograph ${photo.position + 1}`}
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
                  <span
                    className={`status-tag status-${photo.reviewStatus || "pending"}`}
                  >
                    {photo.reviewStatus === "approved"
                      ? "Approved"
                      : photo.reviewStatus === "needs_revision"
                        ? "Revision"
                        : "Pending"}
                  </span>
                </div>
                <small>{photo.filename}</small>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export function StudioDeliverySection({
  delivery,
  isProcessing,
  onPrepare,
  onRelease,
  error,
  checking,
  onRetry,
}: {
  error: string;
  checking: boolean;
  onRetry: () => void;
  delivery: StudioDeliveryDetails | null;
  isProcessing: boolean;
  onPrepare: () => void;
  onRelease: () => void;
}) {
  const prepared = Boolean(
    delivery?.canPrepare &&
      delivery.items.length === delivery.totalSelectedCount &&
      delivery.items.length > 0 &&
      delivery.items.every((item) => item.status === "ready"),
  );
  return (
    <section
      id="final-delivery"
      className="studio-delivery-section panel"
      aria-busy={checking || isProcessing}
    >
      <div className="panel-header compact-header">
        <div>
          <p className="eyebrow">Final delivery</p>
          <h2>
            {delivery?.releasedAt
              ? "Client delivery"
              : "Prepare the client’s photographs"}
          </h2>
          <p className="muted">
            {delivery
              ? `${delivery.approvedCount} of ${delivery.totalSelectedCount} selected photographs approved.`
              : "Delivery readiness has not been confirmed."}
          </p>
        </div>
        <span className={`tag status-${delivery?.status || "pending"}`}>
          {!delivery
            ? "Not confirmed"
            : delivery.releasedAt
              ? "Released"
              : prepared
                ? "Ready for release"
                : "Pending proofing"}
        </span>
      </div>

      <div className="studio-delivery-controls">
        {checking ? (
          <output>Checking delivery readiness…</output>
        ) : error ? (
          <div role="alert" className="error-box">
            <p>{error}</p>
            <button
              type="button"
              className="secondary-button"
              onClick={onRetry}
            >
              Check delivery again
            </button>
          </div>
        ) : delivery?.releasedAt ? (
          <div className="success-box delivery-success">
            <strong>Released to client</strong>
            <span>
              Available through the client gallery since{" "}
              {new Date(delivery.releasedAt).toLocaleString()}. This does not
              confirm that the client has downloaded them.
            </span>
          </div>
        ) : delivery?.canPrepare ? (
          <div className="studio-delivery-actions">
            <p className="muted">
              {prepared
                ? "Prepared photographs stay private until you release them. Downloads follow the client’s access permission."
                : "Preparation checks the approved originals. You will release them in a separate step."}
            </p>
            <button
              type="button"
              className="primary-button"
              disabled={isProcessing}
              onClick={prepared ? onRelease : onPrepare}
            >
              {isProcessing
                ? "Saving delivery…"
                : prepared
                  ? "Release to client"
                  : "Prepare final photographs"}
            </button>
          </div>
        ) : (
          <p className="muted">
            Approve each selected photograph in Proofing to prepare the final
            delivery.
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
              <span className="tag status-approved">
                {delivery.releasedAt
                  ? "Released"
                  : item.status === "ready"
                    ? "Prepared · private"
                    : item.status === "failed"
                      ? "Needs attention"
                      : "Preparing"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function StudioFeedbackReview({
  feedback,
}: {
  feedback: StudioFeedback[];
}) {
  if (feedback.length === 0) return null;

  return (
    <section className="studio-feedback-review">
      <div className="panel-header compact-header">
        <div>
          <p className="eyebrow">Client feedback</p>
          <h2>Notes from the client</h2>
          <p className="muted">
            Review these notes alongside the selected photographs before
            delivery.
          </p>
        </div>
        <span className="tag">{feedback.length}</span>
      </div>
      <ul className="list-stack">
        {feedback.map((item) => (
          <li key={item.id} className="list-row">
            <div>
              <strong>
                {item.feedbackType === "photo"
                  ? `Photograph ${Number(item.position ?? 0) + 1}`
                  : "Gallery note"}
              </strong>
              <small>
                {item.filename ?? "Gallery-wide feedback"} ·{" "}
                {new Date(item.createdAt).toLocaleString()}
              </small>
            </div>
            <p>{item.message}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function StudioPhotoList({
  photos,
  busy = false,
  onCheck,
  onRemove,
}: {
  photos: import("@/lib/api").PhotoRecord[];
  busy?: boolean;
  onCheck?: (photo: import("@/lib/api").PhotoRecord) => void;
  onRemove?: (photo: import("@/lib/api").PhotoRecord) => void;
}) {
  return (
    <ul className="list-stack spaced-list">
      {photos.length === 0 ? (
        <li className="empty-state">
          No photos have been added to this gallery yet.
        </li>
      ) : (
        photos.map((photo) => (
          <li key={photo.photoId} className="list-row saved-photo-row">
            <div>
              <strong>{photo.filename}</strong>
              <small>
                {photo.status === "failed"
                  ? "This upload needs attention. Remove it only if you want to choose the file again."
                  : photo.status === "processing"
                    ? "Preparing photograph"
                    : photo.status && photo.status !== "active"
                      ? "Upload needs checking"
                      : "Ready"}
              </small>
            </div>
            {photo.status === "failed" && onRemove ? (
              <button
                className="secondary-button"
                type="button"
                disabled={busy}
                onClick={() => onRemove(photo)}
              >
                Remove incomplete upload
              </button>
            ) : photo.status && photo.status !== "active" && onCheck ? (
              <button
                className="secondary-button"
                type="button"
                disabled={busy}
                onClick={() => onCheck(photo)}
              >
                Check upload
              </button>
            ) : null}
          </li>
        ))
      )}
    </ul>
  );
}
