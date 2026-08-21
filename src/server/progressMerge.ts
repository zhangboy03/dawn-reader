type StoredLocators = {
  cfi: string | null;
  nativeLocator: string | null;
};

type LocatorPatch = {
  cfi?: unknown;
  nativeLocator?: unknown;
};

function normalizedLocator(value: unknown, maximumLength: number) {
  return typeof value === "string" && value ? value.slice(0, maximumLength) : null;
}

/**
 * Web and Readium use different exact locator formats. An omitted field means
 * “this client does not own that format”; only an explicit value or null may
 * replace it.
 */
export function mergeProgressLocators(existing: StoredLocators | null, patch: LocatorPatch): StoredLocators {
  return {
    cfi: patch.cfi === undefined
      ? existing?.cfi ?? null
      : normalizedLocator(patch.cfi, 4_000),
    nativeLocator: patch.nativeLocator === undefined
      ? existing?.nativeLocator ?? null
      : normalizedLocator(patch.nativeLocator, 12_000),
  };
}
