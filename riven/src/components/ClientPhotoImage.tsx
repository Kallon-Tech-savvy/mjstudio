import { useEffect, useRef, useState } from "react";
import { getClientPhoto, type PhotoRepresentation } from "@/lib/api";

type Props = {
  galleryId: string;
  photoId: string;
  representation: PhotoRepresentation;
  variant: "preview" | "thumbnail";
  alt: string;
  loading?: "lazy" | "eager";
  insideButton?: boolean;
};

/** Mount with a gallery/photo/URL key so an old request cannot change a new image. */
export function ClientPhotoImage({
  galleryId,
  photoId,
  representation,
  variant,
  alt,
  loading,
  insideButton = false,
}: Props) {
  const [image, setImage] = useState(representation);
  const [status, setStatus] = useState<"ready" | "refreshing" | "failed">(
    "ready",
  );
  const attempted = useRef(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = async () => {
    if (pending.current) return;
    pending.current = true;
    attempted.current = true;
    setStatus("refreshing");
    try {
      const photo = await getClientPhoto(galleryId, photoId);
      const next = photo[variant];
      if (!next?.url) throw new Error("Image unavailable");
      if (mounted.current) {
        setImage(next);
        setStatus("ready");
      }
    } catch {
      if (mounted.current) setStatus("failed");
    } finally {
      pending.current = false;
    }
  };

  if (status === "refreshing")
    return (
      <output className="photo-image-status" aria-live="polite">
        Refreshing photograph…
      </output>
    );
  if (status === "failed")
    return (
      <span className="photo-image-status">
        <span role="alert">This photograph couldn’t be loaded.</span>
        {insideButton ? (
          <span>Open it to try the full preview.</span>
        ) : (
          <button
            type="button"
            className="button-ghost"
            onClick={() => void refresh()}
          >
            Retry photograph
          </button>
        )}
      </span>
    );
  return (
    <img
      src={image.url}
      alt={alt}
      width={image.width}
      height={image.height}
      loading={loading}
      decoding="async"
      onError={() => {
        if (attempted.current) setStatus("failed");
        else void refresh();
      }}
    />
  );
}
