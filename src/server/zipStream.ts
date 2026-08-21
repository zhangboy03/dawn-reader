export type ZipStreamEntry = {
  path: string;
  size: number;
  open: () => Promise<ReadableStream<Uint8Array>>;
};

const encoder = new TextEncoder();
const crcTable = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  crcTable[index] = value >>> 0;
}

function updateCrc(crc: number, bytes: Uint8Array) {
  let next = crc;
  for (const byte of bytes) next = crcTable[(next ^ byte) & 0xff] ^ (next >>> 8);
  return next >>> 0;
}

function write16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

function write32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true);
}

function localHeader(name: Uint8Array) {
  const bytes = new Uint8Array(30 + name.byteLength);
  const view = new DataView(bytes.buffer);
  write32(view, 0, 0x04034b50);
  write16(view, 4, 20);
  write16(view, 6, 0x0808);
  write16(view, 8, 0);
  write16(view, 26, name.byteLength);
  bytes.set(name, 30);
  return bytes;
}

function dataDescriptor(crc: number, size: number) {
  const bytes = new Uint8Array(16);
  const view = new DataView(bytes.buffer);
  write32(view, 0, 0x08074b50);
  write32(view, 4, crc);
  write32(view, 8, size);
  write32(view, 12, size);
  return bytes;
}

function centralHeader(record: { name: Uint8Array; crc: number; size: number; localOffset: number }) {
  const bytes = new Uint8Array(46 + record.name.byteLength);
  const view = new DataView(bytes.buffer);
  write32(view, 0, 0x02014b50);
  write16(view, 4, 20);
  write16(view, 6, 20);
  write16(view, 8, 0x0808);
  write16(view, 10, 0);
  write32(view, 16, record.crc);
  write32(view, 20, record.size);
  write32(view, 24, record.size);
  write16(view, 28, record.name.byteLength);
  write32(view, 42, record.localOffset);
  bytes.set(record.name, 46);
  return bytes;
}

function endOfCentralDirectory(entryCount: number, centralSize: number, centralOffset: number) {
  const bytes = new Uint8Array(22);
  const view = new DataView(bytes.buffer);
  write32(view, 0, 0x06054b50);
  write16(view, 8, entryCount);
  write16(view, 10, entryCount);
  write32(view, 12, centralSize);
  write32(view, 16, centralOffset);
  return bytes;
}

async function* zipChunks(entries: ZipStreamEntry[]) {
  if (entries.length > 65_535) throw new Error("ZIP entry limit exceeded.");
  const records: Array<{ name: Uint8Array; crc: number; size: number; localOffset: number }> = [];
  let offset = 0;

  for (const entry of entries) {
    if (!Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > 0xffffffff) {
      throw new Error("ZIP64 entries are not supported.");
    }
    const name = encoder.encode(entry.path);
    if (!name.byteLength || name.byteLength > 65_535) throw new Error("Invalid ZIP entry path.");
    const localOffset = offset;
    const header = localHeader(name);
    yield header;
    offset += header.byteLength;

    let crc = 0xffffffff;
    let written = 0;
    const reader = (await entry.open()).getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value?.byteLength) continue;
        written += value.byteLength;
        if (written > entry.size) throw new Error(`ZIP entry grew while exporting: ${entry.path}`);
        crc = updateCrc(crc, value);
        yield value;
        offset += value.byteLength;
      }
    } finally {
      reader.releaseLock();
    }
    if (written !== entry.size) throw new Error(`ZIP entry changed size while exporting: ${entry.path}`);
    crc = (crc ^ 0xffffffff) >>> 0;
    const descriptor = dataDescriptor(crc, written);
    yield descriptor;
    offset += descriptor.byteLength;
    records.push({ name, crc, size: written, localOffset });
  }

  const centralOffset = offset;
  for (const record of records) {
    const header = centralHeader(record);
    yield header;
    offset += header.byteLength;
  }
  const centralSize = offset - centralOffset;
  yield endOfCentralDirectory(records.length, centralSize, centralOffset);
}

export function createZipStream(entries: ZipStreamEntry[]) {
  const iterator = zipChunks(entries)[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await iterator.return?.();
    },
  });
}

export function bytesZipEntry(path: string, bytes: Uint8Array): ZipStreamEntry {
  return {
    path,
    size: bytes.byteLength,
    open: async () => new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); controller.close(); } }),
  };
}
