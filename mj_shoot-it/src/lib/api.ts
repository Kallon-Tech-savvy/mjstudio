export type ApiEnvelope<T> = {
  data: T;
  meta?: Record<string, unknown>;
};

export type WorkflowStatus = "draft" | "reviewing" | "completed";
export type PublicationStatus = "unpublished" | "published" | "revoked";

export type PhotographerUser = {
  userId: string;
  email: string;
  displayName: string;
  studioId: string;
  role: string;
};

export type StudioSummary = {
  studioId: string;
  name: string;
  ownerId?: string;
  clientCount?: number;
  galleryCount?: number;
  [key: string]: unknown;
};

export type GalleryRecord = {
  galleryId: string;
  clientId: string;
  name: string;
  workflowStatus?: WorkflowStatus | string;
  publicationStatus?: PublicationStatus | string;
  status?: string; // kept so older code still compiles; mirrors workflowStatus
  expiresAt?: string | null;
  createdAt?: string;
  [key: string]: unknown;
};

export type ClientRecord = {
  clientId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  studioId?: string;
  [key: string]: unknown;
};

export type PhotoRecord = {
  photoId: string;
  galleryId: string;
  filename: string;
  mimeType?: string;
  status?: string;
  position?: number;
  [key: string]: unknown;
};
 
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001/api";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function apiRequestWithMeta<T>(path: string, init: RequestInit = {}): Promise<{ data: T; meta?: Record<string, unknown> }> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    // fetch rejects only when no HTTP response arrived (server down, blocked, DNS).
    throw new ApiError("Cannot reach the server. Please try again shortly.", "NETWORK_ERROR", 0);
  }

  if (response.status === 204) {
    return { data: undefined as T };
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = payload?.error;
    const message = typeof error?.message === "string" ? error.message : "Request failed";
    const code = typeof error?.code === "string" ? error.code : "REQUEST_FAILED";
    const requestId = typeof error?.request_id === "string"
      ? error.request_id
      : response.headers.get("X-Request-ID") ?? undefined;
    throw new ApiError(message, code, response.status, requestId);
  }

  return {
    data: (payload?.data ?? payload) as T,
    meta: payload?.meta as Record<string, unknown> | undefined,
  };
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  return (await apiRequestWithMeta<T>(path, init)).data;
}

async function apiCollectionRequest<T>(path: string, normalize: (item: Record<string, unknown>) => T): Promise<{ items: T[]; total: number }> {
  const { data, meta } = await apiRequestWithMeta<Record<string, unknown>[]>(path);
  return {
    items: data.map(normalize),
    total: typeof meta?.total === "number" ? meta.total : data.length,
  };
}

function normalizeGallery(item: Record<string, unknown>): GalleryRecord {
  const workflowStatus = String(item.workflowStatus ?? item.workflow_status ?? item.status ?? "draft");
  const publicationStatus = String(item.publicationStatus ?? item.publication_status ?? "unpublished");
  return {
    ...item,
    galleryId: String(item.galleryId ?? item.id ?? ""),
    clientId: String(item.clientId ?? item.client_id ?? ""),
    workflowStatus,
    publicationStatus,
    status: workflowStatus,
    expiresAt: (item.expiresAt ?? item.expires_at ?? null) as string | null,
    createdAt: (item.createdAt ?? item.created_at) as string | undefined,
  } as GalleryRecord;
}

