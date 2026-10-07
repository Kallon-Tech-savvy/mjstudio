import { useCallback, useEffect, useRef, useState } from "react";

import { completePhotoUpload, createPhoto, type UploadTarget } from "@/lib/api";

export type UploadStatus = "queued" | "uploading" | "processing" | "done" | "error";

export type UploadItem = {
  id: string;
  file: File;
  mimeType: string;
  previewUrl: string;
  status: UploadStatus;
  progress: number; // 0..1
  error?: string;
};

const MAX_CONCURRENT = 3;
const MAX_BYTES = 50 * 1024 * 1024;
const DONE_LINGER_MS = 1600;

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  tif: "image/tiff",
  tiff: "image/tiff",
};
const ACCEPTED = new Set(Object.values(MIME_BY_EXT));

export const ACCEPT_ATTR = ".jpg,.jpeg,.png,.webp,.heic,.heif,.tif,.tiff,image/*";

function resolveMime(file: File): string {
  if (file.type && ACCEPTED.has(file.type)) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "";
}

function fingerprint(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function uploadBytes(
  target: UploadTarget,
  file: File,
  mimeType: string,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(target.method ?? "PUT", target.url);
    // Signed storage URLs are cross-origin and must not receive our cookies.
    xhr.withCredentials = !/^https?:\/\//i.test(target.url);
    const headers = target.headers ?? { "Content-Type": mimeType };
    for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Storage rejected the file (${xhr.status}).`));
    xhr.onerror = () => reject(new Error("Connection dropped during upload."));
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));

    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

export function usePhotoUploads(galleryId: string | undefined, onPhotoReady: () => void) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);

  const itemsRef = useRef<UploadItem[]>([]);
  const started = useRef(new Set<string>());
  const controllers = useRef(new Map<string, AbortController>());
  const galleryIdRef = useRef(galleryId);
  const onReadyRef = useRef(onPhotoReady);
  itemsRef.current = items;
  galleryIdRef.current = galleryId;
  onReadyRef.current = onPhotoReady;

  const patch = useCallback((id: string, changes: Partial<UploadItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }, []);

  const drop = useCallback((id: string) => {
    controllers.current.get(id)?.abort();
    controllers.current.delete(id);
    started.current.delete(id);
    setItems((current) => {
      const target = current.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  }, []);

  const run = useCallback(
    async (item: UploadItem) => {
      const gid = galleryIdRef.current;
      if (!gid) return;
      const controller = new AbortController();
      controllers.current.set(item.id, controller);
      patch(item.id, { status: "uploading", progress: 0, error: undefined });

      try {
        // 1. Register the photo, 2. send bytes straight to storage, 3. tell the server it landed.
        const created = await createPhoto(gid, { filename: item.file.name, mimeType: item.mimeType });
        if (!created.upload?.url) throw new Error("The server did not provide an upload location.");

        await uploadBytes(
          created.upload,
          item.file,
          item.mimeType,
          (fraction) => patch(item.id, { progress: fraction }),
          controller.signal,
        );

        patch(item.id, { status: "processing", progress: 1 });
        await completePhotoUpload(created.photoId);

        patch(item.id, { status: "done" });
        onReadyRef.current();
        window.setTimeout(() => drop(item.id), DONE_LINGER_MS);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        patch(item.id, {
          status: "error",
          error: caught instanceof Error ? caught.message : "Upload failed.",
        });
      } finally {
        controllers.current.delete(item.id);
      }
    },
    [patch, drop],
  );

  // Pump the queue: keep up to MAX_CONCURRENT transfers in flight.
  useEffect(() => {
    const active = items.filter((i) => i.status === "uploading" || i.status === "processing").length;
    const slots = MAX_CONCURRENT - active;
    if (slots <= 0) return;
    items
      .filter((i) => i.status === "queued" && !started.current.has(i.id))
      .slice(0, slots)
      .forEach((item) => {
        started.current.add(item.id);
        void run(item);
      });
  }, [items, run]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const problems: string[] = [];
    const existing = new Set(itemsRef.current.map((i) => fingerprint(i.file)));
    const accepted: UploadItem[] = [];

    for (const file of Array.from(files)) {
      const mimeType = resolveMime(file);
      if (!mimeType) {
        problems.push(`${file.name}: not a supported image type`);
      } else if (file.size > MAX_BYTES) {
        problems.push(`${file.name}: larger than ${MAX_BYTES / 1024 / 1024} MB`);
      } else if (file.size === 0) {
        problems.push(`${file.name}: file is empty`);
      } else if (existing.has(fingerprint(file))) {
        continue; // silently skip an identical file already in the queue
      } else {
        existing.add(fingerprint(file));
        accepted.push({
          id: crypto.randomUUID(),
          file,
          mimeType,
          previewUrl: URL.createObjectURL(file),
          status: "queued",
          progress: 0,
        });
      }
    }

    setRejected(problems);
    if (accepted.length) setItems((current) => [...current, ...accepted]);
  }, []);

  const retry = useCallback(
    (id: string) => {
      started.current.delete(id);
      patch(id, { status: "queued", progress: 0, error: undefined });
    },
    [patch],
  );

  const retryAllFailed = useCallback(() => {
    itemsRef.current.filter((i) => i.status === "error").forEach((i) => retry(i.id));
  }, [retry]);

  const clearRejected = useCallback(() => setRejected([]), []);

  useEffect(
    () => () => {
      controllers.current.forEach((controller) => controller.abort());
      itemsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    },
    [],
  );

  const inFlight = items.filter((i) => i.status !== "done" && i.status !== "error");
  const total = items.length;
  const overall = total === 0 ? 0 : items.reduce((sum, i) => sum + (i.status === "done" ? 1 : i.progress), 0) / total;

  return {
    items,
    rejected,
    addFiles,
    remove: drop,
    retry,
    retryAllFailed,
    clearRejected,
    isBusy: inFlight.length > 0,
    failedCount: items.filter((i) => i.status === "error").length,
    overall,
  };
}