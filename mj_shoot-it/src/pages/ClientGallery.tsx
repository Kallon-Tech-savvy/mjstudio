import { useEffect, useState} from "react";
import { useParams, Navigate, Link } from "react-router-dom";

import {
  createDownload,
  createGalleryFeedback,
  createPhotoFeedback,
  getClientGallery,
  listClientPhotos,
  setSelection,
  type PhotoRecord,
} from "@/lib/api";

function ClientGalleryPage() {
  const { galleryId } = useParams();
  const [galleryName, setGalleryName] = useState("Gallery");
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      if (!galleryId) {
        return;
      }
      try {
        const [gallery, photoResponse] = await Promise.all([
          getClientGallery(galleryId),
          listClientPhotos(galleryId, 1, 20),
        ]);

        setGalleryName(String(gallery.name ?? "Gallery"));
        setPhotos(photoResponse.items ?? []);
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "Unable to load gallery.");
      }
    };

    void load();
  }, [galleryId]);

  const handleSelection = async (photoId: string, selection: "neutral" | "favourite" | "not_for_me") => {
    if (!galleryId) {
      return;
    }

    try {
      await setSelection(galleryId, photoId, selection);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Your selection could not be saved.");
    }
  };

  const handleDownload = async (photoId: string) => {
    if (!galleryId) {
      return;
    }

    try {
      const result = await createDownload(galleryId, photoId);
      if (!result.download_url) {
        throw new Error("No downloadable file was returned.");
      }
      window.open(result.download_url, "_blank", "noopener,noreferrer");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "This download is not available.");
    }
  };

  const handleGalleryFeedback = async () => {
    if (!galleryId) {
      return;
    }

    try {
      await createGalleryFeedback(galleryId, feedback);
      setFeedback("");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Your feedback could not be submitted.");
    }
  };

  const handlePhotoFeedback = async (photoId: string, message: string) => {
    if (!galleryId) {
      return;
    }

    try {
      await createPhotoFeedback(galleryId, photoId, message);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Photo feedback could not be submitted.");
    }
  };

  if (!galleryId) {
    return <Navigate to="/client/access" replace />;
  }

  return (
    <main className="page-shell">
      <div className="panel">
        <div className="panel-header compact-header">
          <div>
            <p className="eyebrow">Client gallery</p>
            <h1>{galleryName}</h1>
          </div>
          <Link to="/client/access" className="secondary-button">
            Back to access
          </Link>
        </div>

        <div className="toolbar-stack">
          <textarea className="textarea" value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Write gallery feedback" />
          <button type="button" className="primary-button" onClick={handleGalleryFeedback} disabled={!feedback.trim()}>
            Submit gallery feedback
          </button>
        </div>

        {error ? <div className="error-box">{error}</div> : null}

        <div className="photo-grid">
          {photos.length === 0 ? (
            <div className="empty-state">No photos are visible in this gallery yet.</div>
          ) : (
            photos.map((photo) => (
              <article key={photo.photoId} className="photo-card panel">
                <div className="photo-thumb">{photo.filename}</div>
                <div className="photo-meta">
                  <strong>{photo.filename}</strong>
                  <small>{photo.status ?? "visible"}</small>
                </div>
                <div className="selection-actions">
                  <button type="button" className="secondary-button" onClick={() => handleSelection(photo.photoId, "favourite")}>
                    Favourite
                  </button>
                  <button type="button" className="button-ghost" onClick={() => handleSelection(photo.photoId, "not_for_me")}>
                    Skip
                  </button>
                  <button type="button" className="primary-button" onClick={() => handleDownload(photo.photoId)}>
                    Download
                  </button>
                </div>
                <div className="feedback-inline">
                  <button type="button" className="button-ghost" onClick={() => handlePhotoFeedback(photo.photoId, "I like this one.")}>
                    Like
                  </button>
                  <button type="button" className="button-ghost" onClick={() => handlePhotoFeedback(photo.photoId, "This image needs a revision.")}>
                    Request revision
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </main>
  );
}

export default ClientGalleryPage;