export async function createClient(input: {
  name: string;
  email?: string | null;
  phone?: string | null;
}): Promise<ClientRecord> {
  return normalizeClient(
    await apiRequest<Record<string, unknown>>("/clients", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );
}

function normalizeClient(item: Record<string, unknown>): ClientRecord {
  return {
    ...item,
    clientId: String(item.clientId ?? item.id ?? ""),
  } as ClientRecord;
}

function normalizePhoto(item: Record<string, unknown>, galleryId = ""): PhotoRecord {
  return {
    ...item,
    photoId: String(item.photoId ?? item.id ?? ""),
    galleryId: String(item.galleryId ?? galleryId),
  } as PhotoRecord;
}

export async function getPhotographerMe(): Promise<{ user: PhotographerUser | null } | null> {
  return apiRequest<{ user: PhotographerUser | null }>("/auth/me");
}

export async function photographerLogin(input: {
  email: string;
  password: string;
}): Promise<{ user: PhotographerUser; authenticated: boolean }> {
  return apiRequest<{ user: PhotographerUser; authenticated: boolean }>("/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function photographerLogout(): Promise<void> {
  await apiRequest<void>("/auth/logout", { method: "POST" });
}

export async function getStudioSummary(): Promise<StudioSummary> {
  return apiRequest<StudioSummary>("/studio");
}

export async function listClients(page = 1, limit = 20): Promise<{ items: ClientRecord[]; total: number }> {
  return apiCollectionRequest(`/clients?page=${page}&limit=${limit}`, normalizeClient);
}

export async function listGalleries(page = 1, limit = 20): Promise<{ items: GalleryRecord[]; total: number }> {
  return apiCollectionRequest(`/galleries?page=${page}&limit=${limit}`, normalizeGallery);
}

export async function createGallery(input: {
  clientId?: string;
  newClient?: { name?: string; email?: string; phone?: string };
  name: string;
  workflowStatus?: WorkflowStatus;
  expiresAt?: string | null;
}): Promise<GalleryRecord> {
  return normalizeGallery(
    await apiRequest<Record<string, unknown>>("/galleries", { method: "POST", body: JSON.stringify(input) }),
  );
}

export async function getGallery(galleryId: string): Promise<GalleryRecord> {
  return normalizeGallery(await apiRequest<Record<string, unknown>>(`/galleries/${galleryId}`));
}

export async function listGalleryPhotos(galleryId: string, page = 1, limit = 20): Promise<{ items: PhotoRecord[]; total: number }> {
  return apiCollectionRequest(`/galleries/${galleryId}/photos?page=${page}&limit=${limit}`, (item) => normalizePhoto(item, galleryId));
}

export async function createGalleryAccess(
  galleryId: string,
  input: { permission: "view" | "view_download"; expiresAt?: string | null },
): Promise<{ accessKey?: string; permission: string; expiresAt?: string | null; [key: string]: unknown }> {
  return apiRequest<{ accessKey?: string; permission: string; expiresAt?: string | null; [key: string]: unknown }>(
    `/galleries/${galleryId}/access`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function verifyClientAccess(input: {
  secret: string;
  pin: string;
}): Promise<{ authenticated: boolean; galleryId: string; expiresAt?: string }> {
  return apiRequest<{ authenticated: boolean; galleryId: string; expiresAt?: string }>("/client/access/verify", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getClientGallery(galleryId: string): Promise<GalleryRecord> {
  return normalizeGallery(await apiRequest<Record<string, unknown>>(`/client/galleries/${galleryId}`));
}

export async function listClientPhotos(galleryId: string, page = 1, limit = 20): Promise<{ items: PhotoRecord[]; total: number }> {
  return apiCollectionRequest(`/client/galleries/${galleryId}/photos?page=${page}&limit=${limit}`, (item) => normalizePhoto(item, galleryId));
}

export async function setSelection(
  galleryId: string,
  photoId: string,
  selection: "neutral" | "favourite" | "not_for_me",
): Promise<{ photoId: string; selection: string }> {
  return apiRequest<{ photoId: string; selection: string }>(`/client/galleries/${galleryId}/photos/${photoId}/selection`, {
    method: "PUT",
    body: JSON.stringify({ selection }),
  });
}

export async function createDownload(
  galleryId: string,
  photoId: string,
): Promise<{ download_url: string; expires_at?: string }> {
  return apiRequest<{ download_url: string; expires_at?: string }>(`/client/galleries/${galleryId}/photos/${photoId}/download`, {
    method: "POST",
  });
}

export async function createGalleryFeedback(galleryId: string, message: string): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/client/galleries/${galleryId}/feedback`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export async function createPhotoFeedback(
  galleryId: string,
  photoId: string,
  message: string,
): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/client/galleries/${galleryId}/photos/${photoId}/feedback`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}


// Append these to src/lib/api.ts (they use its private apiRequest + normalizePhoto/normalizeGallery).

export type UploadTarget = {
  url: string;
  method?: "PUT" | "POST";
  headers?: Record<string, string>;
};

export type CreatedPhoto = PhotoRecord & { upload?: UploadTarget };

/** Step 1: register the photo. Server responds with the record + where to send the bytes. */
export async function createPhoto(
  galleryId: string,
  input: { filename: string; mimeType: string },
): Promise<CreatedPhoto> {
  const raw = await apiRequest<Record<string, unknown>>(`/galleries/${galleryId}/photos`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  const upload = (raw.upload ??
    (typeof raw.uploadUrl === "string" ? { url: raw.uploadUrl } : undefined)) as UploadTarget | undefined;
  return { ...normalizePhoto(raw, galleryId), upload };
}

/** Step 3: tell the server the bytes landed so it can process previews. */
export async function completePhotoUpload(photoId: string): Promise<Record<string, unknown>> {
  return apiRequest<Record<string, unknown>>(`/photos/${photoId}/upload-complete`, { method: "POST" });
}

export async function deletePhoto(photoId: string): Promise<void> {
  await apiRequest<void>(`/photos/${photoId}`, { method: "DELETE" });
}

export type AccessRecord = {
  permission: string;
  expiresAt?: string | null;
  revokedAt?: string | null;
  [key: string]: unknown;
};

/** Only one un-revoked access exists per gallery (uq_gallery_access_current), so the UI must read before it issues. */
export async function listGalleryAccess(galleryId: string): Promise<AccessRecord[]> {
  const data = await apiRequest<AccessRecord[] | null>(`/galleries/${galleryId}/access`);
  return Array.isArray(data) ? data : [];
}

export async function resetGalleryAccess(
  galleryId: string,
  input: { permission: "view" | "view_download"; expiresAt?: string | null },
): Promise<{ accessKey?: string; pin?: string; [key: string]: unknown }> {
  return apiRequest(`/galleries/${galleryId}/access/reset`, { method: "POST", body: JSON.stringify(input) });
}

export async function revokeGalleryAccess(galleryId: string): Promise<void> {
  await apiRequest<unknown>(`/galleries/${galleryId}/access/revoke`, { method: "POST" });
}

export async function publishGallery(galleryId: string): Promise<GalleryRecord> {
  return normalizeGallery(await apiRequest<Record<string, unknown>>(`/galleries/${galleryId}/publish`, { method: "POST" }));
}