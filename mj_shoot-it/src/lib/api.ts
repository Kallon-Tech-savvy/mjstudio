export type ApiEnvelope<T> = {
  data: T;
  meta?: Record<string, unknown>;
};

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
  status?: string;
  publishState?: string;
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

export type PhotoRepresentation = {
  url: string;
  expiresAt: string;
  width: number;
  height: number;
  mimeType: string;
};

export type ClientPhoto = {
  photoId: string;
  position: number;
  recommended: boolean;
  thumbnail: PhotoRepresentation;
};

export type ClientPhotoDetail = {
  photoId: string;
  position: number;
  recommended: boolean;
  preview: PhotoRepresentation;
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
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });

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
  return {
    ...item,
    galleryId: String(item.galleryId ?? item.id ?? ""),
    clientId: String(item.clientId ?? ""),
    status: String(item.status ?? item.publicationStatus ?? item.workflowStatus ?? "draft"),
  } as GalleryRecord;
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
  clientId: string;
  name: string;
  expiresAt?: string | null;
}): Promise<GalleryRecord> {
  return apiRequest<GalleryRecord>("/galleries", {
    method: "POST",
    body: JSON.stringify(input),
  });
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

export async function listClientPhotos(galleryId: string, page = 1, limit = 20): Promise<{ items: ClientPhoto[]; total: number }> {
  return apiCollectionRequest<ClientPhoto>(`/client/galleries/${galleryId}/photos?page=${page}&limit=${limit}`, (item) => ({
    photoId: String(item.photoId ?? item.id ?? ""),
    position: Number(item.position ?? 0),
    recommended: Boolean(item.recommended),
    thumbnail: item.thumbnail as PhotoRepresentation,
  }));
}

export async function getClientPhoto(galleryId: string, photoId: string): Promise<ClientPhotoDetail> {
  return apiRequest<ClientPhotoDetail>(`/client/galleries/${galleryId}/photos/${photoId}`);
}

export async function getClientSelections(galleryId: string): Promise<Array<{ photoId: string; selection: string; updatedAt?: string }>> {
  return apiRequest<Array<{ photoId: string; selection: string; updatedAt?: string }>>(`/client/galleries/${galleryId}/selection`);
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
