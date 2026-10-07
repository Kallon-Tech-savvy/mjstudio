import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";

import PhotoUploader from "@/components/PhotoUploader";
import {
  type AccessRecord,
  type GalleryRecord,
  type PhotoRecord,
  createGalleryAccess,
  deletePhoto,
  getGallery,
  getPhotographerMe,
  listGalleryAccess,
  listGalleryPhotos,
  publishGallery,
  resetGalleryAccess,
  revokeGalleryAccess,
} from "@/lib/api";
import "../styles/GalleryDetails.css";

const PAGE_SIZE = 60;
type Permission = "view" | "view_download";
type Secret = { accessKey?: string; pin?: string };

function formatDate(value?: string | null): string {
  if (!value) return "No expiry";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function thumbnailOf(photo: PhotoRecord): string | undefined {
  const candidate = photo.thumbnailUrl ?? photo.previewUrl ?? photo.url;
  return typeof candidate === "string" ? candidate : undefined;
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked: the value stays selectable */
    }
  };
  return (
    <div className="gd-copy">
      <span>{label}</span>
      <code>{value}</code>
      <button type="button" className="gd-link-btn" onClick={copy}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function GalleryDetail() {
  const { galleryId } = useParams();
  const navigate = useNavigate();

  const [gallery, setGallery] = useState<GalleryRecord | null>(null);
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  const [access, setAccess] = useState<AccessRecord | null>(null);
  const [permission, setPermission] = useState<Permission>("view_download");
  const [secret, setSecret] = useState<Secret | null>(null);
  const [busy, setBusy] = useState<"" | "access" | "publish">("");
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);

  const photosRef = useRef<PhotoRecord[]>([]);
  photosRef.current = photos;

  const mergeFresh = useCallback((fresh: PhotoRecord[]) => {
    setPhotos((current) => {
      const byId = new Map(fresh.map((p) => [p.photoId, p]));
      const known = new Set(current.map((p) => p.photoId));
      const added = fresh.filter((p) => !known.has(p.photoId));
      return [...added, ...current.map((p) => byId.get(p.photoId) ?? p)];
    });
  }, []);

  /** Pulls the first page and folds it into what is already on screen (no scroll jump). */
  const refreshPhotos = useCallback(async () => {
    if (!galleryId) return;
    try {
      const response = await listGalleryPhotos(galleryId, 1, PAGE_SIZE);
      mergeFresh(response.items);
      setTotal(response.total);
    } catch {
      /* a failed background refresh should not replace the page with an error */
    }
  }, [galleryId, mergeFresh]);

  useEffect(() => {
    if (!galleryId) return;
    let cancelled = false;
    (async () => {
      try {
        const me = await getPhotographerMe();
        if (!me?.user) {
          navigate("/photographer/login", { replace: true });
          return;
        }
        const [galleryResponse, photoResponse, accessList] = await Promise.all([
          getGallery(galleryId),
          listGalleryPhotos(galleryId, 1, PAGE_SIZE),
          listGalleryAccess(galleryId).catch(() => [] as AccessRecord[]),
        ]);
        if (cancelled) return;
        setGallery(galleryResponse);
        setPhotos(photoResponse.items);
        setTotal(photoResponse.total);
        const current = accessList.find((entry) => !entry.revokedAt && !entry.revoked_at) ?? null;
        setAccess(current);
        if (current && (current.permission === "view" || current.permission === "view_download")) {
          setPermission(current.permission);
        }
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Unable to load gallery.");
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [galleryId, navigate]);

  // While any photo is still being processed, check back quietly.
  const hasProcessing = photos.some((p) => p.status === "processing");
  useEffect(() => {
    if (!hasProcessing) return;
    const timer = window.setInterval(() => void refreshPhotos(), 3500);
    return () => window.clearInterval(timer);
  }, [hasProcessing, refreshPhotos]);

  const loadMore = async () => {
    if (!galleryId) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const response = await listGalleryPhotos(galleryId, next, PAGE_SIZE);
      setPhotos((current) => {
        const known = new Set(current.map((p) => p.photoId));
        return [...current, ...response.items.filter((p) => !known.has(p.photoId))];
      });
      setTotal(response.total);
      setPage(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load more photos.");
    } finally {
      setLoadingMore(false);
    }
  };

  const handleRemove = async (photoId: string) => {
    setConfirmingRemove(null);
    const before = photosRef.current;
    setPhotos(before.filter((p) => p.photoId !== photoId)); // optimistic
    setTotal((t) => Math.max(0, t - 1));
    try {
      await deletePhoto(photoId);
    } catch (caught) {
      setPhotos(before);
      setTotal((t) => t + 1);
      setError(caught instanceof Error ? caught.message : "Unable to remove photo.");
    }
  };

  const handleIssueAccess = async () => {
    if (!galleryId) return;
    setBusy("access");
    setError("");
    try {
      // One live access per gallery: first issue creates it, afterwards we reset it.
      const result = access
        ? await resetGalleryAccess(galleryId, { permission, expiresAt: null })
        : await createGalleryAccess(galleryId, { permission, expiresAt: null });
      setSecret({
        accessKey: typeof result.accessKey === "string" ? result.accessKey : undefined,
        pin: typeof result.pin === "string" ? result.pin : undefined,
      });
      setAccess({ permission, expiresAt: null });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update access.");
    } finally {
      setBusy("");
    }
  };

  const handleRevoke = async () => {
    if (!galleryId) return;
    setBusy("access");
    try {
      await revokeGalleryAccess(galleryId);
      setAccess(null);
      setSecret(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to revoke access.");
    } finally {
      setBusy("");
    }
  };

  const handlePublish = async () => {
    if (!galleryId) return;
    setBusy("publish");
    setError("");
    try {
      setGallery(await publishGallery(galleryId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to publish gallery.");
    } finally {
      setBusy("");
    }
  };

  if (!galleryId) return <Navigate to="/photographer/galleries" replace />;

  const publication = String(gallery?.publicationStatus ?? "unpublished");
  const workflow = String(gallery?.workflowStatus ?? gallery?.status ?? "draft");
  const activeCount = photos.filter((p) => p.status === "active").length;
  const canPublish = publication !== "published" && activeCount > 0 && !!access;

  return (
    <main className="gd-page">
      <div className="gd-shell">
        <header className="gd-header">
          <div>
            <p className="gd-eyebrow">Gallery</p>
            <h1>{gallery?.name ?? (ready ? "Gallery" : "Loading…")}</h1>
            <div className="gd-badges">
              <span className="gd-badge">{workflow}</span>
              <span className={`gd-badge ${publication === "published" ? "gd-badge-live" : ""}`}>{publication}</span>
              <span className="gd-badge gd-badge-quiet">{total} photo{total === 1 ? "" : "s"}</span>
            </div>
          </div>
          <Link to="/photographer/galleries" className="gd-btn gd-btn-ghost">
            Back to galleries
          </Link>
        </header>

        {error && (
          <div className="gd-alert gd-alert-error" role="alert">
            <span>{error}</span>
            <button type="button" className="gd-link-btn" onClick={() => setError("")}>
              Dismiss
            </button>
          </div>
        )}

        <div className="gd-layout">
          <div className="gd-main">
            <PhotoUploader galleryId={galleryId} onPhotoReady={refreshPhotos} />

            <section className="gd-card">
              <div className="gd-card-head">
                <h2>Photos</h2>
                {hasProcessing && <span className="gd-hint">Preparing previews…</span>}
              </div>

              {!ready ? (
                <p className="gd-empty">Loading…</p>
              ) : photos.length === 0 ? (
                <p className="gd-empty">No photos yet. Drop a batch above to begin.</p>
              ) : (
                <>
                  <ul className="gd-grid">
                    {photos.map((photo) => {
                      const src = thumbnailOf(photo);
                      return (
                        <li key={photo.photoId} className={`gd-photo is-${photo.status ?? "active"}`}>
                          {src ? (
                            <img src={src} alt={photo.filename} loading="lazy" />
                          ) : (
                            <div className="gd-photo-ph">{photo.status === "failed" ? "Failed" : "Processing"}</div>
                          )}
                          <div className="gd-photo-bar">
                            <span title={photo.filename}>{photo.filename}</span>
                            {confirmingRemove === photo.photoId ? (
                              <span className="gd-confirm">
                                <button type="button" onClick={() => handleRemove(photo.photoId)}>
                                  Remove
                                </button>
                                <button type="button" onClick={() => setConfirmingRemove(null)}>
                                  Keep
                                </button>
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="gd-photo-x"
                                aria-label={`Remove ${photo.filename}`}
                                onClick={() => setConfirmingRemove(photo.photoId)}
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {photos.length < total && (
                    <div className="gd-more">
                      <button type="button" className="gd-btn gd-btn-ghost" onClick={loadMore} disabled={loadingMore}>
                        {loadingMore ? "Loading…" : `Show more (${total - photos.length} left)`}
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          </div>

          <aside className="gd-side">
            <section className="gd-card">
              <h2>Client access</h2>
              <p className="gd-sub">
                {access
                  ? `Live · ${access.permission === "view_download" ? "view + download" : "view only"} · ${formatDate(access.expiresAt)}`
                  : "No access link yet. Clients can’t open this gallery."}
              </p>

              <label className="gd-field">
                <span>Permission</span>
                <select value={permission} onChange={(e) => setPermission(e.target.value as Permission)}>
                  <option value="view">View only</option>
                  <option value="view_download">View + download</option>
                </select>
              </label>

              <button type="button" className="gd-btn gd-btn-primary gd-block" onClick={handleIssueAccess} disabled={busy === "access"}>
                {busy === "access" ? "Working…" : access ? "Reset key & PIN" : "Create access link"}
              </button>
              {access && (
                <button type="button" className="gd-link-btn gd-danger" onClick={handleRevoke} disabled={busy === "access"}>
                  Revoke access
                </button>
              )}

              {secret && (secret.accessKey || secret.pin) && (
                <div className="gd-secret">
                  <p>Copy these now. Only a hash is stored, so they won’t be shown again.</p>
                  {secret.accessKey && <CopyField label="Key" value={secret.accessKey} />}
                  {secret.pin && <CopyField label="PIN" value={secret.pin} />}
                </div>
              )}
            </section>

            <section className="gd-card">
              <h2>Publish</h2>
              <p className="gd-sub">
                {publication === "published"
                  ? "This gallery is live for your client."
                  : "Add photos and create access, then publish when you’re ready."}
              </p>
              <ul className="gd-checks">
                <li className={activeCount > 0 ? "is-ok" : ""}>{activeCount > 0 ? `${activeCount} photos ready` : "At least one photo ready"}</li>
                <li className={access ? "is-ok" : ""}>Client access created</li>
              </ul>
              <button
                type="button"
                className="gd-btn gd-btn-primary gd-block"
                onClick={handlePublish}
                disabled={!canPublish || busy === "publish"}
              >
                {publication === "published" ? "Published" : busy === "publish" ? "Publishing…" : "Publish gallery"}
              </button>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

export default GalleryDetail;