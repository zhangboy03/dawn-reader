import { readerLocalStorage } from "./clientAccountContext";

export type EpubPageNumber = {
  current: number;
  total: number;
  source: "publisher" | "generated";
};

const LOCATION_CACHE_VERSION = 1;
export const EPUB_LOCATION_BREAK = 1200;

export function epubLocationCacheKey(bookId: string) {
  return `dawn-reader-locations:v${LOCATION_CACHE_VERSION}:${EPUB_LOCATION_BREAK}:${bookId}`;
}

export function parseCachedEpubLocations(raw: string | null) {
  if (!raw) return null;
  try {
    const locations = JSON.parse(raw) as unknown;
    if (
      !Array.isArray(locations)
      || locations.length < 2
      || locations.some((location) => typeof location !== "string" || !location.startsWith("epubcfi("))
    ) return null;
    return locations as string[];
  } catch {
    return null;
  }
}

export function loadCachedEpubLocations(bookId: string, storage: Pick<Storage, "getItem"> = readerLocalStorage()) {
  return parseCachedEpubLocations(storage.getItem(epubLocationCacheKey(bookId)));
}

export function saveCachedEpubLocations(
  bookId: string,
  locations: string[],
  storage: Pick<Storage, "setItem"> = readerLocalStorage(),
) {
  if (locations.length < 2) return false;
  try {
    storage.setItem(epubLocationCacheKey(bookId), JSON.stringify(locations));
    return true;
  } catch {
    return false;
  }
}

export function deleteCachedEpubLocations(
  bookId: string,
  storage: Pick<Storage, "removeItem"> = readerLocalStorage(),
) {
  storage.removeItem(epubLocationCacheKey(bookId));
}

export function pageNumberFromLocation(location: number, totalIndex: number): EpubPageNumber | null {
  if (!Number.isFinite(location) || !Number.isFinite(totalIndex) || location < 0 || totalIndex < 0) return null;
  const lastIndex = Math.floor(totalIndex);
  return {
    current: Math.min(Math.floor(location), lastIndex) + 1,
    total: lastIndex + 1,
    source: "generated",
  };
}

export function publisherPageNumber(page: number, lastPage: number): EpubPageNumber | null {
  if (!Number.isFinite(page) || !Number.isFinite(lastPage) || page < 0 || lastPage < page) return null;
  return {
    current: Math.floor(page),
    total: Math.floor(lastPage),
    source: "publisher",
  };
}
