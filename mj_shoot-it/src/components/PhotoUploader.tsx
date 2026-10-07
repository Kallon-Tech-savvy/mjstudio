import { useRef, useState, type DragEvent } from "react";

import { ACCEPT_ATTR, usePhotoUploads, type UploadItem } from "@/hooks/usePhotoUploads";
import "../styles/GalleryDetails.css";

type Props = {
  galleryId: string;
  onPhotoReady: () => void;
};

function statusLabel(item: UploadItem): string {
  switch (item.status) {
    case "queued":
      return "Waiting";
    case "uploading":
      return `${Math.round(item.progress * 100)}%`;
    case "processing":
      return "Preparing previews…";
    case "done":
      return "Added";
    case "error":
      return item.error ?? "Failed";
  }
}

export default function PhotoUploader({ galleryId, onPhotoReady }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);

  const { items, rejected, addFiles, remove, retry, retryAllFailed, clearRejected, isBusy, failedCount, overall } =
    usePhotoUploads(galleryId, onPhotoReady);

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files);
  };

  return (
    <section className="gd-uploader" aria-label="Add photos">
      <div
        className={`gd-drop ${dragging ? "is-dragging" : ""}`}
        onDragEnter={(e) => {
          e.preventDefault();
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => {
          dragDepth.current -= 1;
          if (dragDepth.current <= 0) setDragging(false);
        }}
        onDrop={onDrop}
      >
        <div className="gd-drop-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6">
            <rect x="3" y="5" width="18" height="14" rx="2.5" />
            <circle cx="9" cy="10.5" r="1.6" />
            <path d="m4 17 5-4.5 3.5 3 3-2.5L20 17" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="gd-drop-copy">
          <strong>{dragging ? "Release to add these frames" : "Drop photos here"}</strong>
          <span>JPEG, PNG, WebP, HEIC or TIFF · up to 50 MB each · many at once</span>
        </div>
        <button type="button" className="gd-btn gd-btn-primary" onClick={() => inputRef.current?.click()}>
          Choose photos
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          hidden
          onChange={(event) => {
            if (event.target.files) addFiles(event.target.files);
            event.target.value = ""; // allow re-selecting the same file after removal
          }}
        />
      </div>

      {rejected.length > 0 && (
        <div className="gd-alert gd-alert-warn" role="alert">
          <div>
            <strong>{rejected.length} file{rejected.length > 1 ? "s" : ""} skipped</strong>
            <ul>
              {rejected.slice(0, 4).map((line) => (
                <li key={line}>{line}</li>
              ))}
              {rejected.length > 4 && <li>…and {rejected.length - 4} more</li>}
            </ul>
          </div>
          <button type="button" className="gd-link-btn" onClick={clearRejected}>
            Dismiss
          </button>
        </div>
      )}

      {items.length > 0 && (
        <div className="gd-queue" aria-live="polite">
          <div className="gd-queue-head">
            <div>
              <strong>{isBusy ? "Importing…" : failedCount ? "Some photos need attention" : "All done"}</strong>
              <span>
                {items.filter((i) => i.status === "done").length} of {items.length} added
              </span>
            </div>
            {failedCount > 0 && (
              <button type="button" className="gd-btn gd-btn-ghost" onClick={retryAllFailed}>
                Retry {failedCount} failed
              </button>
            )}
          </div>
          <div className="gd-meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(overall * 100)}>
            <span style={{ width: `${Math.round(overall * 100)}%` }} />
          </div>

          <ul className="gd-tiles">
            {items.map((item) => (
              <li key={item.id} className={`gd-tile is-${item.status}`}>
                <img src={item.previewUrl} alt="" loading="lazy" />
                <div className="gd-tile-shade" />
                <div className="gd-tile-body">
                  <span className="gd-tile-name" title={item.file.name}>
                    {item.file.name}
                  </span>
                  <span className="gd-tile-status">{statusLabel(item)}</span>
                </div>
                {(item.status === "uploading" || item.status === "queued") && (
                  <div className="gd-tile-bar">
                    <span style={{ width: `${Math.round(item.progress * 100)}%` }} />
                  </div>
                )}
                {item.status === "processing" && <div className="gd-tile-bar is-indeterminate" />}
                <div className="gd-tile-actions">
                  {item.status === "error" && (
                    <button type="button" onClick={() => retry(item.id)} aria-label={`Retry ${item.file.name}`}>
                      Retry
                    </button>
                  )}
                  {item.status !== "done" && (
                    <button type="button" onClick={() => remove(item.id)} aria-label={`Remove ${item.file.name} from queue`}>
                      ✕
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}