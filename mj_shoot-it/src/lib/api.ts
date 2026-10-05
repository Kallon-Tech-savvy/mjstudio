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

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
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
    return undefined as T;
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.error?.message ?? "Request failed";
    throw new Error(message);
  }

  return (payload?.data ?? payload) as T;
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
  return apiRequest<{ items: ClientRecord[]; total: number }>(`/clients?page=${page}&limit=${limit}`);
}

export async function listGalleries(page = 1, limit = 20): Promise<{ items: GalleryRecord[]; total: number }> {
  return apiRequest<{ items: GalleryRecord[]; total: number }>(`/galleries?page=${page}&limit=${limit}`);
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
  return apiRequest<GalleryRecord>(`/galleries/${galleryId}`);
}

export async function listGalleryPhotos(galleryId: string, page = 1, limit = 20): Promise<{ items: PhotoRecord[]; total: number }> {
  return apiRequest<{ items: PhotoRecord[]; total: number }>(`/galleries/${galleryId}/photos?page=${page}&limit=${limit}`);
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
}): Promise<{ authenticated: boolean; expiresAt?: string }> {
  return apiRequest<{ authenticated: boolean; expiresAt?: string }>("/client/access/verify", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getClientGallery(galleryId: string): Promise<GalleryRecord> {
  return apiRequest<GalleryRecord>(`/client/galleries/${galleryId}`);
}

export async function listClientPhotos(galleryId: string, page = 1, limit = 20): Promise<{ items: PhotoRecord[]; total: number }> {
  return apiRequest<{ items: PhotoRecord[]; total: number }>(`/client/galleries/${galleryId}/photos?page=${page}&limit=${limit}`);
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
