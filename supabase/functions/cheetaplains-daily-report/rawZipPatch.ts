/** Rewrites selected ZIP members while byte-copying every unchanged member. */
const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const EOCD = 0x06054b50;

interface Entry {
  name: string;
  central: Uint8Array;
  localOffset: number;
  localEnd: number;
}

const u16 = (view: DataView, offset: number): number => view.getUint16(offset, true);
const u32 = (view: DataView, offset: number): number => view.getUint32(offset, true);
const put16 = (view: DataView, offset: number, value: number) => view.setUint16(offset, value, true);
const put32 = (view: DataView, offset: number, value: number) => view.setUint32(offset, value, true);

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let value = 0; value < 256; value += 1) {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    table[value] = crc >>> 0;
  }
  return table;
})();

const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const concat = (chunks: Uint8Array[]): Uint8Array => {
  const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
};

const findEocd = (bytes: Uint8Array): number => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset -= 1) {
    if (u32(view, offset) === EOCD) return offset;
  }
  throw new Error("The workbook ZIP directory is missing");
};

const parseEntries = (bytes: Uint8Array): { entries: Entry[]; comment: Uint8Array } => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocd(bytes);
  const count = u16(view, eocd + 10);
  const centralOffset = u32(view, eocd + 16);
  const commentLength = u16(view, eocd + 20);
  const decoder = new TextDecoder();
  const entries: Entry[] = [];
  let cursor = centralOffset;
  for (let index = 0; index < count; index += 1) {
    if (u32(view, cursor) !== CENTRAL) throw new Error("The workbook ZIP directory is invalid");
    const nameLength = u16(view, cursor + 28);
    const extraLength = u16(view, cursor + 30);
    const noteLength = u16(view, cursor + 32);
    const length = 46 + nameLength + extraLength + noteLength;
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    entries.push({
      name,
      central: bytes.slice(cursor, cursor + length),
      localOffset: u32(view, cursor + 42),
      localEnd: 0,
    });
    cursor += length;
  }
  const sorted = [...entries].sort((left, right) => left.localOffset - right.localOffset);
  sorted.forEach((entry, index) => {
    entry.localEnd = sorted[index + 1]?.localOffset ?? centralOffset;
  });
  return { entries, comment: bytes.slice(eocd + 22, eocd + 22 + commentLength) };
};

const storedRecords = (name: string, data: Uint8Array, offset: number): { local: Uint8Array; central: Uint8Array } => {
  const encodedName = new TextEncoder().encode(name);
  const checksum = crc32(data);
  const local = new Uint8Array(30 + encodedName.length + data.length);
  const localView = new DataView(local.buffer);
  put32(localView, 0, LOCAL);
  put16(localView, 4, 20);
  put16(localView, 6, 0x0800);
  put16(localView, 8, 0);
  put32(localView, 14, checksum);
  put32(localView, 18, data.length);
  put32(localView, 22, data.length);
  put16(localView, 26, encodedName.length);
  local.set(encodedName, 30);
  local.set(data, 30 + encodedName.length);

  const central = new Uint8Array(46 + encodedName.length);
  const centralView = new DataView(central.buffer);
  put32(centralView, 0, CENTRAL);
  put16(centralView, 4, 20);
  put16(centralView, 6, 20);
  put16(centralView, 8, 0x0800);
  put16(centralView, 10, 0);
  put32(centralView, 16, checksum);
  put32(centralView, 20, data.length);
  put32(centralView, 24, data.length);
  put16(centralView, 28, encodedName.length);
  put32(centralView, 42, offset);
  central.set(encodedName, 46);
  return { local, central };
};

export function patchZip(
  input: ArrayBuffer,
  replacements: Map<string, Uint8Array>,
  removals: Set<string> = new Set(),
): Uint8Array {
  const bytes = new Uint8Array(input);
  const { entries, comment } = parseEntries(bytes);
  const existingNames = new Set(entries.map((entry) => entry.name));
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let outputOffset = 0;

  for (const entry of entries) {
    if (removals.has(entry.name)) continue;
    const replacement = replacements.get(entry.name);
    if (replacement) {
      const records = storedRecords(entry.name, replacement, outputOffset);
      localParts.push(records.local);
      centralParts.push(records.central);
      outputOffset += records.local.length;
      continue;
    }
    const local = bytes.slice(entry.localOffset, entry.localEnd);
    const central = entry.central.slice();
    put32(new DataView(central.buffer, central.byteOffset, central.byteLength), 42, outputOffset);
    localParts.push(local);
    centralParts.push(central);
    outputOffset += local.length;
  }

  for (const [name, data] of replacements) {
    if (existingNames.has(name) || removals.has(name)) continue;
    const records = storedRecords(name, data, outputOffset);
    localParts.push(records.local);
    centralParts.push(records.central);
    outputOffset += records.local.length;
  }

  const central = concat(centralParts);
  const eocd = new Uint8Array(22 + comment.length);
  const eocdView = new DataView(eocd.buffer);
  put32(eocdView, 0, EOCD);
  put16(eocdView, 8, centralParts.length);
  put16(eocdView, 10, centralParts.length);
  put32(eocdView, 12, central.length);
  put32(eocdView, 16, outputOffset);
  put16(eocdView, 20, comment.length);
  eocd.set(comment, 22);
  return concat([...localParts, central, eocd]);
}