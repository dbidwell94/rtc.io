// This comment describes the header structure of a chunk
// Header Size: 21 bytes
//
// 0  - 15 -- UUID as bytes (this is the binary ID used to track chunks)
// 16 - 19 -- The index of the chunk this header is for
// 20      -- boolean flag representing if this is the final chunk

import { Option, option } from "@dbidwell94/ts-utils";

/**
 * Represents any valid JSON-serializable primitive value.
 */
type JsonPrimitive = string | number | boolean | null;

/**
 * Represents a JSON-serializable object.
 */
type JsonObject = { [key: string]: JsonValue };

/**
 * Represents a JSON-serializable array.
 */
type JsonArray = JsonValue[];

/**
 * Represents any value that can be successfully serialized into a JSON string.
 */
type JsonValue = JsonPrimitive | JsonObject | JsonArray;

interface ChunkHeader {
  id: string;
  chunkIndex: number;
  isFinal: boolean;
}

const HEADER_BYTE_SIZE = 21;

export class BinaryChunker {
  private _chunks: Map<string, ArrayBuffer[]> = new Map();
  private _maxChunkSize: number;

  constructor(maxChunkSize = 1024) {
    if (maxChunkSize <= HEADER_BYTE_SIZE) {
      throw new Error(
        "Unable to create a BinaryChunker with a max packet size less than the header size",
      );
    }
    this._maxChunkSize = maxChunkSize;
  }

  static get HEADER_SIZE() {
    return HEADER_BYTE_SIZE;
  }

  chunkData(dataToChunk: ArrayBuffer): ArrayBuffer[] {
    const chunks: ArrayBuffer[] = [];
    const dataId = crypto.randomUUID();

    const dataIdBytes = this.uuidToBytes(dataId);

    const payloadSize = this._maxChunkSize - HEADER_BYTE_SIZE;
    const totalChunks = Math.ceil(dataToChunk.byteLength / payloadSize);

    let currentChunkId = 0;

    for (let i = 0; i < dataToChunk.byteLength; i += payloadSize) {
      const isLastChunk = currentChunkId === totalChunks - 1;

      const header = new ArrayBuffer(HEADER_BYTE_SIZE);
      const headerView = new DataView(header);

      // Set File ID (bytes 0-15)
      new Uint8Array(header).set(dataIdBytes, 0);

      // Set Chunk Index (bytes 16-19) - as a 32-bit unsigned integer
      headerView.setUint32(16, currentChunkId, false); // false for big-endian

      // Set Last Chunk Flag (byte 20)
      headerView.setUint8(20, isLastChunk ? 1 : 0);

      const start = i;
      const end = Math.min(i + payloadSize, dataToChunk.byteLength);
      const chunkPayload = dataToChunk.slice(start, end);

      currentChunkId++;

      chunks.push(this.concatBuffers(header, chunkPayload));
    }

    return chunks;
  }

  receiveChunk(chunk: ArrayBuffer): Option<ArrayBuffer> {
    const header = this.parseHeaderFromBuffer(chunk);

    if (!this._chunks.has(header.id)) {
      this._chunks.set(header.id, []);
    }

    const transfer = this._chunks.get(header.id)!;

    transfer[header.chunkIndex] = chunk.slice(HEADER_BYTE_SIZE);

    if (header.isFinal) {
      const assembled = this.concatBuffers(...transfer);
      this._chunks.delete(header.id);
      return option.some(assembled);
    }

    return option.none();
  }

  private buildHeader(
    fileId: Uint8Array,
    chunkIndex: number,
    isLast: boolean,
  ): ArrayBuffer {
    const header = new ArrayBuffer(HEADER_BYTE_SIZE);
    const headerView = new DataView(header);

    // Set the File ID (bytes 0-15)
    new Uint8Array(header).set(fileId, 0);
    // Set the Chunk Index (16 - 19) as a 32-bit unsigned int
    headerView.setUint32(16, chunkIndex, false);
    // Set Last Chunk flag (byte 20)
    headerView.setUint8(20, isLast ? 1 : 0);

    return header;
  }

  private parseHeaderFromBuffer(chunk: ArrayBuffer): ChunkHeader {
    const fileId = this.bytesToId(new Uint8Array(chunk, 0, 16));
    const viewer = new DataView(chunk);

    const chunkIndex = viewer.getUint32(16, false);
    const isLastByte = viewer.getUint8(20);

    return {
      chunkIndex,
      id: fileId,
      isFinal: isLastByte !== 0,
    };
  }

  private bytesToId(incoming: Uint8Array): string {
    return Array.from(incoming, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  }

  private uuidToBytes(rawId: ReturnType<typeof crypto.randomUUID>): Uint8Array {
    const id = rawId.replaceAll("-", "");
    const bytes = new Uint8Array(16);

    let j = 0;
    for (let i = 0; i < id.length; i += 2) {
      bytes[j++] = parseInt(id.substring(i, i + 2), 16);
    }

    return bytes;
  }

  private concatBuffers(...buffers: ArrayBuffer[]): ArrayBuffer {
    const totalLength = buffers.reduce((acc, curr) => acc + curr.byteLength, 0);
    const result = new Uint8Array(totalLength);

    let offset = 0;
    for (const buffer of buffers) {
      result.set(new Uint8Array(buffer), offset);
      offset += buffer.byteLength;
    }

    return result.buffer;
  }

  private parseMetadata<T extends JsonValue>(
    metadata: T,
    fileId: Uint8Array,
  ): ArrayBuffer {
    const encoder = new TextEncoder();
    const metadataBytes = encoder.encode(JSON.stringify(metadata)).buffer;

    const header = this.buildHeader(fileId, 0, false);

    return this.concatBuffers(header, metadataBytes);
  }
}
