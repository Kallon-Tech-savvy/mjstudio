import type { StudioDeliveryDetails, StudioFeedback, StudioSelectedPhoto } from "@/lib/api";

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
    <section className="studio-selection-review">
      <div className="panel-header compact-header">
        <div>
          <p className="eyebrow">Client decision</p>
          <h2>{selection.length} photographs selected</h2>
          <p className="muted">
            Received{submittedAt ? ` · ${new Date(submittedAt).toLocaleString()}` : ""}.
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
              onClick={() => onSelect(index)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(index);
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
  );
}

export function StudioDeliverySection({
  delivery,
  isProcessing,
  onPrepare,
  onRelease,
}: {
  delivery: StudioDeliveryDetails | null;
  isProcessing: boolean;
  onPrepare: () => void;
  onRelease: () => void;
}) {
  return (
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
            <button type="button" className="primary-button" disabled={isProcessing} onClick={onPrepare}>
              {isProcessing ? "Preparing..." : "1. Prepare Final Delivery Assets"}
            </button>
            {delivery.status === "ready" || delivery.items.length ? (
              <button type="button" className="primary-button" style={{ background: "#137333" }} disabled={isProcessing} onClick={onRelease}>
                {isProcessing ? "2. Explicitly Release to Client" : "Release Delivery"}
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
  );
}

export function StudioFeedbackReview({ feedback }: { feedback: StudioFeedback[] }) {
  if (feedback.length === 0) return null;

  return (
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
  );
}

export function StudioPhotoList({ photos }: { photos: import("@/lib/api").PhotoRecord[] }) {
  return (
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
  );
}
