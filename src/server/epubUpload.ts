const MAX_ENTRIES = 2_000;
const MAX_EXPANDED_BYTES = 250 * 1024 * 1024;
const MAX_SINGLE_ENTRY_BYTES = 100 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 200;
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

export class InvalidEpubError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidEpubError";
  }
}

function decodeName(bytes: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new InvalidEpubError("EPUB contains an invalid UTF-8 path.");
  }
}

export function normalizedEpubPath(name: string) {
  if (!name || name.includes("\\") || name.includes("\0") || name.startsWith("/") || /^[a-z]:/i.test(name)) {
    throw new InvalidEpubError("EPUB contains an unsafe path.");
  }
  const parts = name.split("/");
  if (parts.some((part) => part === ".." || part === ".")) {
    throw new InvalidEpubError("EPUB contains an unsafe path.");
  }
  return parts.filter(Boolean).join("/");
}

function findEndOfCentralDirectory(view: DataView) {
  const minimum = Math.max(0, view.byteLength - 65_557);
  for (let offset = view.byteLength - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) return offset;
  }
  throw new InvalidEpubError("EPUB is not a valid ZIP container.");
}

export async function validateEpubUpload(file: File) {
  const mime = file.type.toLowerCase();
  if (mime && !["application/epub+zip", "application/zip", "application/octet-stream"].includes(mime)) {
    throw new InvalidEpubError("File type is not an EPUB container.");
  }

  const buffer = await file.arrayBuffer();
  if (buffer.byteLength < 58) throw new InvalidEpubError("EPUB container is incomplete.");
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const eocd = findEndOfCentralDirectory(view);
  const disk = view.getUint16(eocd + 4, true);
  const centralDisk = view.getUint16(eocd + 6, true);
  const entriesOnDisk = view.getUint16(eocd + 8, true);
  const entryCount = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  if (disk !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount) {
    throw new InvalidEpubError("Multi-disk EPUB archives are not supported.");
  }
  if (entryCount === 0 || entryCount === 0xffff || entryCount > MAX_ENTRIES || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new InvalidEpubError("EPUB archive structure is unsupported or too large.");
  }
  if (centralOffset + centralSize > eocd || centralOffset < 0) {
    throw new InvalidEpubError("EPUB central directory is invalid.");
  }

  const paths = new Set<string>();
  let offset = centralOffset;
  let expandedBytes = 0;
  let firstEntry: { path: string; method: number; compressedSize: number; localOffset: number } | null = null;
  let hasContainer = false;
  let hasPackage = false;

  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > eocd || view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      throw new InvalidEpubError("EPUB central directory entry is invalid.");
    }
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const nextOffset = offset + 46 + nameLength + extraLength + commentLength;
    if (nextOffset > eocd || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new InvalidEpubError("ZIP64 or truncated EPUB entries are not supported.");
    }
    if ((flags & 0x1) !== 0) throw new InvalidEpubError("Encrypted EPUB entries are not supported.");
    if (method !== 0 && method !== 8) throw new InvalidEpubError("EPUB uses an unsupported compression method.");

    const path = normalizedEpubPath(decodeName(bytes.subarray(offset + 46, offset + 46 + nameLength)));
    if (!path) throw new InvalidEpubError("EPUB contains an empty path.");
    const key = path.toLowerCase();
    if (paths.has(key)) throw new InvalidEpubError("EPUB contains duplicate or case-conflicting paths.");
    paths.add(key);
    if (!path.endsWith("/")) {
      if (uncompressedSize > MAX_SINGLE_ENTRY_BYTES) throw new InvalidEpubError("An EPUB entry is too large.");
      if (compressedSize === 0 && uncompressedSize > 0) throw new InvalidEpubError("EPUB has an invalid compression ratio.");
      if (compressedSize > 0 && uncompressedSize / compressedSize > MAX_COMPRESSION_RATIO) {
        throw new InvalidEpubError("EPUB compression ratio is unsafe.");
      }
      expandedBytes += uncompressedSize;
      if (expandedBytes > MAX_EXPANDED_BYTES) throw new InvalidEpubError("Expanded EPUB content is too large.");
    }
    if (/\.(?:js|mjs)$/i.test(path)) throw new InvalidEpubError("Scripted EPUB content is not supported in Beta.");
    if (key === "meta-inf/container.xml") hasContainer = true;
    if (key.endsWith(".opf")) hasPackage = true;
    if (!firstEntry) firstEntry = { path, method, compressedSize, localOffset };
    offset = nextOffset;
  }

  if (offset !== centralOffset + centralSize) throw new InvalidEpubError("EPUB central directory size does not match its entries.");
  if (!firstEntry || firstEntry.path !== "mimetype" || firstEntry.method !== 0 || firstEntry.compressedSize !== 20) {
    throw new InvalidEpubError("EPUB must begin with an uncompressed mimetype entry.");
  }
  if (!hasContainer || !hasPackage) throw new InvalidEpubError("EPUB is missing its container or package document.");
  const local = firstEntry.localOffset;
  if (local + 30 > centralOffset || view.getUint32(local, true) !== LOCAL_SIGNATURE) {
    throw new InvalidEpubError("EPUB mimetype entry is invalid.");
  }
  const localNameLength = view.getUint16(local + 26, true);
  const localExtraLength = view.getUint16(local + 28, true);
  const mimetypeOffset = local + 30 + localNameLength + localExtraLength;
  if (mimetypeOffset + 20 > centralOffset) throw new InvalidEpubError("EPUB mimetype entry is truncated.");
  const mimetype = new TextDecoder().decode(bytes.subarray(mimetypeOffset, mimetypeOffset + 20));
  if (mimetype !== "application/epub+zip") throw new InvalidEpubError("EPUB mimetype is invalid.");
  return buffer;
}
