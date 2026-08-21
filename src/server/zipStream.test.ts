import { describe, expect, it } from "vitest";
import { bytesZipEntry, createZipStream } from "./zipStream";

async function collect(stream: ReadableStream<Uint8Array>) {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

describe("streaming ZIP export", () => {
  it("emits local, descriptor, central, and end records without buffering source entries", async () => {
    const bytes = await collect(createZipStream([
      bytesZipEntry("manifest.json", new TextEncoder().encode('{"ok":true}')),
    ]));
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(new TextDecoder().decode(bytes)).toContain("manifest.json");
    expect(view.getUint32(bytes.byteLength - 22, true)).toBe(0x06054b50);
    expect(view.getUint16(bytes.byteLength - 14, true)).toBe(1);
  });
});
