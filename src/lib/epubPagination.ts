export type EpubPageNumber = {
  current: number;
  total: number;
  source: "publisher" | "generated";
};

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
