import { type ClientPhoto, listClientPhotos } from "./api";

/** Resolve the photographs the client is deciding on, including later pages. */
export async function loadClientPhotosForIds(
  galleryId: string,
  ids: Set<string>,
): Promise<ClientPhoto[]> {
  if (ids.size === 0) return [];
  const loaded: ClientPhoto[] = [];
  const seen = new Set<string>();
  let page = 1;
  let total = Infinity;
  while (loaded.length < total) {
    const response = await listClientPhotos(galleryId, page, 100);
    const incoming = response.items.filter((photo) => !seen.has(photo.photoId));
    if (incoming.length === 0) break;
    for (const photo of incoming) {
      seen.add(photo.photoId);
      loaded.push(photo);
    }
    if ([...ids].every((id) => seen.has(id))) return loaded;
    total = response.total;
    page += 1;
  }
  throw new Error(
    "Some photographs could not be loaded. Please try again before continuing.",
  );
}
